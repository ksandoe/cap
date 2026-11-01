import { useState } from 'react';
import { Button, MessageStrip, Title } from '@ui5/webcomponents-react';
import type { AssignmentInstance, SalesDocument, SalesDocumentItem } from '@sap-sim/shared';
import { CUSTOMERS, MATERIALS, VA11_CONFIG, priceDocument, getMaterial } from '@sap-sim/engine';
import ActivityLayout from '../components/ActivityLayout';
import ReferenceDocumentsButton from '../components/ReferenceDocumentsModal';
import SearchDialog, { type SearchItem } from '../components/SearchDialog';
import { createDocument, logEvent } from '../api';
import { todayIso, monthFromNowIso } from '../dateUtils';

const CUSTOMER_ITEMS: SearchItem[] = CUSTOMERS.map((c) => ({ id: c.id, label: c.name, sublabel: `${c.city}, ${c.country}` }));
const MATERIAL_ITEMS: SearchItem[] = MATERIALS.map((m) => ({ id: m.id, label: m.description, sublabel: `$${m.basePrice}/unit` }));

interface DraftItem {
  materialId: string;
  quantity: number;
  orderProbability: number;
}

export default function VA11Inquiry({
  instance,
  studentKey,
  onSaved,
}: {
  instance: AssignmentInstance;
  studentKey: string;
  onSaved: (doc: SalesDocument) => void;
}) {
  const steps = VA11_CONFIG.steps;
  const [stepIndex, setStepIndex] = useState(0);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);

  const [soldToParty, setSoldToParty] = useState<SearchItem | null>(null);
  const [custReference, setCustReference] = useState('');
  const [custReferenceDate, setCustReferenceDate] = useState(todayIso());
  const [validFrom, setValidFrom] = useState(todayIso());
  const [validTo, setValidTo] = useState(monthFromNowIso());
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saved, setSaved] = useState<SalesDocument | null>(null);
  const [showBlankTabNotice, setShowBlankTabNotice] = useState(false);

  const step = steps[stepIndex];

  function addMaterial(item: SearchItem) {
    setItems((prev) => [...prev, { materialId: item.id, quantity: 0, orderProbability: 30 }]);
    setMaterialDialogOpen(false);
  }

  function canAdvance(): boolean {
    switch (step.id) {
      case 'customer':
        return soldToParty !== null;
      case 'reference':
        return Boolean(custReference && custReferenceDate && validFrom && validTo);
      case 'materials':
        return items.length === 2 && items.every((i) => i.quantity > 0);
      case 'probability':
        return items.every((i) => i.orderProbability > 0);
      default:
        return true;
    }
  }

  const pricing = priceDocument(
    items.map((i) => ({ materialId: i.materialId, quantity: i.quantity, itemConditions: [] })),
    [],
    getMaterial,
  );
  const expectedOrderValue = items.reduce((sum, item, idx) => {
    return sum + pricing.itemNetValues[idx] * (item.orderProbability / 100);
  }, 0);

  async function handleSave() {
    const docItems: SalesDocumentItem[] = items.map((item, idx) => ({
      lineNumber: idx + 1,
      materialId: item.materialId,
      quantity: item.quantity,
      orderProbability: item.orderProbability,
      itemConditions: [],
      itemNetValue: pricing.itemNetValues[idx],
    }));
    const doc = await createDocument({
      docType: 'inquiry',
      assignmentId: instance.assignmentId,
      studentKey,
      predecessorId: null,
      customerId: soldToParty!.id,
      custReference,
      custReferenceDate,
      validFrom,
      validTo,
      requestedDeliveryDate: null,
      items: docItems,
      headerConditions: [],
      status: 'complete',
      savedAt: new Date().toISOString(),
    });
    logEvent(studentKey, 'document_saved', { docId: doc.id, docType: 'inquiry' }, doc.id);
    setSaved(doc);
    setShowBlankTabNotice(VA11_CONFIG.postSaveBehavior === 'blank-tab');
  }

  if (saved) {
    return (
      <div>
        <MessageStrip design="Positive">
          Inquiry saved as <strong>{saved.id}</strong> — check the status bar at the bottom.
        </MessageStrip>
        {showBlankTabNotice && (
          <MessageStrip design="Information" style={{ marginTop: 12 }}>
            A blank tab may have opened just now — this is normal SAP behavior. You can close it and come back
            here.
          </MessageStrip>
        )}
        <Button design="Emphasized" style={{ marginTop: 16 }} onClick={() => onSaved(saved)}>
          Continue
        </Button>
      </div>
    );
  }

  const instructionsPane = (
    <div>
      <Title level="H5">{step.title}</Title>
      <p>{step.instructions}</p>
    </div>
  );

  const screenPane = (
    <div>
      <Title level="H5">{VA11_CONFIG.title}: Overview</Title>

      {step.id === 'customer' && (
        <div className="field-row">
          <label className="required">Sold-To Party</label>
          {soldToParty ? (
            <p>
              {soldToParty.label} ({soldToParty.id})
            </p>
          ) : (
            <p style={{ color: '#888' }}>Not selected</p>
          )}
          <Button onClick={() => setCustomerDialogOpen(true)}>Search…</Button>
        </div>
      )}

      {step.id === 'reference' && (
        <>
          <div className="field-row">
            <label className="required">Cust. Reference</label>
            <input value={custReference} onChange={(e) => setCustReference(e.target.value)} placeholder="PO-xxxxx" />
          </div>
          <div className="field-row">
            <label className="required">Customer Ref. Date</label>
            <input type="date" value={custReferenceDate} onChange={(e) => setCustReferenceDate(e.target.value)} />
          </div>
          <div className="field-row">
            <label className="required">Valid From</label>
            <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </div>
          <div className="field-row">
            <label className="required">Valid To</label>
            <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          </div>
        </>
      )}

      {step.id === 'materials' && (
        <>
          <table className="item-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Qty</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td>{getMaterial(item.materialId).description}</td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity || ''}
                      onChange={(e) => {
                        const q = Number(e.target.value);
                        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: q } : it)));
                      }}
                      style={{ width: 60 }}
                    />
                  </td>
                  <td>
                    <Button
                      design="Transparent"
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length < 2 && <Button onClick={() => setMaterialDialogOpen(true)}>Search Material…</Button>}
        </>
      )}

      {step.id === 'probability' && (
        <table className="item-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Net Value</th>
              <th>Order Probability (%)</th>
              <th>Expected Value</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx}>
                <td>{getMaterial(item.materialId).description}</td>
                <td>${pricing.itemNetValues[idx]?.toFixed(2)}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={item.orderProbability}
                    onChange={(e) => {
                      const p = Number(e.target.value);
                      setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, orderProbability: p } : it)));
                    }}
                    style={{ width: 60 }}
                  />
                </td>
                <td>${((pricing.itemNetValues[idx] ?? 0) * (item.orderProbability / 100)).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {step.id === 'review' && (
        <div>
          <p>Sold-To Party: {soldToParty?.label}</p>
          <p>Cust. Reference: {custReference}</p>
          <table className="item-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Qty</th>
                <th>Net Value</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td>{getMaterial(item.materialId).description}</td>
                  <td>{item.quantity}</td>
                  <td>${pricing.itemNetValues[idx]?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <strong>Net Value: ${pricing.netValue.toFixed(2)}</strong>
          </p>
          <p>Expected Order Value: ${expectedOrderValue.toFixed(2)}</p>
          <Button design="Emphasized" onClick={handleSave}>
            Save
          </Button>
        </div>
      )}

      <div className="step-actions">
        {stepIndex > 0 && <Button onClick={() => setStepIndex((i) => i - 1)}>Back</Button>}
        {step.id !== 'review' && (
          <Button design="Emphasized" disabled={!canAdvance()} onClick={() => setStepIndex((i) => i + 1)}>
            Next
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <ReferenceDocumentsButton instance={instance} />
      <ActivityLayout instructions={instructionsPane} screen={screenPane} />
      <SearchDialog
        open={customerDialogOpen}
        title="Search Sold-To Party"
        placeholder="Search by customer name…"
        items={CUSTOMER_ITEMS}
        onSelect={(item) => {
          setSoldToParty(item);
          setCustomerDialogOpen(false);
        }}
        onClose={() => setCustomerDialogOpen(false)}
      />
      <SearchDialog
        open={materialDialogOpen}
        title="Search Material"
        placeholder="Search by material description…"
        items={MATERIAL_ITEMS}
        onSelect={addMaterial}
        onClose={() => setMaterialDialogOpen(false)}
      />
    </div>
  );
}
