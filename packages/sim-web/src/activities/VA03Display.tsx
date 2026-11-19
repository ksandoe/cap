import { useState } from 'react';
import { Button } from '@ui5/webcomponents-react';
import type { PublicSalesDocument } from '@cap/sim-shared';
import { CUSTOMERS, getMaterial } from '@cap/sim-engine';
import { useSimApi } from '../simApi';
import { formatCurrency } from '../formatUtils';
import FooterActions from '../components/FooterActions';
import SapChrome from '../components/SapChrome';
import DocumentFlowView from '../components/DocumentFlowView';
import type { StatusMessage } from '../components/StatusBar';

const DOC_TYPE_LABEL = { inquiry: 'Inquiry', quotation: 'Quotation', order: 'Standard Order' } as const;

/**
 * VA03, Display Sales Document. The student types a document number (the one the status bar showed when
 * they saved), sees the document, and opens Document Flow from the Environment menu, as in real SAP.
 * This is the way back to a completed document, so it only ever finds the learner's own.
 */
export default function VA03Display({
  onStatus,
  onExit,
}: {
  onStatus: (message: StatusMessage | null) => void;
  onExit: () => void;
}) {
  const api = useSimApi();
  const [number, setNumber] = useState('');
  const [doc, setDoc] = useState<PublicSalesDocument | null>(null);
  const [showFlow, setShowFlow] = useState(false);

  async function open() {
    const id = number.trim();
    if (!id) {
      onStatus({ text: 'Enter a sales document number', kind: 'warning' });
      return;
    }
    try {
      const found = await api.getDocument(id);
      onStatus(null);
      setDoc(found);
    } catch {
      onStatus({ text: `SD document ${id} is not in the database or has been archived`, kind: 'warning' });
    }
  }

  if (!doc) {
    return (
      <div>
        <SapChrome title="Display Sales Document: Initial Screen" code="VA03" onBack={onExit} />
        <div className="sap-screen-body">
          <div className="initial-screen-fields">
            <div className="field-row-inline">
              <label htmlFor="va03-number">Sales document</label>
              <input
                id="va03-number"
                value={number}
                autoComplete="off"
                onChange={(e) => setNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && open()}
              />
            </div>
          </div>
        </div>
        <FooterActions>
          <Button design="Emphasized" onClick={open}>
            Continue
          </Button>
          <Button design="Transparent" onClick={onExit}>
            Cancel
          </Button>
        </FooterActions>
      </div>
    );
  }

  const customer = CUSTOMERS.find((c) => c.id === doc.customerId);
  const title = `Display ${DOC_TYPE_LABEL[doc.docType]} ${doc.id}: Overview`;

  return (
    <div>
      <SapChrome
        title={title}
        code="VA03"
        onBack={() => {
          if (showFlow) setShowFlow(false);
          else {
            setDoc(null);
            setNumber('');
          }
        }}
        menuItems={[
          {
            label: 'Environment',
            children: [{ label: 'Display Document Flow', onSelect: () => {
              api.logEvent('document_flow_viewed', {}, doc.id);
              setShowFlow(true);
            } }],
          },
        ]}
      />
      <div className="sap-screen-body">
        {showFlow ? (
          <DocumentFlowView orderId={doc.id} />
        ) : (
          <>
            <div className="order-header">
              <div className="field-row-inline">
                <label>Sold-To Party</label>
                <span>{customer ? `${customer.id} ${customer.name}` : doc.customerId}</span>
              </div>
              <div className="field-row-inline">
                <label>Cust. Reference</label>
                <span>{doc.custReference ?? ''}</span>
              </div>
              <div className="field-row-inline">
                <label>Net Value</label>
                <span>{formatCurrency(doc.netValue)}</span>
              </div>
            </div>
            <table className="item-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Material</th>
                  <th>Quantity</th>
                  <th>Net Value</th>
                </tr>
              </thead>
              <tbody>
                {doc.items.map((item) => (
                  <tr key={item.lineNumber}>
                    <td>{item.lineNumber}</td>
                    <td>{getMaterial(item.materialId).description}</td>
                    <td>{item.quantity}</td>
                    <td>{formatCurrency(item.itemNetValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
