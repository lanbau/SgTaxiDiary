package main

// TaxiAPIResponse matches the GeoJSON structure returned by data.gov.sg.
// We only need the first feature's coordinates — a list of [longitude, latitude] pairs.
type TaxiAPIResponse struct {
	Features []struct {
		Geometry struct {
			Coordinates [][]float64 `json:"coordinates"`
		} `json:"geometry"`
	} `json:"features"`
}

// TaxiUpdate is the message broadcast to every connected browser over WebSocket.
type TaxiUpdate struct {
	Timestamp   string      `json:"timestamp"`   // UTC fetch time, RFC3339 format
	Coordinates [][]float64 `json:"coordinates"` // [lng, lat] per available taxi
	Count       int         `json:"count"`       // total available taxis
}
