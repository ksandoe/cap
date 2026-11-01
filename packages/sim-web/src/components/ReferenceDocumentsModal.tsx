import { useState } from 'react';
import { Button, Dialog, Bar, Tab, TabContainer } from '@ui5/webcomponents-react';
import type { AssignmentInstance } from '@sap-sim/shared';
import { CUSTOMERS, getMaterial } from '@sap-sim/engine';
import { todayIso } from '../dateUtils';

/**
 * Pretend source documents a real sales rep would have on hand — the customer's own purchase
 * request and an internal pricing-authorization note. Lets a student look up "what was I asked
 * for" mid-activity instead of only once, in the lead-in, before the screen that actually needs
 * it. See docs/architecture-proposal.md §3c (the Customer PO Number is the customer's own
 * document, not something our system generated) and §10 (open question: surfacing this data).
 */
export default function ReferenceDocumentsButton({ instance }: { instance: AssignmentInstance }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'po' | 'pricing'>('po');

  const customer = CUSTOMERS.find((c) => c.id === instance.resolvedParams.customerId);
  const deluxeCondition = instance.resolvedParams.itemConditions[0];
  const headerCondition = instance.resolvedParams.headerConditions[0];

  return (
    <>
      <Button icon="document" onClick={() => setOpen(true)} style={{ marginBottom: 12 }}>
        Reference Documents
      </Button>
      <Dialog
        open={open}
        headerText="Reference Documents"
        onAfterClose={() => setOpen(false)}
        footer={
          <Bar
            endContent={
              <Button design="Transparent" onClick={() => setOpen(false)}>
                Close
              </Button>
            }
          />
        }
      >
        <div style={{ minWidth: 420, maxWidth: 520 }}>
          <TabContainer
            onTabSelect={(e) => setTab(e.detail.tab.dataset.key as 'po' | 'pricing')}
            style={{ marginBottom: 12 }}
          >
            <Tab text="Purchase Request" selected={tab === 'po'} data-key="po" />
            <Tab text="Pricing Authorization" selected={tab === 'pricing'} data-key="pricing" />
          </TabContainer>

          {tab === 'po' && (
            <div className="reference-doc">
              <div className="reference-doc-title">PURCHASE REQUEST</div>
              <p>
                <strong>From:</strong> {customer?.name}
                <br />
                {customer?.city}, {customer?.postalCode}, {customer?.country}
              </p>
              <p>
                <strong>Our Reference (PO Number):</strong> {instance.custPoNumber}
                <br />
                <strong>Date:</strong> {todayIso()}
              </p>
              <p>
                <strong>Please quote pricing on:</strong>
              </p>
              <table className="item-table">
                <thead>
                  <tr>
                    <th>Qty</th>
                    <th>Item</th>
                  </tr>
                </thead>
                <tbody>
                  {instance.resolvedParams.items.map((item) => (
                    <tr key={item.materialId}>
                      <td>{item.quantity}</td>
                      <td>{getMaterial(item.materialId).description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontStyle: 'italic', marginTop: 12 }}>
                Please confirm pricing and expected delivery. Reference our PO number
                ({instance.custPoNumber}) on all correspondence.
              </p>
            </div>
          )}

          {tab === 'pricing' && (
            <div className="reference-doc">
              <div className="reference-doc-title">INTERNAL NOTE — PRICING AUTHORIZATION</div>
              <p>
                Re: {customer?.name} ({instance.custPoNumber})
              </p>
              <ul>
                {deluxeCondition && (
                  <li>
                    <strong>K004 — ${deluxeCondition.amount}/unit</strong> off each{' '}
                    {getMaterial(deluxeCondition.materialId).description}
                  </li>
                )}
                {headerCondition && (
                  <li>
                    <strong>RA00 — {headerCondition.amount}%</strong> off the entire order
                  </li>
                )}
              </ul>
              <p style={{ fontStyle: 'italic', marginTop: 12 }}>Approved by Sales Management.</p>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
