/**
 * SapPoolPage.tsx
 * Displays SAP account pool status and management controls.
 * Refer to user stories ADM-02 and ADM-03.
 *
 * Shows: total / available / in_use / stale counts.
 * Actions: bulk import (CSV), force-release stale accounts.
 *
 * TODO: implement — fetch from GET /admin/sap-pool/status
 */
export function SapPoolPage() {
  return (
    <div>
      <h2 style={{ color: '#1D4E8C', marginBottom: 24 }}>SAP account pool</h2>

      {/* Status summary — TODO: replace with live data */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total accounts', value: '—', color: '#1D4E8C' },
          { label: 'Available',      value: '—', color: '#085041' },
          { label: 'In use',         value: '—', color: '#854F0B' },
          { label: 'Stale locks',    value: '—', color: '#8B2500' },
        ].map(stat => (
          <div key={stat.label} style={{ flex: 1, background: '#fff',
            border: '1px solid #ddd', borderRadius: 6, padding: '16px 20px' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
        <button style={{ background: '#1D4E8C', color: '#fff', border: 'none',
          borderRadius: 4, padding: '9px 20px', fontSize: 14, cursor: 'pointer' }}>
          Import accounts (CSV)
        </button>
        <button style={{ background: '#FDF6E3', color: '#854F0B', border: '1px solid #F0D9A0',
          borderRadius: 4, padding: '9px 20px', fontSize: 14, cursor: 'pointer' }}>
          Release stale locks
        </button>
      </div>

      <p style={{ color: '#aaa', fontSize: 13 }}>
        TODO: load account table from DynamoDB via /admin/sap-pool/status.
        Flag accounts where assignedAt &gt; session TTL as stale.
      </p>
    </div>
  );
}
