import { useState } from 'react';
import { Button, Dialog, Bar, MessageStrip, Title } from '@ui5/webcomponents-react';
import type { AppliedCondition, AssignmentInstance, SalesDocument, SalesDocumentItem } from '@sap-sim/shared';
import { VA21_CONFIG, priceDocument, getMaterial, getConditionType } from '@sap-sim/engine';
import ActivityLayout from '../components/ActivityLayout';
import ReferenceDocumentsButton from '../components/ReferenceDocumentsModal';
import SapChrome from '../components/SapChrome';
import ItemsGrid from '../components/ItemsGrid';
import ItemDetailPanel from '../components/ItemDetailPanel';
import PricingElementsTable from '../components/PricingElementsTable';
import EasyAccessMenu from '../components/EasyAccessMenu';
import { createDocument, logEvent, searchByReference } from '../api';
import { todayIso, monthFromNowIso } from '../dateUtils';

const K004 = getConditionType('K004');
const RA00 = getConditionType('RA00');

export default function VA21Quotation({
  instance,
  studentKey,
  onDocumentSaved,
  onSaved,
}: {
  instance: AssignmentInstance;
  studentKey: string;
  /** Fired immediately on save, while still showing the in-screen confirmation — drives the status bar. */
  onDocumentSaved: (doc: SalesDocument) => void;
  onSaved: (doc: SalesDocument) => void;
}) {
  const steps = VA21_CONFIG.steps;
  const [phase, setPhase] = useState<'menu' | 'initial' | 'steps'>('menu');
  const [stepIndex, setStepIndex] = useState(0);
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

  // Item Pricing: the student selects which row to open — no hardcoded "the Deluxe one", per
  // docs/decisions/001. Wrong item selected still saves; it just produces a wrong net value.
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [itemDetailOpen, setItemDetailOpen] = useState(false);
  const [headerDialogOpen, setHeaderDialogOpen] = useState(false);

  const [saved, setSaved] = useState<SalesDocument | null>(null);

  const step = steps[stepIndex];
  const selectedItem = items.find((i) => i.lineNumber === selectedLine) ?? null;

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
        return items.some((i) => i.itemConditions.length > 0);
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

  function commitItemCondition(amount: number) {
    if (selectedLine === null) return;
    setItems((prev) =>
      prev.map((it) =>
        it.lineNumber === selectedLine ? { ...it, itemConditions: [{ conditionCode: 'K004', amount, active: true }] } : it,
      ),
    );
  }

  function commitHeaderCondition(amount: number) {
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
    onDocumentSaved(doc);
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

  if (phase === 'menu') {
    return (
      <div>
        <ReferenceDocumentsButton instance={instance} />
        <ActivityLayout
          instructions={
            <div>
              <Title level="H5">Find the Transaction</Title>
              <p>
                Real SAP users reach every transaction through this menu, not a bookmark or search bar. Open{' '}
                <strong>{VA21_CONFIG.menuPath.join(' ▸ ')}</strong>.
              </p>
            </div>
          }
          screen={
            <EasyAccessMenu
              targetPath={VA21_CONFIG.menuPath}
              onNavigate={() => {
                logEvent(studentKey, 'menu_navigated', { transaction: 'VA21' });
                setPhase('initial');
              }}
            />
          }
        />
      </div>
    );
  }

  if (phase === 'initial') {
    return (
      <div>
        <ReferenceDocumentsButton instance={instance} />
        <ActivityLayout
          instructions={
            <div>
              <Title level="H5">{VA21_CONFIG.initialScreen.title}</Title>
              <p>
                Every quotation in this exercise uses the same Quotation Type. Confirm it and click{' '}
                {VA21_CONFIG.initialScreen.continueLabel}.
              </p>
            </div>
          }
          screen={
            <div>
              <SapChrome title={VA21_CONFIG.initialScreen.title} />
              <div className="sap-screen-body">
                <div className="initial-screen-fields">
                  {VA21_CONFIG.initialScreen.fields.map((f) => (
                    <div className="field-row" key={f.name}>
                      <label>{f.label}</label>
                      <input value={f.value} disabled style={{ width: 100 }} />
                    </div>
                  ))}
                </div>
                <div className="step-actions">
                  <Button onClick={() => setPhase('menu')}>Back</Button>
                  <Button design="Emphasized" onClick={() => setPhase('steps')}>
                    {VA21_CONFIG.initialScreen.continueLabel}
                  </Button>
                </div>
              </div>
            </div>
          }
        />
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
      <SapChrome
        title={`${VA21_CONFIG.title}: Overview`}
        itemDetailIcon={step.id === 'item-pricing'}
        itemDetailDisabled={!selectedItem}
        onItemDetail={() => setItemDetailOpen(true)}
      />
      <div className="sap-screen-body">
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

        {step.id === 'item-pricing' && (
          <ItemsGrid
            items={items}
            selectedLines={selectedLine !== null ? [selectedLine] : []}
            onToggleSelect={(line) => setSelectedLine((cur) => (cur === line ? null : line))}
            readOnly
          />
        )}

        {step.id === 'header-pricing' && (
          <div>
            <Button onClick={() => setHeaderDialogOpen(true)}>Goto ▸ Header ▸ Conditions</Button>
            {headerConditions.length > 0 && !headerConditions[0].active && (
              <MessageStrip design="Negative" style={{ marginTop: 8 }}>
                RA00 entered but not yet active — open Header Conditions to Activate it.
              </MessageStrip>
            )}
            {headerConditions.length > 0 && headerConditions[0].active && (
              <MessageStrip design="Positive" style={{ marginTop: 8 }}>
                RA00 active: {headerConditions[0].amount}% off
              </MessageStrip>
            )}
          </div>
        )}

        {step.id === 'review' && (
          <div>
            <ItemsGrid items={items} selectedLines={[]} onToggleSelect={() => {}} readOnly />
            <p style={{ marginTop: 12 }}>
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
    </div>
  );

  return (
    <div>
      <ReferenceDocumentsButton instance={instance} />
      <ActivityLayout instructions={instructionsPane} screen={screenPane} />

      {selectedItem && (
        <ItemDetailPanel
          open={itemDetailOpen}
          materialId={selectedItem.materialId}
          lineNumber={selectedItem.lineNumber}
          quantity={selectedItem.quantity}
          conditionDef={K004}
          appliedCondition={selectedItem.itemConditions[0] ?? null}
          onCommitCondition={commitItemCondition}
          initialTab="Conditions"
          onClose={() => setItemDetailOpen(false)}
        />
      )}

      <Dialog
        open={headerDialogOpen}
        headerText="Create Quotation: Header Data — Conditions"
        onAfterClose={() => setHeaderDialogOpen(false)}
        footer={
          <Bar
            endContent={
              <Button design="Transparent" onClick={() => setHeaderDialogOpen(false)}>
                Back
              </Button>
            }
          />
        }
      >
        <div style={{ minWidth: 480, maxWidth: 560 }}>
          <PricingElementsTable
            level="header"
            basePrice={items.reduce((sum, item, idx) => sum + pricing.itemNetValues[idx], 0)}
            conditionDef={RA00}
            appliedCondition={headerConditions[0] ?? null}
            onCommitCondition={commitHeaderCondition}
            onActivate={activateHeaderDiscount}
          />
        </div>
      </Dialog>
    </div>
  );
}
