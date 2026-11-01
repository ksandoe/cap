import { useState } from 'react';
import { Button, MessageStrip, Title } from '@ui5/webcomponents-react';
import type { AssignmentInstance, SalesDocument } from '@sap-sim/shared';
import { VA01_CONFIG, getMaterial } from '@sap-sim/engine';
import ActivityLayout from '../components/ActivityLayout';
import ReferenceDocumentsButton from '../components/ReferenceDocumentsModal';
import { createDocument, logEvent, searchByReference } from '../api';
import { todayIso } from '../dateUtils';

export default function VA01Order({
  instance,
  studentKey,
  onSaved,
}: {
  instance: AssignmentInstance;
  studentKey: string;
  onSaved: (doc: SalesDocument) => void;
}) {
  const steps = VA01_CONFIG.steps;
  const [stepIndex, setStepIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<SalesDocument[] | null>(null);
  const [quotation, setQuotation] = useState<SalesDocument | null>(null);
  const [custReference, setCustReference] = useState('');
  const [custReferenceDate, setCustReferenceDate] = useState(todayIso());
  const [saved, setSaved] = useState<SalesDocument | null>(null);

  const step = steps[stepIndex];

  async function runSearch() {
    const results = await searchByReference('quotation', instance.custPoNumber);
    setSearchResults(results);
  }

  function copyFromQuotation(doc: SalesDocument) {
    setQuotation(doc);
    setCustReference(doc.custReference);
    logEvent(studentKey, 'create_with_reference_used', { predecessorId: doc.id }, doc.id);
    setStepIndex(1);
  }

  function canAdvance(): boolean {
    if (step.id === 'create-with-reference') return quotation !== null;
    if (step.id === 'reference') return Boolean(custReference && custReferenceDate);
    return true;
  }

  async function handleSave() {
    const doc = await createDocument({
      docType: 'order',
      assignmentId: instance.assignmentId,
      studentKey,
      predecessorId: quotation!.id,
      customerId: quotation!.customerId,
      custReference,
      custReferenceDate,
      validFrom: null,
      validTo: null,
      requestedDeliveryDate: quotation!.requestedDeliveryDate,
      items: quotation!.items,
      headerConditions: quotation!.headerConditions,
      status: 'complete',
      savedAt: new Date().toISOString(),
    });
    logEvent(studentKey, 'document_saved', { docId: doc.id, docType: 'order' }, doc.id);
    setSaved(doc);
  }

  if (saved) {
    return (
      <div>
        <MessageStrip design="Positive">
          Order saved as <strong>{saved.id}</strong> — check the confirmation at the bottom-left.
        </MessageStrip>
        <Button design="Emphasized" style={{ marginTop: 16 }} onClick={() => onSaved(saved)}>
          Continue to Document Flow
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
      <Title level="H5">{VA01_CONFIG.title}: Overview</Title>

      {step.id === 'create-with-reference' && (
        <div>
          <Button onClick={runSearch}>Search by Customer PO Number ({instance.custPoNumber})…</Button>
          {searchResults && (
            <div style={{ marginTop: 12 }}>
              {searchResults.length === 0 && <p>No quotation found for that reference.</p>}
              {searchResults.map((doc) => (
                <div key={doc.id} className="search-result-row" onClick={() => copyFromQuotation(doc)}>
                  {doc.id} — Cust. Ref. {doc.custReference} — click to Copy
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {step.id === 'reference' && (
        <>
          <div className="field-row">
            <label className="required">Cust. Reference</label>
            <input value={custReference} onChange={(e) => setCustReference(e.target.value)} />
          </div>
          <div className="field-row">
            <label className="required">Cust. Ref. Date</label>
            <input type="date" value={custReferenceDate} onChange={(e) => setCustReferenceDate(e.target.value)} />
          </div>
          <div className="field-row">
            <label>Req. Deliv. Date (copied)</label>
            <input value={quotation?.requestedDeliveryDate ?? ''} disabled />
          </div>
        </>
      )}

      {step.id === 'review' && quotation && (
        <div>
          <table className="item-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Qty</th>
                <th>Net Value</th>
              </tr>
            </thead>
            <tbody>
              {quotation.items.map((item) => (
                <tr key={item.lineNumber}>
                  <td>{getMaterial(item.materialId).description}</td>
                  <td>{item.quantity}</td>
                  <td>${item.itemNetValue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <strong>Net Value: ${quotation.netValue.toFixed(2)}</strong> (copied from the quotation)
          </p>
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
    </div>
  );
}
