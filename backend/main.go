package main

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

// upgrader promotes a plain HTTP request to a persistent WebSocket connection.
// CheckOrigin returning true accepts connections from any domain (fine for dev/demo).
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// wsHandler runs when a browser opens ws://localhost:8080/ws.
// It upgrades the connection, registers it with the hub, and starts a read loop
// so we can detect when the browser disconnects.
func wsHandler(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Upgrade error: %v", err)
		return
	}

	hub.register(conn)

	// Read loop — we don't expect messages from the browser, but reading is how
	// WebSocket detects a closed tab or network drop.
	go func() {
		defer hub.unregister(conn)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				break
			}
		}
	}()
}

func main() {
	// newHub can be used without importing because hub.go shares package main
	hub := newHub()

	go hub.broadcastLoop() // fan out updates to all browsers
	go pollTaxiAPI(hub)    // fetch fresh taxi data every 30s

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		wsHandler(hub, w, r)
	})

	// /health lets Docker / Kubernetes know the server is up.
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	log.Println("Go WebSocket server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
