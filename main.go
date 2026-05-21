package main

import (
	"log"
	"net/http"
)

func main() {
	log.Println("Server starting on :5173")
	http.ListenAndServe(":5173", http.FileServer(http.Dir(".")))
}
