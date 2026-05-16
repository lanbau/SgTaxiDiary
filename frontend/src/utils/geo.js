const EARTH_RADIUS_KM = 6371

// Haversine formula — returns straight-line distance in km between two lat/lng points.
// Good enough for short distances like "taxis within 1 km".
export function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a))
}

// Returns how many [lng, lat] coordinate pairs are within radiusKm of the given point.
export function countNearby(coordinates, lat, lng, radiusKm) {
  return coordinates.filter(([cLng, cLat]) => distanceKm(lat, lng, cLat, cLng) <= radiusKm).length
}

// Builds a GeoJSON Polygon that approximates a circle around [lat, lng] with the given radius.
// Used to draw the radius ring on the Mapbox map.
export function geojsonCircle(lat, lng, radiusKm, steps = 64) {
  const coords = []
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    const dLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI) * Math.cos(angle)
    const dLng = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI) * Math.sin(angle) / Math.cos((lat * Math.PI) / 180)
    coords.push([lng + dLng, lat + dLat])
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } }
}
