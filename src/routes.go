package main

import (
	"net/http"

	"github.com/gorilla/mux"
)

// Route struct
type Route struct {
	Name        string
	Method      string
	Pattern     string
	HandlerFunc http.HandlerFunc
}

// Routes slice
type Routes []Route

const staticDirPathPrefix = "/static/"

// NewRouter factory
func NewRouter() *mux.Router {
	router := mux.NewRouter().StrictSlash(true)
	for _, route := range routes {

		var handler http.Handler

		handler = route.HandlerFunc
		handler = Logger(handler, route.Name)

		router.
			Methods(route.Method).
			Path(route.Pattern).
			Name(route.Name).
			Handler(handler)
	}

	router.NotFoundHandler = Logger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		NotFound(w, r)
	}), "404")

	router.
		PathPrefix(staticDirPathPrefix).
		Handler(http.StripPrefix(staticDirPathPrefix, http.FileServer(http.Dir(Config.App.AssetsDir))))

	return router
}

var routes = Routes{
	Route{
		Name:        "Index",
		Method:      "GET",
		Pattern:     "/",
		HandlerFunc: IndexAction,
	},
	Route{
		Name:        "Styleguide",
		Method:      "GET",
		Pattern:     "/styleguide",
		HandlerFunc: StyleguideAction,
	},
	Route{
		Name:        "NewMessage",
		Method:      "POST",
		Pattern:     "/",
		HandlerFunc: NewMessageAction,
	},
	Route{
		Name:        "ShowMessage",
		Method:      "GET",
		Pattern:     "/{token}/",
		HandlerFunc: ShowAction,
	},
	Route{
		Name:        "DeleteMessage",
		Method:      "DELETE",
		Pattern:     "/{token}/",
		HandlerFunc: DeleteMessageAction,
	},
	// Route{
	// 	Name:        "ListTodos",
	// 	Method:      "GET",
	// 	Pattern:     "/todos",
	// 	HandlerFunc: ListTodos,
	// },
	// Route{
	// 	Name:        "GetTodo",
	// 	Method:      "GET",
	// 	Pattern:     "/todos/{todoId}",
	// 	HandlerFunc: GetTodo,
	// },
}
