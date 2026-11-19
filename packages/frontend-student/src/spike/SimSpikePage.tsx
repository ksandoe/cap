import { ThemeProvider } from '@ui5/webcomponents-react';
import '@ui5/webcomponents-icons/dist/AllIcons.js';
import SimApp from '@cap/sim-web/src/App';
import './sim.scoped-source.css';

// Spike only: the simulator inside a CAP page (scoped css), above the same simulator standalone in
// an iframe (plain css, no CAP css). Same width, so computed styles can be compared in the browser.
export default function SimSpikePage() {
  return (
    <div style={{ padding: 8 }}>
      <h2>Embedded (scoped css, inside CAP)</h2>
      <ThemeProvider>
        <div id="embedded" className="sim-root" style={{ width: 1000, border: '1px dashed #999' }}>
          <SimApp />
        </div>
      </ThemeProvider>
      <h2>Standalone baseline (iframe)</h2>
      <iframe id="standalone" src="/sim-standalone.html" title="standalone" style={{ width: 1000, height: 900, border: '1px dashed #999' }} />
    </div>
  );
}
