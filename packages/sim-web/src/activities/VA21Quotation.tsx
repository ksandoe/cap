import { useState } from 'react';
import { Button, MessageStrip, Title } from '@ui5/webcomponents-react';
import type { AppliedCondition, AssignmentInstance, SalesDocument, SalesDocumentItem } from '@sap-sim/shared';
import { VA21_CONFIG, priceDocument, getMaterial } from '@sap-sim/engine';
import ActivityLayout from '../components/ActivityLayout';
import ReferenceDocumentsButton from '../components/ReferenceDocumentsModal';
import SearchDialog, { type SearchItem } from '../components/SearchDialog';
import { createDocument, logEvent, searchByReference } from '../api';
import { todayIso, monthFromNowIso } from '../dateUtils';

export default function VA21Quotation({
  instance,
  studentKey,
  onSaved,
}: {
  instance: AssignmentInstance;
  studentKey: string;
  onSaved: (doc: SalesDocument) => void;
}) {
  const steps = VA21_CONFIG.steps;
  const [stepIndex, setStepIndex] = useState(0);
  const [refDialogOpen, setRefDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SalesDocument[] | null>(null);
  const [inquiry, setInquiry] = useState<SalesDocument | null>(null);

  const [custReference, setCustReference] = useState('');
  const [custReferenceDate, setCustReferenceDate] = useState(todayIso());
  const [validTo, setValidTo] = useState(monthFromNowIso());
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState(monthFromNowIso());
  const [warningIndex, setWarningIndex] = useState(0); // which warningsOnAdvance item is pending

  const [items, setItems] = useState<SalesDocumentItem[]>([]);
  const [headerConditions, setHeaderConditions] = useState<AppliedCondition[]>([]);
  const [itemDiscountInput, setItemDiscountInput] = useState('');
  const [headerDiscountInput, setHeaderDiscountInput] = useState('');

  const [saved, setSaved] = useState<SalesDocument | null>(null);

  const step = steps[stepIndex];
  const deluxeIndex = items.findIndex((i) => i.materialId.startsWith('DXTR'));

  async function runSearch() {
    const results = await searchByReference('inquiry', searchQuery.trim());
    setSearchResults(results);
    logEvent(studentKey, 'search_dialog_opened', { for: 'create-with-reference', docType: 'inquiry', query: searchQuery });
  }

  function copyFromInquiry(doc: SalesDocument) {
    setInquiry(doc);
    setCustReference(doc.custReference);
    setItems(doc.items.map((i) => ({ ...i, itemConditions: [], orderProbability: null })));
    logEvent(studentKey, 'create_with_reference_used', { predecessorId: doc.id }, doc.id);
    setStepIndex(1);
  }

  function pricingFor(items: SalesDocumentItem[], headerConditions: AppliedCondition[]) {
    return priceDocument(
      items.map((i) => ({ materialId: i.materialId, quantity: i.quantity, itemConditions: i.itemConditions })),
      headerConditions,
      getMaterial,
    );
  }

  function canAdvance(): boolean {
    switch (step.id) {
      case 'create-with-reference':
        return inquiry !== null;
      case 'reference':
        return Boolean(custReference && custReferenceDate && validTo && requestedDeliveryDate);
      case 'item-pricing':
        return items[deluxeIndex]?.itemConditions.length > 0;
      case 'header-pricing':
        return headerConditions.length > 0 && headerConditions[0].active;
      default:
        return true;
    }
  }

  function handleNext() {
    if (step.id === 'reference' && step.warningsOnAdvance && warningIndex < step.warningsOnAdvance.length) {
      return; // must dismiss all warnings first — see render below
    }
    setStepIndex((i) => i + 1);
  }

  function applyItemDiscount() {
    const amount = Number(itemDiscountInput);
    if (!amount || deluxeIndex < 0) return;
    setItems((prev) =>
      prev.map((it, i) =>
        i === deluxeIndex ? { ...it, itemConditions: [{ conditionCode: 'K004', amount, active: true }] } : it,
      ),
    );
  }

  function applyHeaderDiscount() {
    const amount = Number(headerDiscountInput);
    if (!amount) return;
    setHeaderConditions([{ conditionCode: 'RA00', amount, active: false }]);
  }

  function activateHeaderDiscount() {
    setHeaderConditions((prev) => prev.map((c) => ({ ...c, active: true })));
  }

  const pricing = pricingFor(items, headerConditions);

  async function handleSave() {
    const docItems = items.map((item, idx) => ({ ...item, itemNetValue: pricing.itemNetValues[idx] }));
    const doc = await createDocument({
      docType: 'quotation',
      assignmentId: instance.assignmentId,
      studentKey,
      predecessorId: inquiry!.id,
      customerId: inquiry!.customerId,
      custReference,
      custReferenceDate,
      validFrom: null,
      validTo,
      requestedDeliveryDate,
      items: docItems,
      headerConditions,
      status: 'complete',
      savedAt: new Date().toISOString(),
    });
    logEvent(studentKey, 'document_saved', { docId: doc.id, docType: 'quotation' }, doc.id);
    setSaved(doc);
  }

  if (saved) {
    return (
      <div>
        <MessageStrip design="Positive">
          Quotation saved as <strong>{saved.id}</strong> — check the status bar at the bottom.
        </MessageStrip>
        <MessageStrip design="Information" style={{ marginTop: 12 }}>
          A blank tab may have opened just now — this is normal SAP behavior.
        </MessageStrip>
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

  const pendingWarning =
    step.id === 'reference' && step.warningsOnAdvance ? step.warningsOnAdvance[warningIndex] : undefined;

  const screenPane = (
    <div>
      <Title level="H5">{VA21_CONFIG.title}: Overview</Title>

      {step.id === 'create-with-reference' && (
        <div>
          <div className="field-row">
            <label className="required">Customer Reference</label>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. PO-10238"
              style={{ marginRight: 8 }}
            />
            <Button onClick={runSearch} disabled={!searchQuery.trim()}>
              Search
            </Button>
          </div>
          {searchResults && (
            <div style={{ marginTop: 12 }}>
              {searchResults.length === 0 && (
                <MessageStrip design="Negative">
                  No inquiry found with Customer Reference "{searchQuery}". Check the Purchase Request in your
                  Reference Documents for the exact PO number.
                </MessageStrip>
              )}
              {searchResults.map((doc) => (
                <div key={doc.id} className="search-result-row" onClick={() => copyFromInquiry(doc)}>
                  {doc.id} — Cust. Ref. {doc.custReference} — click to Copy
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {step.id === 'reference' && (
        <>
          {pendingWarning ? (
            <MessageStrip design={pendingWarning.kind === 'warning' ? 'Negative' : 'Information'}>
              {pendingWarning.message}
              <div style={{ marginTop: 8 }}>
                <Button onClick={() => setWarningIndex((i) => i + 1)}>
                  {pendingWarning.dismissAction === 'enter' ? 'Enter' : '✓ OK'}
                </Button>
              </div>
            </MessageStrip>
          ) : (
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
                <label className="required">Valid To</label>
                <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
              </div>
              <div className="field-row">
                <label className="required">Req. Deliv. Date</label>
                <input
                  type="date"
                  value={requestedDeliveryDate}
                  onChange={(e) => setRequestedDeliveryDate(e.target.value)}
                />
              </div>
            </>
          )}
        </>
      )}

      {step.id === 'item-pricing' && deluxeIndex >= 0 && (
        <div>
          <p>{getMaterial(items[deluxeIndex].materialId).description}</p>
          <div className="field-row">
            <label className="required">K004 — Material Discount ($ per unit)</label>
            <input value={itemDiscountInput} onChange={(e) => setItemDiscountInput(e.target.value)} style={{ width: 80 }} />
            <Button onClick={applyItemDiscount} style={{ marginLeft: 8 }}>
              Apply
            </Button>
          </div>
          {items[deluxeIndex].itemConditions.length > 0 && (
            <MessageStrip design="Positive">K004 applied: ${items[deluxeIndex].itemConditions[0].amount}/unit</MessageStrip>
          )}
        </div>
      )}
      {step.id === 'item-pricing' && deluxeIndex < 0 && (
        <MessageStrip design="Negative">
          This quotation has no Deluxe Touring Bike line, so there's nothing to apply K004 to. Check your Reference
          Documents for the exact products you were asked to quote, then go back and copy the right inquiry.
        </MessageStrip>
      )}

      {step.id === 'header-pricing' && (
        <div>
          <div className="field-row">
            <label className="required">RA00 — Net Discount (%)</label>
            <input value={headerDiscountInput} onChange={(e) => setHeaderDiscountInput(e.target.value)} style={{ width: 80 }} />
            <Button onClick={applyHeaderDiscount} style={{ marginLeft: 8 }}>
              Enter
            </Button>
          </div>
          {headerConditions.length > 0 && !headerConditions[0].active && (
            <MessageStrip design="Negative">
              RA00 entered but not yet active — the discount above does not apply until you Activate it.
              <div style={{ marginTop: 8 }}>
                <Button onClick={activateHeaderDiscount}>Activate</Button>
              </div>
            </MessageStrip>
          )}
          {headerConditions.length > 0 && headerConditions[0].active && (
            <MessageStrip design="Positive">RA00 active: {headerConditions[0].amount}% off</MessageStrip>
          )}
        </div>
      )}

      {step.id === 'review' && (
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
          <Button design="Emphasized" onClick={handleSave}>
            Save
          </Button>
        </div>
      )}

      <div className="step-actions">
        {stepIndex > 0 && <Button onClick={() => setStepIndex((i) => i - 1)}>Back</Button>}
        {step.id !== 'review' && (
          <Button design="Emphasized" disabled={!canAdvance() || Boolean(pendingWarning)} onClick={handleNext}>
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
