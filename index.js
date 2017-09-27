const path = require('path');
const fs = require('fs');

const express = require('express');
const bodyParser = require('body-parser');
const nunjucks = require('nunjucks');
const mysql = require('promise-mysql');
const randomstring = require("randomstring");
const md5 = require('md5');
const moment = require('moment');

const app = express();

//-----------------------------------------------------------------------------
// Load configuration file
let configurationFile = './parameters.json';

if (process.argv[2]) {
  configurationFile = process.argv[2];
}

const configuration = require(configurationFile);

//-----------------------------------------------------------------------------

let schemaFile = path.join(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaFile).toString();

// mysql connection setup
mysql.createConnection(configuration.database)
  .then((conn) => {
    conn.query(schemaSql);
    conn.end();
  })
  .catch((error) => {
    throw error;
  });

//-----------------------------------------------------------------------------

// express configuration
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')))

// View engine configuration
nunjucks.configure('views', {
    autoescape: true,
    express: app
});

app.set('view engine', 'nunjucks');


//-----------------------------------------------------------------------------

const delays = {
  '15': '15min',
  '30': '30min',
  '60': '1h',
  '120': '2h',
  '1440': '24h',
}

const MODE_MINUTES = 'minutes';
const MODE_SECONDS = 'seconds';

const getHashedIp = (req, token) => {
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  return md5(ip + token);
}

//-----------------------------------------------------------------------------

app.get('/', (req, res) => {
  res.render('index.nunjucks', { delays: delays});
});

//-----------------------------------------------------------------------------

// Create a new message from post data
app.post('/', (req, res) => {
  const message = req.body.message;
  const delay = delays[req.body.delay] && req.body.delay || 15;
  const token = randomstring.generate(64);
  const createdAt = new Date();

  const messageStruct = {
    text: message,
    token: token,
    mode: MODE_MINUTES,
    mode_value: delay,
    created_at: createdAt
  };

  mysql.createConnection(configuration.database)
    .then((conn) => {
      conn.query('INSERT INTO messages SET ?', messageStruct);
      conn.end();
    }).then(() => {
      return res.json({ success: true, token: token });
    }).catch(() => {
      console.error(error);
      return res.json({ success: false });
    });
});

//-----------------------------------------------------------------------------

// Cronable storage cleanup
app.get('/clear', (req, res) => {
  // remove all messages
  mysql.createConnection(configuration.database)
    .then((conn) => {
      conn.query('DELETE FROM messages WHERE active_until IS NOT NULL AND active_until < CURRENT_TIMESTAMP() OR created_at < DATE_SUB(NOW(), INTERVAL 1 MONTH)');
      conn.end();
    }).then(() => {
      return res.json({ success: true, message: 'Successfully cleared outdated messages' });
    }).catch((error) => {
      console.error(error);
      return res.json({ success: false });
    });
})

//-----------------------------------------------------------------------------

// Destroy message
app.delete('/destroy/:token/$', (req, res) => {

  const token = req.params.token;
  const clientIp = getHashedIp(req, token);

  mysql.createConnection(configuration.database)
    .then((conn) => {
      conn.query('DELETE FROM messages WHERE token = ? AND accessable_ip = ?', [token, clientIp]);
      conn.end();

      return true;
    }).then((success) => {
      return res.json({ success: success });
    }).catch((error) => {
      console.error(error);
      return res.json({ success: false, error: 'Not found' });
    });
})

//-----------------------------------------------------------------------------

// display a single message
app.get('/:token/$', (req, res) => {

  const token = req.params.token;
  const clientIp = getHashedIp(req, token);

  let connection;

  mysql.createConnection(configuration.database)
    .then((conn) => {
      connection = conn;

      return conn.query('SELECT * FROM messages WHERE token = ? AND active_until > CURRENT_TIMESTAMP() OR active_until IS NULL LIMIT 1', token);
    }).then((rows) => {
      if (rows.length === 0) throw 'Message not found';

      return rows[0];
    }).then((message) => {
      let accessableIp = message.accessable_ip;
      let createdAt = message.created_at;
      let delay = message.mode_value;

      // can access this message
      if (accessableIp && accessableIp !== clientIp) {
        throw 'Access denied';
      }

      let unit = message.mode === MODE_MINUTES ? 'm' : 's';

      const activeUntil = moment(createdAt).add(delay, unit).toDate();

      if (message.active_until === null) {
        connection.query('UPDATE messages SET ? WHERE token = ?', [{ active_until: activeUntil, accessable_ip: clientIp }, token]);
      }

      connection.end();

      return message;
    }).then((message) => {

      return res.render('show.nunjucks', {
        message: message.text,
        token: message.token,
        activeUntilTimestamp: (message.active_until*1),
        activeUntilDate: moment(message.active_until).format('MMMM Do YYYY, h:mm:ss a'),
        timeRemaining: moment(message.active_until).fromNow()
      });

    }).catch((error) => {
      connection && connection.end();
      console.error(error);
      return res.render('404');
    });
});

//-----------------------------------------------------------------------------

// 404 nothing found
app.use(function(req, res, next){
  res.status(404);

  res.format({
    html: function () {
      res.render('404');
    },
    json: function () {
      res.json({ error: 'Not found' });
    },
    default: function () {
      res.type('txt').send('Not found');
    }
  })
});

//-----------------------------------------------------------------------------

app.listen(configuration.server.port, () => {
  console.log(`Starting server on http://0.0.0.0:${configuration.server.port}`);
})
