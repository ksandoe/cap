/**
 * DevLaunchPage.tsx — Local development entry point.
 *
 * In production, students arrive via a Canvas LTI launch and never see this
 * page. Locally, GET /api/dev/launch simulates that flow: it creates (or
 * resumes) a session for a synthetic dev identity and redirects back here
 * with a session token.
 */
export function DevLaunchPage() {
  return (
    <div style={{ padding: 48, maxWidth: 560, margin: '0 auto' }}>
      <h2 style={{ color: '#1D4E8C' }}>Conversational Assessment Platform</h2>
      <p style={{ color: '#444', lineHeight: 1.6 }}>
        Local development mode. Launching a module simulates the Canvas LTI
        launch: a session is created for a dev identity and you are taken to
        the student wizard.
      </p>
      <p style={{ color: '#888', fontSize: 14 }}>
        Relaunching the same module resumes your existing session if one is
        still active.
      </p>
      <a
        href="/api/dev/launch?moduleId=demo-sales-process"
        style={{
          display: 'inline-block', marginTop: 16, padding: '12px 24px',
          background: '#1D4E8C', color: '#fff', borderRadius: 6,
          textDecoration: 'none', fontWeight: 600,
        }}
      >
        Launch “The Sales Process” demo
      </a>
    </div>
  );
}
