package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// pollTaxiAPI fetches live taxi positions from data.gov.sg every 30 seconds
// and pushes each result onto hub.broadcast for broadcastLoop to forward to browsers.
// Runs in its own goroutine started from main().
func pollTaxiAPI(hub *Hub) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	fetch := func() {
		resp, err := http.Get("https://api.data.gov.sg/v1/transport/taxi-availability")
		if err != nil {
			log.Printf("Taxi API error: %v", err)
			return
		}
		defer resp.Body.Close()

		var apiResp TaxiAPIResponse
		if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
			log.Printf("JSON decode error: %v", err)
			return
		}

		if len(apiResp.Features) == 0 {
			return
		}

		coords := apiResp.Features[0].Geometry.Coordinates
		update := TaxiUpdate{
			Timestamp:   time.Now().UTC().Format(time.RFC3339),
			Coordinates: coords,
			Count:       len(coords),
		}

		log.Printf("Fetched %d taxis at %s", update.Count, update.Timestamp)
		hub.broadcast <- update
	}

	fetch() // fetch immediately on startup, then every 30s
	for range ticker.C {
		fetch()
	}
}
