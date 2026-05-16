import { useState, useEffect } from 'react'

// Asks the browser for the user's current position.
// Returns { location: { lat, lng } | null, error: string | null }
export function useGeolocation() {
  const [location, setLocation] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by this browser')
      return
    }

    // watchPosition keeps updating as the user moves (unlike getCurrentPosition which fires once).
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  return { location, error }
}
