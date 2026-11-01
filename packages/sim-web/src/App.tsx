import { useEffect, useState } from 'react';
import { Button, Title } from '@ui5/webcomponents-react';
import type { AssignmentInstance, SalesDocument } from '@sap-sim/shared';
import { getStudentKey } from './studentKey';
import { getAssignmentInstance, getFlowProgress, listDocuments, saveFlowProgress, logEvent } from './api';
import { inquiryLeadIn, orderLeadIn, quotationLeadIn, assignedProductsSentence } from './content/leadIn';
import StatusBar from './components/StatusBar';
import BackgroundBlock from './blocks/BackgroundBlock';
import ConclusionBlock from './blocks/ConclusionBlock';
import VA11Inquiry from './activities/VA11Inquiry';
import VA21Quotation from './activities/VA21Quotation';
import VA01Order from './activities/VA01Order';

// The 8 blocks — docs/architecture-proposal.md §10a.
const BLOCK_LABELS = [
  'Intro',
  'Inquiry: Background',
  'Inquiry: Activity',
  'Quotation: Background',
  'Quotation: Activity',
  'Order: Background',
  'Order: Activity',
  'Conclusion',
];

export default function App() {
  const [studentKey] = useState(getStudentKey);
  const [instance, setInstance] = useState<AssignmentInstance | null>(null);
  const [docs, setDocs] = useState<{ inquiry?: SalesDocument; quotation?: SalesDocument; order?: SalesDocument }>({});
  const [current, setCurrent] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [inst, progress, allDocs] = await Promise.all([
        getAssignmentInstance(studentKey),
        getFlowProgress(studentKey),
        listDocuments(studentKey),
      ]);
      setInstance(inst);
      logEvent(studentKey, 'assignment_started', { assignmentId: inst.assignmentId });

      const byType: typeof docs = {};
      for (const d of allDocs) {
        if (d.status !== 'complete') continue;
        if (d.docType === 'inquiry') byType.inquiry = d;
        if (d.docType === 'quotation') byType.quotation = d;
        if (d.docType === 'order') byType.order = d;
      }
      setDocs(byType);

      let derivedFurthest = 0;
      if (byType.inquiry) derivedFurthest = 3;
      if (byType.quotation) derivedFurthest = 5;
      if (byType.order) derivedFurthest = 7;
      const initialFurthest = Math.max(progress.furthestBlockIndex, derivedFurthest);
      setFurthest(initialFurthest);
      setCurrent(Math.min(progress.currentBlockIndex, initialFurthest));
      setLoaded(true);
    })();
  }, [studentKey]);

  function goTo(index: number) {
    if (index > furthest) return;
    setCurrent(index);
    saveFlowProgress({ studentKey, assignmentId: instance!.assignmentId, currentBlockIndex: index, furthestBlockIndex: furthest });
    logEvent(studentKey, 'block_entered', { blockIndex: index });
  }

  function advance(nextIndex: number) {
    const newFurthest = Math.max(furthest, nextIndex);
    setFurthest(newFurthest);
    setCurrent(nextIndex);
    saveFlowProgress({ studentKey, assignmentId: instance!.assignmentId, currentBlockIndex: nextIndex, furthestBlockIndex: newFurthest });
    logEvent(studentKey, 'block_entered', { blockIndex: nextIndex });
  }

  if (!loaded || !instance) return <p style={{ padding: 24 }}>Loading…</p>;

  let content: JSX.Element;
  switch (current) {
    case 0:
      content = (
        <div>
          <Title level="H2">The Sales Process in SAP</Title>
          <p>
            You'll create three linked documents — an inquiry, a quotation, and a sales order — for a
            customer requesting pricing on {assignedProductsSentence(instance)}. Along the way you'll see exactly
            how data and pricing decisions carry forward from one document to the next.
          </p>
          <Button design="Emphasized" onClick={() => advance(1)}>
            Begin
          </Button>
        </div>
      );
      break;
    case 1:
      content = <BackgroundBlock leadIn={inquiryLeadIn(instance)} onContinue={() => advance(2)} />;
      break;
    case 2:
      content = (
        <VA11Inquiry
          instance={instance}
          studentKey={studentKey}
          onDocumentSaved={(doc) => {
            setDocs((d) => ({ ...d, inquiry: doc }));
            setStatusMessage(`Inquiry ${doc.id} saved.`);
          }}
          onSaved={() => advance(3)}
        />
      );
      break;
    case 3:
      content = <BackgroundBlock leadIn={quotationLeadIn(instance)} onContinue={() => advance(4)} />;
      break;
    case 4:
      content = (
        <VA21Quotation
          instance={instance}
          studentKey={studentKey}
          onDocumentSaved={(doc) => {
            setDocs((d) => ({ ...d, quotation: doc }));
            setStatusMessage(`Quotation ${doc.id} saved.`);
          }}
          onSaved={() => advance(5)}
        />
      );
      break;
    case 5:
      content = <BackgroundBlock leadIn={orderLeadIn(instance)} onContinue={() => advance(6)} />;
      break;
    case 6:
      content = (
        <VA01Order
          instance={instance}
          studentKey={studentKey}
          onDocumentSaved={(doc) => {
            setDocs((d) => ({ ...d, order: doc }));
            setStatusMessage(`Order ${doc.id} saved.`);
          }}
          onSaved={(doc) => {
            advance(7);
            logEvent(studentKey, 'document_flow_viewed', {}, doc.id);
          }}
        />
      );
      break;
    case 7:
    default:
      content = docs.order ? (
        <ConclusionBlock instance={instance} orderId={docs.order.id} />
      ) : (
        <p>Complete the sales order first.</p>
      );
      break;
  }

  return (
    <div className="app-shell">
      <div className="progress-bar">
        {BLOCK_LABELS.map((label, idx) => (
          <div
            key={label}
            className={
              'progress-step' +
              (idx <= furthest ? ' reachable' : '') +
              (idx === current ? ' current' : '') +
              (idx < furthest && idx !== current ? ' complete' : '')
            }
            onClick={() => goTo(idx)}
          >
            {idx + 1}. {label}
          </div>
        ))}
      </div>
      <div className="block-content">{content}</div>
      <StatusBar message={statusMessage} />
    </div>
  );
}
