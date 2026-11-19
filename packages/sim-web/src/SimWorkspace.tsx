import { useEffect, useState, type CSSProperties } from 'react';
import { ThemeProvider } from '@ui5/webcomponents-react';
// Registers every icon in the "SAP-icons" collection; without it <Icon name="..."> renders blank.
import '@ui5/webcomponents-icons/dist/AllIcons.js';
import type { PublicAssignmentInstance, SimApi } from '@cap/sim-shared';
import { SimApiProvider } from './simApi';
import { EmbeddedContext } from './embedded';
import EasyAccessMenu, { type MenuDestination } from './components/EasyAccessMenu';
import StatusBar, { type StatusMessage } from './components/StatusBar';
import VA11Inquiry from './activities/VA11Inquiry';
import VA21Quotation from './activities/VA21Quotation';
import VA01Order from './activities/VA01Order';
import VA03Display from './activities/VA03Display';
import './index.css';

type Screen = 'menu' | 'VA11' | 'VA21' | 'VA01' | 'VA03';

const SALES = ['Logistics', 'Sales and Distribution', 'Sales'];
const TRANSACTIONS: { screen: Exclude<Screen, 'menu'>; path: string[] }[] = [
  { screen: 'VA11', path: [...SALES, 'Inquiry', 'Create'] },
  { screen: 'VA21', path: [...SALES, 'Quotation', 'Create'] },
  { screen: 'VA01', path: [...SALES, 'Order', 'Create'] },
  { screen: 'VA03', path: [...SALES, 'Order', 'Display'] },
];

export interface SimWorkspaceProps {
  /** The simulator's data access. In CAP this is `createCapSimApi({ baseUrl, getToken })`. */
  api: SimApi;
  className?: string;
  style?: CSSProperties;
}

/**
 * The simulated SAP session without any exercise around it: the Easy Access menu, the transactions
 * (VA11, VA21, VA01, VA03) in any order, and the status bar. The instructions belong to the host page
 * (CAP's recipe pane), so there is no intro, background or conclusion here.
 *
 * It fills the box its parent gives it (the parent needs a height for the SAP screen to scroll inside;
 * without one it grows with its content). Everything it styles is inside its own `.sim-root`.
 */
export default function SimWorkspace({ api, className, style }: SimWorkspaceProps) {
  return (
    <div className={`sim-root sim-workspace${className ? ` ${className}` : ''}`} style={style}>
      <ThemeProvider>
        <SimApiProvider api={api}>
          <EmbeddedContext.Provider value={true}>
            <Session api={api} />
          </EmbeddedContext.Provider>
        </SimApiProvider>
      </ThemeProvider>
    </div>
  );
}

function Session({ api }: { api: SimApi }) {
  const [instance, setInstance] = useState<PublicAssignmentInstance | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [screen, setScreen] = useState<Screen>('menu');
  const [status, setStatus] = useState<StatusMessage | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getInstance()
      .then((inst) => {
        if (cancelled) return;
        setInstance(inst);
        api.logEvent('assignment_started', { assignmentId: inst.assignmentId });
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [api]);

  const open = (next: Exclude<Screen, 'menu'>) => () => {
    api.logEvent('menu_navigated', { transaction: next });
    setStatus(null);
    setScreen(next);
  };
  // Leaving a transaction keeps the status bar as it is: the saved document's number stays visible.
  const exit = () => setScreen('menu');

  const destinations: MenuDestination[] = TRANSACTIONS.map((t) => ({ path: t.path, onOpen: open(t.screen) }));

  let content: JSX.Element;
  if (loadError) content = <p>The simulator could not be loaded. Reload the page to try again.</p>;
  else if (!instance) content = <p>Loading…</p>;
  else if (screen === 'VA11')
    content = (
      <VA11Inquiry
        instance={instance}
        skipMenu
        onExit={exit}
        onDocumentSaved={(doc) => setStatus({ text: `Inquiry ${doc.id} has been saved.`, kind: 'success' })}
        onSaved={exit}
      />
    );
  else if (screen === 'VA21')
    content = (
      <VA21Quotation
        instance={instance}
        skipMenu
        onExit={exit}
        onStatus={setStatus}
        onDocumentSaved={(doc) => setStatus({ text: `Quotation ${doc.id} has been saved.`, kind: 'success' })}
        onSaved={exit}
      />
    );
  else if (screen === 'VA01')
    content = (
      <VA01Order
        instance={instance}
        skipMenu
        onExit={exit}
        onStatus={setStatus}
        onDocumentSaved={(doc) => setStatus({ text: `Standard Order ${doc.id} has been saved.`, kind: 'success' })}
        onSaved={exit}
      />
    );
  else if (screen === 'VA03') content = <VA03Display onStatus={setStatus} onExit={exit} />;
  else content = <EasyAccessMenu destinations={destinations} />;

  return (
    <>
      <div className="sim-workspace-body">{content}</div>
      <StatusBar message={status} />
    </>
  );
}
