/**
 * ConsentPage.tsx — TODO: implement
 * Refer to user stories RES-01 through RES-03 and Master PRD Section 4.3 and 5.4.
 *
 * IMPORTANT: all data displayed here must be de-identified.
 * No direct student identifiers (name, email, Canvas UUID, SAP username)
 * may appear anywhere in this module. Data is linked by research cohort ID only.
 */
export function ConsentPage() {
  return (
    <div>
      <h2 style={{ color: '#1D4E8C' }}>ConsentPage</h2>
      <div style={{ background: '#FDF6E3', border: '1px solid #F0D9A0',
        borderRadius: 6, padding: '12px 16px', marginBottom: 20 }}>
        <strong style={{ color: '#854F0B', fontSize: 13 }}>IRB requirement</strong>
        <p style={{ color: '#854F0B', fontSize: 13, margin: '4px 0 0' }}>
          Research data is only available for modules with confirmed IRB approval.
          Contact your platform administrator to check approval status.
        </p>
      </div>
      <p style={{ color: '#888' }}>TODO: implement</p>
    </div>
  );
}
