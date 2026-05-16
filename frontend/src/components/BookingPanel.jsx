import { useState } from 'react'

const APPS = [
  { id: 'grab',          label: 'Grab',          color: '#00b14f' },
  { id: 'gojek',         label: 'Gojek',         color: '#00aed6' },
  { id: 'comfortdelgro', label: 'ComfortDelGro',  color: '#e63946' },
]

const S = {
  panel: {
    position: 'absolute', bottom: '40px', left: '20px',
    width: '260px',
    background: 'rgba(17,24,39,0.95)',
    border: '1px solid var(--border)',
    borderRadius: '14px',
    backdropFilter: 'blur(12px)',
    overflow: 'hidden',
    fontFamily: 'var(--font-mono)',
  },
  header: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
  },
  tab: (active) => ({
    flex: 1, padding: '10px 0', fontSize: '11px', textAlign: 'center',
    cursor: 'pointer', border: 'none', background: 'none',
    color: active ? '#f9fafb' : 'var(--muted)',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    fontFamily: 'var(--font-mono)',
  }),
  body: { padding: '14px' },
  label: { fontSize: '10px', color: 'var(--muted)', marginBottom: '8px' },
  appRow: { display: 'flex', gap: '6px', marginBottom: '12px' },
  appBtn: (selected, color) => ({
    flex: 1, padding: '7px 0', fontSize: '10px', borderRadius: '8px',
    border: `1px solid ${selected ? color : 'var(--border)'}`,
    background: selected ? `${color}22` : 'transparent',
    color: selected ? color : 'var(--muted)',
    cursor: 'pointer', fontFamily: 'var(--font-mono)',
  }),
  logBtn: (disabled) => ({
    width: '100%', padding: '9px', borderRadius: '8px',
    background: disabled ? 'rgba(255,255,255,0.05)' : 'var(--accent)',
    color: disabled ? 'var(--muted)' : '#0a0e1a',
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)',
  }),
  pendingItem: {
    background: 'rgba(255,255,255,0.04)', borderRadius: '8px',
    padding: '10px', marginBottom: '8px',
  },
  outcomeRow: { display: 'flex', gap: '6px', marginTop: '8px' },
  outcomeBtn: (variant) => ({
    flex: 1, padding: '6px', borderRadius: '6px', fontSize: '10px',
    border: `1px solid ${variant === 'success' ? '#00d4aa' : '#ef4444'}`,
    background: 'transparent',
    color: variant === 'success' ? '#00d4aa' : '#ef4444',
    cursor: 'pointer', fontFamily: 'var(--font-mono)',
  }),
  statRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '6px 0', borderBottom: '1px solid var(--border)',
    fontSize: '11px',
  },
  rateBar: (rate, color) => ({
    height: '4px', borderRadius: '2px', marginTop: '4px',
    background: `linear-gradient(to right, ${color} ${rate}%, rgba(255,255,255,0.08) ${rate}%)`,
  }),
}

function RateGroup({ title, rows }) {
  if (!rows.length) return null
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '6px' }}>{title}</div>
      {rows.map(({ label, rate, total }) => (
        <div key={label} style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#f9fafb' }}>
            <span>{label}</span>
            <span style={{ color: rate >= 70 ? '#00d4aa' : rate >= 40 ? '#facc15' : '#ef4444' }}>
              {rate}% <span style={{ color: 'var(--muted)' }}>({total})</span>
            </span>
          </div>
          <div style={S.rateBar(rate, rate >= 70 ? '#00d4aa' : rate >= 40 ? '#facc15' : '#ef4444')} />
        </div>
      ))}
    </div>
  )
}

export default function BookingPanel({ location, nearbyCount, totalCount, bookingLog }) {
  const [tab, setTab] = useState('log')
  const [selectedApp, setSelectedApp] = useState(null)
  const { logs, addLog, resolveLog, deleteLog, stats } = bookingLog

  const pending = logs.filter(l => l.outcome === 'pending')
  const canLog = selectedApp && location

  const handleLog = () => {
    if (!canLog) return
    addLog({ app: selectedApp, location, nearbyCount, totalCount })
  }

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <button style={S.tab(tab === 'log')}     onClick={() => setTab('log')}>
          LOG {pending.length > 0 && `(${pending.length})`}
        </button>
        <button style={S.tab(tab === 'insights')} onClick={() => setTab('insights')}>INSIGHTS</button>
      </div>

      {tab === 'log' && (
        <div style={S.body}>
          <div style={S.label}>BOOKING APP</div>
          <div style={S.appRow}>
            {APPS.map(a => (
              <button key={a.id} style={S.appBtn(selectedApp === a.id, a.color)} onClick={() => setSelectedApp(a.id)}>
                {a.label}
              </button>
            ))}
          </div>

          <div style={{ ...S.label, display: 'flex', justifyContent: 'space-between' }}>
            <span>SNAPSHOT</span>
          </div>
          <div style={{ fontSize: '11px', color: '#f9fafb', marginBottom: '12px' }}>
            <span style={{ color: 'var(--muted)' }}>Nearby  </span>{nearbyCount ?? '—'}<br />
            <span style={{ color: 'var(--muted)' }}>Total   </span>{totalCount?.toLocaleString() ?? '—'}<br />
            <span style={{ color: 'var(--muted)' }}>Location </span>
            {location ? `${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}` : 'waiting…'}
          </div>

          <button style={S.logBtn(!canLog)} onClick={handleLog} disabled={!canLog}>
            {location ? 'LOG BOOKING NOW' : 'WAITING FOR LOCATION…'}
          </button>

          {pending.length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <div style={S.label}>PENDING OUTCOME</div>
              {pending.map(l => {
                const app = APPS.find(a => a.id === l.app)
                return (
                  <div key={l.id} style={S.pendingItem}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                      <span style={{ color: app?.color }}>{app?.label}</span>
                      <span style={{ color: 'var(--muted)' }}>
                        {new Date(l.timestamp).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                      {l.nearbyCount} nearby · {l.totalCount?.toLocaleString()} total
                    </div>
                    <div style={S.outcomeRow}>
                      <button style={S.outcomeBtn('success')} onClick={() => resolveLog(l.id, 'success')}>✓ Got taxi</button>
                      <button style={S.outcomeBtn('failed')}  onClick={() => resolveLog(l.id, 'failed')}>✗ No taxi</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'insights' && (
        <div style={S.body}>
          {stats.total === 0 ? (
            <div style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
              No logs yet. Start booking to build your success-rate history.
            </div>
          ) : (
            <>
              {/* Overall */}
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', color: 'var(--muted)' }}>OVERALL SUCCESS RATE</div>
                <div style={{
                  fontSize: '36px', fontWeight: 800, lineHeight: 1.2,
                  fontFamily: 'var(--font-display)',
                  color: stats.overallRate === null ? 'var(--muted)'
                       : stats.overallRate >= 70   ? '#00d4aa'
                       : stats.overallRate >= 40   ? '#facc15' : '#ef4444',
                }}>
                  {stats.overallRate !== null ? `${stats.overallRate}%` : '—'}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--muted)' }}>
                  {stats.resolved} resolved · {stats.total - stats.resolved} pending
                </div>
              </div>

              <RateGroup title="BY TIME OF DAY"    rows={stats.byTime} />
              <RateGroup title="BY NEARBY TAXIS"   rows={stats.byNearby} />
              <RateGroup title="BY APP"             rows={stats.byApp} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
