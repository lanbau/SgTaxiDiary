package main

import (
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// Hub is the message bus between the API poller and connected browsers.
// One poller pushes updates → Hub fans them out to every open WebSocket connection.
type Hub struct {
	clients   map[*websocket.Conn]bool // set of active browser connections
	broadcast chan TaxiUpdate           // poller sends here; broadcastLoop reads from here
	mu        sync.Mutex               // guards `clients` against concurrent access
}

func newHub() *Hub {
	return &Hub{
		clients:   make(map[*websocket.Conn]bool),
		broadcast: make(chan TaxiUpdate, 10), // buffer of 10 so the poller never blocks
	}
}

// register adds a newly connected browser to the hub.
func (h *Hub) register(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[conn] = true
	log.Printf("Client connected. Total: %d", len(h.clients))
}

// unregister removes a disconnected browser and closes its connection.
func (h *Hub) unregister(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, conn)
	conn.Close()
	log.Printf("Client disconnected. Total: %d", len(h.clients))
}

// broadcastLoop runs forever in a goroutine.
// Each update is sent to every client in its own goroutine so a slow browser can't block others.


/*
data.gov.sg
     │
     ▼
 pollTaxiAPI          ← one producer
     │
     │  sends to channel
     ▼
 h.broadcast
     │
     ▼
 broadcastLoop        ← one consumer reads from channel
     │
     ├──▶ browser 1 (goroutine)
     ├──▶ browser 2 (goroutine)
     └──▶ browser 3 (goroutine)   ← many receivers
*/

// * Hub is a pointer to memory
func (h *Hub) broadcastLoop() {
	// range over a channel blocks here until a value arrives.
	// `update` is the TaxiUpdate the poller just sent.
	for update := range h.broadcast {

		// Lock so no browser connects or disconnects while we're looping over clients.
		h.mu.Lock()

		// Loop over every currently connected browser.
		for conn := range h.clients {

			// Spin up a goroutine per client so writes are fully independent.
			// If one browser is slow or frozen, it won't hold up the others.
			//
			// conn and update are passed as arguments (not captured from the outer scope)
			// to avoid a classic Go closure bug where all goroutines would share the
			// same loop variable by the time they actually run.
			go func(c *websocket.Conn, u TaxiUpdate) {

				// Serialize u to JSON and write it down the WebSocket connection.
				if err := c.WriteJSON(u); err != nil {
					// Write failed — the browser likely closed the tab or lost network.
					log.Printf("Write error: %v", err)
					h.unregister(c) // remove it from the hub and close the connection
				}

			}(conn, update) // ← pass current conn and update as arguments right now
		}

		h.mu.Unlock() // release the lock so new connections can register while we wait for the next update
	}
}
