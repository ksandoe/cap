import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@ui5/webcomponents-react';
import type { ActivityLayoutMode } from '@sap-sim/shared';

const BREAKPOINT_PX = 1024; // §10b — placeholder, open question in §8
const STORAGE_KEY = 'sap-sim-layout-mode';

function defaultModeForWidth(width: number): ActivityLayoutMode {
  return width >= BREAKPOINT_PX ? 'side-by-side' : 'tabbed';
}

/**
 * §10b: instructions and the simulated screen stay on the same step regardless of layout —
 * this component only changes what's visible/arranged, never remounts either pane.
 */
export default function ActivityLayout({
  instructions,
  screen,
}: {
  instructions: ReactNode;
  screen: ReactNode;
}) {
  const [mode, setMode] = useState<ActivityLayoutMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ActivityLayoutMode | null;
    return stored ?? defaultModeForWidth(window.innerWidth);
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'instructions' | 'screen'>('instructions');

  useEffect(() => {
    const onResize = () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) setMode(defaultModeForWidth(window.innerWidth));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function chooseMode(next: ActivityLayoutMode) {
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <div>
      <div className="layout-toggle">
        {(['side-by-side', 'tabbed', 'drawer'] as const).map((m) => (
          <Button key={m} design={mode === m ? 'Emphasized' : 'Transparent'} onClick={() => chooseMode(m)}>
            {m}
          </Button>
        ))}
      </div>

      {mode === 'side-by-side' && (
        <div className="activity-layout">
          <div className="activity-pane instructions-pane">{instructions}</div>
          <div className="activity-pane screen-pane" style={{ flex: 1.3 }}>
            {screen}
          </div>
        </div>
      )}

      {mode === 'tabbed' && (
        <div>
          <div className="layout-toggle">
            <Button design={activeTab === 'instructions' ? 'Emphasized' : 'Transparent'} onClick={() => setActiveTab('instructions')}>
              Instructions
            </Button>
            <Button design={activeTab === 'screen' ? 'Emphasized' : 'Transparent'} onClick={() => setActiveTab('screen')}>
              SAP Screen
            </Button>
          </div>
          {/* Both panes stay mounted; only visibility toggles, so neither loses state. */}
          <div className="instructions-pane" style={{ display: activeTab === 'instructions' ? 'block' : 'none' }}>
            {instructions}
          </div>
          <div className="screen-pane" style={{ display: activeTab === 'screen' ? 'block' : 'none' }}>
            {screen}
          </div>
        </div>
      )}

      {mode === 'drawer' && (
        <div style={{ position: 'relative' }}>
          <Button design="Transparent" onClick={() => setDrawerOpen((v) => !v)} style={{ marginBottom: 8 }}>
            {drawerOpen ? 'Hide instructions' : 'Show instructions'}
          </Button>
          {drawerOpen && (
            <div className="instructions-pane" style={{ marginBottom: 12 }}>
              {instructions}
            </div>
          )}
          <div className="screen-pane">{screen}</div>
        </div>
      )}
    </div>
  );
}
