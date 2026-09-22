/**
 * HealthPage.tsx
 * Integration health dashboard — Canvas, SAP, Credly, Anthropic.
 * Status derived from recent audit log entries (no active polling).
 * Refer to user story ADM-07.
 *
 * TODO: fetch from GET /admin/health
 */
const INTEGRATIONS = ['Canvas LMS', 'SAP Sandbox', 'Credly', 'Anthropic API'];

export function HealthPage() {
  return (
    <div>
      <h2 style={{ color: '#1D4E8C', marginBottom: 24 }}>Integration health</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {INTEGRATIONS.map(name => (
          <div key={name} style={{ background: '#fff', border: '1px solid #ddd',
            borderRadius: 6, padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: '#333' }}>{name}</span>
              <span style={{ background: '#F5F5F4', color: '#888', fontSize: 12,
                borderRadius: 20, padding: '2px 10px', fontWeight: 500 }}>
                UNKNOWN
              </span>
            </div>
            <p style={{ color: '#aaa', fontSize: 12, marginTop: 8 }}>
              TODO: last successful call — never · last error — never
            </p>
          </div>
        ))}
      </div>
      <p style={{ color: '#aaa', fontSize: 13, marginTop: 20 }}>
        Status is inferred from audit log entries. No active polling is performed.
      </p>
    </div>
  );
}
