import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useGeolocation } from './hooks/useGeolocation'
import { useBookingLog } from './hooks/useBookingLog'
import { countNearby, geojsonCircle } from './utils/geo'
import BookingPanel from './components/BookingPanel'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws'
const SINGAPORE_CENTER = [103.8198, 1.3521]
const NEARBY_RADIUS_KM = 2 // taxis within this radius count as "nearby"

export default function App() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const taxiMarkersRef = useRef([])
  const userMarkerRef = useRef(null)
  const coordinatesRef = useRef([]) // latest taxi coords, readable by the geo effect
  const ws = useRef(null)

  const [mapReady, setMapReady] = useState(false)
  const [status, setStatus] = useState('connecting')
  const [taxiCount, setTaxiCount] = useState(0)
  const [nearbyCount, setNearbyCount] = useState(null) // null = location not granted yet
  const [lastUpdated, setLastUpdated] = useState(null)
  const [reconnectCount, setReconnectCount] = useState(0)

  const { location, error: geoError } = useGeolocation()
  const bookingLog = useBookingLog()

  // ── Map init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (map.current || !mapContainer.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: SINGAPORE_CENTER,
      zoom: 11.5,
      attributionControl: false,
    })

    map.current.addControl(new mapboxgl.NavigationControl(), 'bottom-right')
    map.current.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
    map.current.once('load', () => setMapReady(true))

    return () => {
      map.current?.remove()
      map.current = null
      userMarkerRef.current = null
      setMapReady(false)
    }
  }, [])

  // ── Fly to user location ─────────────────────────────────────────────────

  const flyToUser = useCallback((loc = location) => {
    if (!loc || !map.current) return
    map.current.flyTo({ center: [loc.lng, loc.lat], zoom: 14, duration: 1200 })
  }, [location])

  // ── User location marker + radius circle ────────────────────────────────

  useEffect(() => {
    if (!location || !mapReady || !map.current) return

    setNearbyCount(countNearby(coordinatesRef.current, location.lat, location.lng, NEARBY_RADIUS_KM))

    const circle = geojsonCircle(location.lat, location.lng, NEARBY_RADIUS_KM)

    const addOrUpdateCircle = () => {
      if (map.current.getSource('user-radius')) {
        map.current.getSource('user-radius').setData(circle)
      } else {
        map.current.addSource('user-radius', { type: 'geojson', data: circle })
        map.current.addLayer({
          id: 'user-radius-fill',
          type: 'fill',
          source: 'user-radius',
          paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.08 },
        })
        map.current.addLayer({
          id: 'user-radius-stroke',
          type: 'line',
          source: 'user-radius',
          paint: { 'line-color': '#ef4444', 'line-width': 1.5, 'line-opacity': 0.6, 'line-dasharray': [4, 3] },
        })
      }
    }

    const addOrUpdateMarker = () => {
      if (userMarkerRef.current) {
        userMarkerRef.current.setLngLat([location.lng, location.lat])
        return
      }
      const el = document.createElement('div')
      el.className = 'user-marker'
      userMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([location.lng, location.lat])
        .addTo(map.current)
      // Fly to user on the very first location fix
      flyToUser(location)
    }

    // mapReady is true so the style is loaded — safe to add sources/layers directly
    addOrUpdateCircle()
    addOrUpdateMarker()
  }, [location, mapReady, flyToUser])

  // ── Taxi markers ─────────────────────────────────────────────────────────

  const updateMarkers = useCallback((coordinates) => {
    taxiMarkersRef.current.forEach(m => m.remove())
    taxiMarkersRef.current = []

    coordinates.forEach(([lng, lat]) => {
      const el = document.createElement('div')
      el.className = 'taxi-marker'

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(new mapboxgl.Popup({ offset: 12, closeButton: false })
          .setHTML(`<div style="font-family:monospace;font-size:11px;color:#00d4aa">
            📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}
          </div>`))
        .addTo(map.current)

      taxiMarkersRef.current.push(marker)
    })
  }, [])

  // ── WebSocket ─────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return

    const socket = new WebSocket(WS_URL)
    ws.current = socket

    socket.onopen = () => { setStatus('live') }

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        coordinatesRef.current = data.coordinates // keep ref in sync for geo calculations
        setTaxiCount(data.count)
        setLastUpdated(new Date(data.timestamp))

        // Update nearby count if we already have a location
        if (location) {
          setNearbyCount(countNearby(data.coordinates, location.lat, location.lng, NEARBY_RADIUS_KM))
        }

        if (map.current?.isStyleLoaded()) updateMarkers(data.coordinates)
      } catch (e) {
        console.error('Parse error:', e)
      }
    }

    socket.onclose = () => {
      setStatus('reconnecting')
      setReconnectCount(c => c + 1)
      setTimeout(connect, 3000)
    }

    socket.onerror = () => { setStatus('error'); socket.close() }
  }, [updateMarkers, location])

  useEffect(() => {
    connect()
    return () => ws.current?.close()
  }, [connect])

  // ── Status helpers ────────────────────────────────────────────────────────

  const statusColor = { live: '#00d4aa', connecting: '#facc15', reconnecting: '#ff6b35', error: '#ef4444' }[status]
  const statusLabel = { live: 'LIVE', connecting: 'CONNECTING', reconnecting: `RECONNECTING (${reconnectCount})`, error: 'ERROR' }[status]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100vw', height: '100vh', position: 'absolute', top: 0, left: 0 }} />

      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(to bottom, rgba(10,14,26,0.95), transparent)',
        pointerEvents: 'none',
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, letterSpacing: '0.05em', color: '#f9fafb' }}>
            🚕 SG TAXI TRACKER
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
            Real-time · data.gov.sg · Mapbox
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'rgba(17,24,39,0.85)',
          border: `1px solid ${statusColor}33`,
          borderRadius: '999px', padding: '6px 14px',
          pointerEvents: 'auto',
        }}>
          <div style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: statusColor, boxShadow: `0 0 8px ${statusColor}`,
            animation: status === 'live' ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: statusColor }}>{statusLabel}</span>
        </div>
      </div>

      {/* Stats panel */}
      <div style={{
        position: 'absolute', top: '80px', left: '20px',
        background: 'rgba(17,24,39,0.9)',
        border: '1px solid var(--border)',
        borderRadius: '12px', padding: '16px 20px', minWidth: '180px',
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>AVAILABLE TAXIS</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '36px', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
          {taxiCount.toLocaleString()}
        </div>

        {/* Nearby count — only shown once location is granted */}
        <div style={{
          marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '10px',
          fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)',
        }}>
          {nearbyCount !== null ? (
            <>
              NEARBY ({NEARBY_RADIUS_KM} km)<br />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800, color: nearbyCount > 0 ? 'var(--accent)' : '#ef4444', lineHeight: 1.4 }}>
                {nearbyCount}
              </span>
            </>
          ) : (
            <span style={{ color: geoError ? '#ef4444' : 'var(--muted)' }}>
              {geoError ? 'Location denied' : 'Allow location\nfor nearby count'}
            </span>
          )}
        </div>

        {lastUpdated && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
            Updated<br />
            <span style={{ color: 'var(--text)' }}>{lastUpdated.toLocaleTimeString('en-SG')}</span>
          </div>
        )}

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', marginTop: '8px' }}>
          Refreshes every 30s
        </div>
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: '40px', right: '60px',
        background: 'rgba(17,24,39,0.85)', border: '1px solid var(--border)',
        borderRadius: '8px', padding: '10px 14px',
        display: 'flex', flexDirection: 'column', gap: '6px',
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px rgba(0,212,170,0.6)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>Available taxi</span>
        </div>
        {location && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px rgba(239,68,68,0.6)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>Your location</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '2px', background: '#3b82f6', opacity: 0.6 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>{NEARBY_RADIUS_KM} km radius</span>
            </div>
          </>
        )}
      </div>

      {/* Booking log panel */}
      <BookingPanel
        location={location}
        nearbyCount={nearbyCount}
        totalCount={taxiCount}
        bookingLog={bookingLog}
      />

      {/* Refocus button — only visible once location is granted */}
      {location && (
        <button
          onClick={() => flyToUser()}
          title="Re-center on my location"
          style={{
            position: 'absolute', bottom: '120px', right: '10px',
            width: '36px', height: '36px',
            background: 'rgba(17,24,39,0.9)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
            color: '#3b82f6',
            fontSize: '16px',
          }}
        >
          ◎
        </button>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .taxi-marker {
          width: 8px; height: 8px;
          background: #00d4aa;
          border-radius: 50%;
          border: 1.5px solid rgba(0,212,170,0.4);
          box-shadow: 0 0 6px rgba(0,212,170,0.6);
          cursor: pointer;
        }

        /* Single element — box-shadow grows outward so the dot itself never fades */
        .user-marker {
          width: 14px; height: 14px;
          background: #ef4444;
          border-radius: 50%;
          border: 2.5px solid white;
          box-shadow: 0 0 0 0 rgba(239,68,68,0.5);
          animation: pulse-ring 2s ease-out infinite;
        }
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0   rgba(239,68,68,0.5); }
          100% { box-shadow: 0 0 0 14px rgba(239,68,68,0); }
        }

        .mapboxgl-popup-content {
          background: #111827 !important;
          border: 1px solid #1f2937 !important;
          border-radius: 8px !important;
          padding: 8px 12px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
        }
        .mapboxgl-popup-tip { display: none; }
      `}</style>
    </div>
  )
}
