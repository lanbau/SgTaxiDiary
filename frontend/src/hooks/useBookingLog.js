import { useState, useMemo } from 'react'

const STORAGE_KEY = 'taxi-booking-logs'

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

function save(logs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
}

function timeOfDay(isoString) {
  const h = new Date(isoString).getHours()
  if (h >= 6  && h < 10) return 'Morning (6–10am)'
  if (h >= 10 && h < 16) return 'Midday (10am–4pm)'
  if (h >= 16 && h < 20) return 'Evening (4–8pm)'
  if (h >= 20 && h < 24) return 'Night (8pm–12am)'
  return 'Late night (12–6am)'
}

function nearbyBucket(n) {
  if (n <= 5)  return '0–5 nearby'
  if (n <= 15) return '6–15 nearby'
  return '16+ nearby'
}

// Computes success rates grouped by a key function — only resolved logs count.
function ratesByGroup(logs, keyFn) {
  const groups = {}
  for (const l of logs) {
    if (l.outcome === 'pending') continue
    const k = keyFn(l)
    if (!groups[k]) groups[k] = { success: 0, total: 0 }
    groups[k].total++
    if (l.outcome === 'success') groups[k].success++
  }
  return Object.entries(groups).map(([label, { success, total }]) => ({
    label,
    rate: Math.round((success / total) * 100),
    total,
  })).sort((a, b) => b.total - a.total)
}

export function useBookingLog() {
  const [logs, setLogs] = useState(load)

  const addLog = ({ app, location, nearbyCount, totalCount }) => {
    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      app,
      location,
      nearbyCount,
      totalCount,
      outcome: 'pending',
    }
    const updated = [entry, ...logs]
    save(updated)
    setLogs(updated)
    return entry.id
  }

  const resolveLog = (id, outcome) => {
    const updated = logs.map(l => l.id === id ? { ...l, outcome } : l)
    save(updated)
    setLogs(updated)
  }

  const deleteLog = (id) => {
    const updated = logs.filter(l => l.id !== id)
    save(updated)
    setLogs(updated)
  }

  const stats = useMemo(() => {
    const resolved = logs.filter(l => l.outcome !== 'pending')
    const successes = resolved.filter(l => l.outcome === 'success')
    return {
      total: logs.length,
      resolved: resolved.length,
      overallRate: resolved.length ? Math.round((successes.length / resolved.length) * 100) : null,
      byTime:    ratesByGroup(logs, l => timeOfDay(l.timestamp)),
      byNearby:  ratesByGroup(logs, l => nearbyBucket(l.nearbyCount)),
      byApp:     ratesByGroup(logs, l => l.app),
    }
  }, [logs])

  return { logs, addLog, resolveLog, deleteLog, stats }
}
