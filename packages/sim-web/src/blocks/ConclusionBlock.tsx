import { useState } from 'react';
import { Button, Title } from '@ui5/webcomponents-react';
import type { AssignmentInstance } from '@sap-sim/shared';
import { CUSTOMERS } from '@sap-sim/engine';
import DocumentFlowView from '../components/DocumentFlowView';

/**
 * The 8th wizard block — docs/architecture-proposal.md §10a. Document Flow is the centerpiece,
 * but it needs the same "why does this matter" close the lead-ins give each activity, plus a
 * clear end-of-exercise action (the original exercise's "Exit to Easy Access" quirk — here,
 * Exit just ends the session cleanly rather than leaving the student on an open screen).
 */
export default function ConclusionBlock({ instance, orderId }: { instance: AssignmentInstance; orderId: string }) {
  const [exited, setExited] = useState(false);
  const customerName = CUSTOMERS.find((c) => c.id === instance.resolvedParams.customerId)?.name;

  if (exited) {
    return (
      <div className="lead-in">
        <Title level="H2">Exercise Complete</Title>
        <p>
          You've finished the Sales Process exercise — inquiry, quotation, sales order, and the document flow
          connecting them. You may close this window now.
        </p>
        <Button onClick={() => setExited(false)}>Back to Document Flow</Button>
      </div>
    );
  }

  return (
    <div>
      <DocumentFlowView orderId={orderId} />

      <div className="lead-in" style={{ marginTop: 24 }}>
        <h3>You're done — here's why this mattered</h3>
        <p>
          {customerName} asked for pricing, you delivered a binding quotation, and the order you just created is
          the handoff point to delivery and billing — the parts of the business this exercise didn't build, but
          that this document flow was always pointing toward.
        </p>
        <p>
          Look at the chain above: three documents, created at three different moments, each triggered by a
          different real business event — a price request, an accepted quote, a confirmed order — yet every
          number downstream traces back to decisions you made on the very first screen. That's the whole reason
          SAP separates these into distinct documents instead of one long form: each one is a checkpoint a
          different part of the business can rely on without re-asking you the same questions.
        </p>
        <p>You can come back to this page anytime to review what you did.</p>
      </div>

      <Button design="Emphasized" onClick={() => setExited(true)} style={{ marginTop: 12 }}>
        Exit
      </Button>
    </div>
  );
}
