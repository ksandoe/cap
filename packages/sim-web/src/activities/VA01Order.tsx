import { useState } from 'react';
import { Button, MessageStrip, Title } from '@ui5/webcomponents-react';
import type { AssignmentInstance, SalesDocument } from '@sap-sim/shared';
import { VA01_CONFIG, getCustomer } from '@sap-sim/engine';
import ActivityLayout from '../components/ActivityLayout';
import ReferenceDocumentsButton from '../components/ReferenceDocumentsModal';
import SapChrome, { OVERVIEW_TOOLBAR_ICONS } from '../components/SapChrome';
import ItemsGrid from '../components/ItemsGrid';
import EasyAccessMenu from '../components/EasyAccessMenu';
import InitialScreenFields from '../components/InitialScreenFields';
import DocumentTabStrip from '../components/DocumentTabStrip';
import { createDocument, logEvent, searchByReference } from '../api';
import { todayIso } from '../dateUtils';

const OVERVIEW_TABS = ['Sales', 'Item Overview', 'Item detail', 'Ordering party', 'Procurement', 'Shipping', 'Reason for rejection'];

export default function VA01Order({
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
  const steps = VA01_CONFIG.steps;
  const [phase, setPhase] = useState<'menu' | 'initial' | 'steps'>('menu');
  const [continueNotice, setContinueNotice] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SalesDocument[] | null>(null);
  const [quotation, setQuotation] = useState<SalesDocument | null>(null);
  const [custReference, setCustReference] = useState('');
  const [custReferenceDate, setCustReferenceDate] = useState(todayIso());
  const [saved, setSaved] = useState<SalesDocument | null>(null);

  const step = steps[stepIndex];

  async function runSearch() {
    const results = await searchByReference('quotation', searchQuery.trim());
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
    onDocumentSaved(doc);
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
                <strong>{VA01_CONFIG.menuPath.join(' ▸ ')}</strong>.
              </p>
            </div>
          }
          screen={
            <EasyAccessMenu
              targetPath={VA01_CONFIG.menuPath}
              onNavigate={() => {
                logEvent(studentKey, 'menu_navigated', { transaction: 'VA01' });
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
              <Title level="H5">{VA01_CONFIG.initialScreen.title}</Title>
              <p>
                Every order in this exercise uses the same Order Type. Confirm it and click{' '}
                {VA01_CONFIG.initialScreen.continueLabel}.
              </p>
            </div>
          }
          screen={
            <div>
              <SapChrome title={VA01_CONFIG.initialScreen.title} code={VA01_CONFIG.id} onBack={() => setPhase('menu')} />
              <div className="sap-screen-body">
                {continueNotice && (
                  <MessageStrip design="Information" style={{ marginBottom: 12 }} onClose={() => setContinueNotice(false)}>
                    Not used in this exercise — every order here is created with reference to a quotation.
                  </MessageStrip>
                )}
                <InitialScreenFields fields={VA01_CONFIG.initialScreen.fields} />
                <div className="step-actions">
                  <Button design="Transparent" onClick={() => setContinueNotice(true)}>
                    Continue
                  </Button>
                  <Button design="Emphasized" onClick={() => setPhase('steps')}>
                    {VA01_CONFIG.initialScreen.continueLabel}
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

  const screenPane = (
    <div>
      <SapChrome title={`${VA01_CONFIG.title}: Overview`} code={VA01_CONFIG.id} toolbarIcons={OVERVIEW_TOOLBAR_ICONS} />
      {step.id !== 'create-with-reference' && quotation && (
        <div className="sap-screen-body document-header">
          <div className="field-row">
            <label>Sold-to Party</label>
            <div>
              {quotation.customerId} — {getCustomer(quotation.customerId).name}, {getCustomer(quotation.customerId).city}
            </div>
          </div>
        </div>
      )}
      {step.id !== 'create-with-reference' && <DocumentTabStrip tabs={OVERVIEW_TABS} active="Item Overview" />}
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
                    No quotation found with Customer Reference "{searchQuery}". Check the Purchase Request in your
                    Reference Documents for the exact PO number.
                  </MessageStrip>
                )}
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
            <ItemsGrid items={quotation.items} selectedLines={[]} onToggleSelect={() => {}} readOnly />
            <p style={{ marginTop: 12 }}>
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
    </div>
  );

  return (
    <div>
      <ReferenceDocumentsButton instance={instance} />
      <ActivityLayout instructions={instructionsPane} screen={screenPane} />
    </div>
  );
}
