import FooterActions from '../components/FooterActions';
import { useState } from 'react';
import { Button, Dialog, Icon, MessageStrip, Title } from '@ui5/webcomponents-react';
import type { AppliedCondition, AssignmentInstance, SalesDocument, SalesDocumentItem } from '@sap-sim/shared';
import { VA21_CONFIG, priceDocument, getMaterial, getConditionType, getCustomer } from '@sap-sim/engine';
import ActivityLayout from '../components/ActivityLayout';
import ReferenceDocumentsButton from '../components/ReferenceDocumentsModal';
import SapChrome, { OVERVIEW_TOOLBAR_ICONS, type MenuItem } from '../components/SapChrome';
import ItemsGrid from '../components/ItemsGrid';
import ItemDetailPanel from '../components/ItemDetailPanel';
import HeaderDataPanel from '../components/HeaderDataPanel';
import BlankOverviewScreen from '../components/BlankOverviewScreen';
import EasyAccessMenu from '../components/EasyAccessMenu';
import InitialScreenFields from '../components/InitialScreenFields';
import DocumentTabStrip from '../components/DocumentTabStrip';
import CreateWithReferenceDialog from '../components/CreateWithReferenceDialog';
import { createDocument, listDocuments, logEvent, updateDocument } from '../api';
import { todayIso } from '../dateUtils';
import { formatCurrency } from '../formatUtils';

const OVERVIEW_TABS = ['Sales', 'Item Overview', 'Item detail', 'Ordering party', 'Procurement', 'Shipping', 'Reason for rejection'];

const K004 = getConditionType('K004');
const RA00 = getConditionType('RA00');

// SAP interrupts the first save attempt with popups about the dates and the copied data.
const SAVE_WARNINGS = VA21_CONFIG.steps.find((s) => s.id === 'reference')?.warningsOnAdvance ?? [];

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
  const [phase, setPhase] = useState<'menu' | 'initial' | 'steps'>('menu');
  const [continueNotice, setContinueNotice] = useState(false);
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [initialError, setInitialError] = useState<string | null>(null);
  const [createRefOpen, setCreateRefOpen] = useState(false);
  const [inquiryDocs, setInquiryDocs] = useState<SalesDocument[]>([]);
  const [inquiry, setInquiry] = useState<SalesDocument | null>(null);

  // Real SAP copies the dates and items from the inquiry but not Cust. Reference, Cust. Ref. Date
  // or Valid To — the student fills those in (Kent's 2026-11-02 screenshot of the Overview).
  const [custReference, setCustReference] = useState('');
  const [custReferenceDate, setCustReferenceDate] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('');
  const [warningsActive, setWarningsActive] = useState(false);
  const [warningIndex, setWarningIndex] = useState(0);
  // Real SAP lets you save an incomplete document and come back to finish it (Kent's 2026-11-02
  // screenshot of "Save Incomplete Document"); draftDoc is that half-saved document.
  const [incompleteOpen, setIncompleteOpen] = useState(false);
  const [draftDoc, setDraftDoc] = useState<SalesDocument | null>(null);
  const [savedIncomplete, setSavedIncomplete] = useState<SalesDocument | null>(null);

  const [items, setItems] = useState<SalesDocumentItem[]>([]);
  const [headerConditions, setHeaderConditions] = useState<AppliedCondition[]>([]);

  // Item Pricing: the student selects which row to open — no hardcoded "the Deluxe one", per
  // docs/decisions/001. Wrong item selected still saves; it just produces a wrong net value.
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [itemDetailOpen, setItemDetailOpen] = useState(false);
  const [itemDetailInitialTab, setItemDetailInitialTab] = useState<'Sales A' | 'Conditions'>('Sales A');
  const [headerDialogOpen, setHeaderDialogOpen] = useState(false);

  const [saved, setSaved] = useState<SalesDocument | null>(null);

  const selectedItem = items.find((i) => i.lineNumber === selectedLine) ?? null;

  function initialEntriesValid(): boolean {
    setInitialError(null);
    const wrong = VA21_CONFIG.initialScreen.fields.filter(
      (f) => f.value && (initialValues[f.name] ?? '').trim().toUpperCase() !== f.value.toUpperCase(),
    );
    if (wrong.length > 0) {
      setInitialError(`Check your entries — ${wrong.map((f) => f.label).join(', ')} must match exactly.`);
      return false;
    }
    return true;
  }

  async function handleCreateWithReference() {
    if (!initialEntriesValid()) return;
    setContinueNotice(false);
    const docs = await listDocuments(studentKey, 'inquiry');
    setInquiryDocs(docs.filter((d) => d.status === 'complete'));
    logEvent(studentKey, 'search_dialog_opened', { for: 'create-with-reference', docType: 'inquiry' });
    setCreateRefOpen(true);
  }

  function handleContinue() {
    if (!initialEntriesValid()) return;
    setContinueNotice(true);
  }

  function copyFromInquiry(doc: SalesDocument) {
    setInquiry(doc);
    setValidFrom(doc.validFrom ?? todayIso());
    setRequestedDeliveryDate(doc.requestedDeliveryDate ?? todayIso());
    setItems(doc.items.map((i) => ({ ...i, itemConditions: [] })));
    logEvent(studentKey, 'create_with_reference_used', { predecessorId: doc.id }, doc.id);
    setCreateRefOpen(false);
    setPhase('steps');
  }

  function pricingFor(items: SalesDocumentItem[], headerConditions: AppliedCondition[]) {
    return priceDocument(
      items.map((i) => ({ materialId: i.materialId, quantity: i.quantity, itemConditions: i.itemConditions })),
      headerConditions,
      getMaterial,
    );
  }

  function navigateItem(direction: 'first' | 'prev' | 'next' | 'last') {
    const idx = items.findIndex((i) => i.lineNumber === selectedLine);
    if (idx < 0) return;
    const target =
      direction === 'first'
        ? 0
        : direction === 'last'
          ? items.length - 1
          : direction === 'next'
            ? Math.min(idx + 1, items.length - 1)
            : Math.max(idx - 1, 0);
    setSelectedLine(items[target].lineNumber);
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

  async function handleSave(complete = true) {
    const docItems = items.map((item, idx) => ({ ...item, itemNetValue: pricing.itemNetValues[idx] }));
    const fields = {
      docType: 'quotation' as const,
      assignmentId: instance.assignmentId,
      studentKey,
      predecessorId: inquiry!.id,
      customerId: inquiry!.customerId,
      custReference,
      custReferenceDate,
      validFrom: null,
      validTo: validTo || null,
      requestedDeliveryDate: requestedDeliveryDate || null,
      items: docItems,
      headerConditions,
      status: complete ? ('complete' as const) : ('in_progress' as const),
      savedAt: new Date().toISOString(),
    };
    const doc = draftDoc ? await updateDocument(draftDoc.id, fields) : await createDocument(fields);
    logEvent(studentKey, 'document_saved', { docId: doc.id, docType: 'quotation', status: fields.status }, doc.id);
    onDocumentSaved(doc);
    if (complete) {
      setDraftDoc(null);
      setSaved(doc);
    } else {
      setDraftDoc(doc);
      setSavedIncomplete(doc);
    }
  }

  if (savedIncomplete) {
    return (
      <div>
        <MessageStrip design="Positive">
          Quotation saved as <strong>{savedIncomplete.id}</strong> — check the status bar at the bottom.
        </MessageStrip>
        <MessageStrip design="Information" style={{ marginTop: 12 }}>
          This quotation is incomplete: a date is still missing. SAP kept what you entered — go back into it, fill in
          the missing date and save again.
        </MessageStrip>
        <Button design="Emphasized" style={{ marginTop: 16 }} onClick={() => setSavedIncomplete(null)}>
          Edit Document
        </Button>
      </div>
    );
  }

  // After a successful save real SAP drops you on a fresh, empty Overview and says "Quotation N has
  // been saved" only in the status bar — so the number is deliberately not repeated on this screen.
  if (saved) {
    return (
      <div>
        <ReferenceDocumentsButton instance={instance} />
        <ActivityLayout
          instructions={
            <div>
              <Title level="H5">Quotation saved</Title>
              <p>
                SAP confirmed the save in the status bar at the bottom of the screen — look there for your quotation
                number, not in this panel. The screen itself just reset to a new, empty quotation.
              </p>
              <p>
                A blank browser tab may also have opened just now. That is normal SAP behavior; close it and come back
                here.
              </p>
              <Button design="Emphasized" onClick={() => onSaved(saved)}>
                Continue
              </Button>
            </div>
          }
          screen={<BlankOverviewScreen title={`${VA21_CONFIG.title}: Overview`} code={VA21_CONFIG.id} docLabel="Quotation" />}
        />
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
                Enter QT for Quotation Type, UE00 for Sales Organization, WH for Distribution Channel, and BI for
                Division. Then click {VA21_CONFIG.initialScreen.continueLabel}. In the popup, find your inquiry — the
                search icon in the Inquiry field looks it up by Customer PO Number — and click Copy.
              </p>
            </div>
          }
          screen={
            <div>
              <SapChrome title={VA21_CONFIG.initialScreen.title} code={VA21_CONFIG.id} onBack={() => setPhase('menu')} />
              <div className="sap-screen-body">
                {initialError && (
                  <MessageStrip design="Negative" style={{ marginBottom: 12 }}>
                    {initialError}
                  </MessageStrip>
                )}
                {continueNotice && (
                  <MessageStrip design="Information" style={{ marginBottom: 12 }} onClose={() => setContinueNotice(false)}>
                    Not used in this exercise — every quotation here is created with reference to an inquiry.
                  </MessageStrip>
                )}
                <InitialScreenFields
                  fields={VA21_CONFIG.initialScreen.fields}
                  editable
                  values={initialValues}
                  onChange={(name, value) => setInitialValues((prev) => ({ ...prev, [name]: value }))}
                />
                <FooterActions>
                  <Button design="Emphasized" onClick={handleContinue}>
                    Continue
                  </Button>
                  <Button design="Transparent" onClick={handleCreateWithReference}>
                    {VA21_CONFIG.initialScreen.continueLabel}
                  </Button>
                </FooterActions>
              </div>
            </div>
          }
        />
        <CreateWithReferenceDialog
          open={createRefOpen}
          activeTab="Inquiry"
          docLabel="Inquiry"
          documents={inquiryDocs}
          onCopy={copyFromInquiry}
          onClose={() => setCreateRefOpen(false)}
        />
      </div>
    );
  }

  // Item Data is a full screen navigation, not a popup (Kent, 2026-11-02) — it replaces the
  // Overview screen pane entirely while open.
  if (itemDetailOpen && selectedItem) {
    return (
      <div>
        <ReferenceDocumentsButton instance={instance} />
        <ActivityLayout
          instructions={
            <div>
              <Title level="H5">Item Data</Title>
              <p>
                {itemDetailInitialTab === 'Conditions'
                  ? 'On the Conditions tab, type K004 in the blank CnTy cell and the per-unit discount from your assignment brief in the Amount cell, press Enter, then Save.'
                  : 'Order Probability was copied from the inquiry. Use the Conditions tab (or the currency icon on the Overview) to enter the K004 discount.'}
              </p>
            </div>
          }
          screen={
            <ItemDetailPanel
              key={`${selectedItem.lineNumber}-${itemDetailInitialTab}`}
              title={VA21_CONFIG.title}
              code={VA21_CONFIG.id}
              materialId={selectedItem.materialId}
              lineNumber={selectedItem.lineNumber}
              quantity={selectedItem.quantity}
              itemCategory={{ code: 'AGN', label: 'Standard Item' }}
              orderProbability={inquiry?.items.find((i) => i.lineNumber === selectedItem.lineNumber)?.orderProbability ?? null}
              conditionDef={K004}
              appliedCondition={selectedItem.itemConditions[0] ?? null}
              onCommitCondition={commitItemCondition}
              onNavigate={items.length > 1 ? navigateItem : undefined}
              initialTab={itemDetailInitialTab}
              onBack={() => setItemDetailOpen(false)}
            />
          }
        />
      </div>
    );
  }

  // Header Data is a full screen too, reached through Menu > Goto > Header > Conditions.
  if (headerDialogOpen) {
    const grossTotal = items.reduce((sum, item) => sum + getMaterial(item.materialId).basePrice * item.quantity, 0);
    const itemDiscountTotal = pricing.itemNetValues.reduce((sum, v) => sum + v, 0) - grossTotal;
    const headerCustomer = inquiry ? getCustomer(inquiry.customerId) : null;
    return (
      <div>
        <ReferenceDocumentsButton instance={instance} />
        <ActivityLayout
          instructions={
            <div>
              <Title level="H5">Header Data</Title>
              <p>
                Type RA00 in the blank CnTy cell and the percentage from your assignment brief in the Amount cell,
                press Enter, then click Activate. The discount does not apply until you do.
              </p>
            </div>
          }
          screen={
            <HeaderDataPanel
              title={VA21_CONFIG.title}
              code={VA21_CONFIG.id}
              custReference={custReference}
              customerId={inquiry?.customerId ?? ''}
              customerLine={headerCustomer ? `${headerCustomer.name}, ${headerCustomer.city}, ${headerCustomer.country}` : ''}
              grossValue={grossTotal}
              itemDiscount={itemDiscountTotal}
              conditionDef={RA00}
              appliedCondition={headerConditions[0] ?? null}
              onCommitCondition={commitHeaderCondition}
              onActivate={activateHeaderDiscount}
              onBack={() => setHeaderDialogOpen(false)}
            />
          }
        />
      </div>
    );
  }

  function validateAndSave() {
    // Dates are what SAP treats as required here; a blank Cust. Reference saves without complaint and
    // only surfaces later, when nothing can find the quotation by PO number.
    if (!custReferenceDate || !validTo || !requestedDeliveryDate) {
      logEvent(studentKey, 'document_save_blocked', { reason: 'incomplete' });
      setIncompleteOpen(true);
      return;
    }
    if (warningIndex < SAVE_WARNINGS.length) {
      setWarningsActive(true);
      return;
    }
    handleSave();
  }

  const pendingWarning = warningsActive && warningIndex < SAVE_WARNINGS.length ? SAVE_WARNINGS[warningIndex] : undefined;

  const expectedOrderValue = items.reduce((sum, item, idx) => {
    const probability = inquiry?.items.find((i) => i.lineNumber === item.lineNumber)?.orderProbability ?? 0;
    return sum + pricing.itemNetValues[idx] * (probability / 100);
  }, 0);

  const customer = inquiry ? getCustomer(inquiry.customerId) : null;
  const customerLine = customer ? `${customer.name}, ${customer.city}, ${customer.country}` : '';

  // The exercise says "Goto ▸ Header ▸ Conditions" — a real menu path in SAP, so the Menu works.
  const MENU_ITEMS: MenuItem[] = [
    { label: 'Quotation' },
    { label: 'Edit' },
    {
      label: 'Goto',
      children: [
        {
          label: 'Header',
          children: [
            { label: 'Sales' },
            { label: 'Shipping' },
            { label: 'Billing Document' },
            { label: 'Conditions', onSelect: () => setHeaderDialogOpen(true) },
            { label: 'Partners' },
            { label: 'Texts' },
          ],
        },
        { label: 'Item' },
      ],
    },
    { label: 'Extras' },
    { label: 'Environment' },
    { label: 'System' },
    { label: 'Help' },
  ];

  const instructionsPane = (
    <div>
      <Title level="H5">Create Quotation: Overview</Title>
      <p>
        The customer, dates and materials were copied from your inquiry — but SAP does not carry Customer Reference
        forward. Re-enter the same Customer PO Number, set the reference date to today, Valid To to one month from
        today, and the requested delivery date to one month from today.
      </p>
      <p>
        Your assignment brief authorizes a per-unit discount on the Deluxe Touring Bike. Select that item and click the
        currency icon in the items toolbar (Item Conditions), then enter condition type K004 with that amount.
      </p>
      <p>
        It also authorizes a percentage discount on the whole order: open <strong>Menu ▸ Goto ▸ Header ▸ Conditions</strong>,
        enter RA00 with that percentage, then Activate it — it will not apply until you do.
      </p>
      <p>
        Check the discounted net value, then Save. Your new quotation number will appear in the status bar at the
        bottom of the screen.
      </p>
    </div>
  );

  const screenPane = (
    <div>
      <SapChrome
        title={`${VA21_CONFIG.title}: Overview`}
        code={VA21_CONFIG.id}
        toolbarIcons={OVERVIEW_TOOLBAR_ICONS}
        menuItems={MENU_ITEMS}
      />
      <div className="sap-screen-body">
        {pendingWarning && (
          <MessageStrip design={pendingWarning.kind === 'warning' ? 'Negative' : 'Information'} style={{ marginBottom: 12 }} hideCloseButton>
            {pendingWarning.message}
            <div style={{ marginTop: 8 }}>
              <Button onClick={() => setWarningIndex((i) => i + 1)}>
                {pendingWarning.dismissAction === 'enter' ? 'Enter' : '✓ OK'}
              </Button>
            </div>
          </MessageStrip>
        )}

        <div className="field-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div className="field-row-inline">
            <label>Quotation:</label>
            <span className="sap-display-value" style={{ minWidth: 120 }}>
              &nbsp;
            </span>
          </div>
          <div className="field-row-inline">
            <label>Net Value:</label>
            <span className="sap-display-value">{formatCurrency(pricing.netValue)}</span>
          </div>
        </div>

        <div className="field-row field-row-inline">
          <label>Sold-to Party:</label>
          <span className="sap-display-value" style={{ minWidth: 140 }}>
            {inquiry?.customerId}
          </span>
          <span>{customerLine}</span>
        </div>

        <div className="field-row field-row-inline">
          <label>Ship-to Party:</label>
          <span className="sap-display-value" style={{ minWidth: 140 }}>
            {inquiry?.customerId}
          </span>
          <span>{customerLine}</span>
        </div>

        <div className="field-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 48 }}>
          <div className="field-row-inline">
            <label>Cust. Reference:</label>
            <input value={custReference} onChange={(e) => setCustReference(e.target.value)} />
          </div>
          <div className="field-row-inline">
            <label>Cust. Ref. Date:</label>
            <input type="date" value={custReferenceDate} onChange={(e) => setCustReferenceDate(e.target.value)} />
          </div>
        </div>
      </div>

      <DocumentTabStrip tabs={OVERVIEW_TABS} active="Item Overview" />
      <div className="sap-screen-body">
        <div className="field-row" style={{ display: 'flex', gap: 48 }}>
          <div className="field-row-inline">
            <label>Valid From:</label>
            <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </div>
          <div className="field-row-inline">
            <label>Valid To:</label>
            <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          </div>
        </div>
        <div className="field-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div className="field-row-inline">
            <label className="required">Req. Deliv. Date:</label>
            <input value="D" disabled style={{ width: 28, textAlign: 'center' }} />
            <input type="date" value={requestedDeliveryDate} onChange={(e) => setRequestedDeliveryDate(e.target.value)} />
          </div>
          <div className="field-row-inline">
            <label>Expect.Ord.Val.:</label>
            <span className="sap-display-value">{formatCurrency(expectedOrderValue)}</span>
          </div>
        </div>

        <ItemsGrid
          items={items}
          selectedLines={selectedLine !== null ? [selectedLine] : []}
          onToggleSelect={(line) => setSelectedLine((cur) => (cur === line ? null : line))}
          onRowOpen={(line) => {
            setSelectedLine(line);
            setItemDetailInitialTab('Sales A');
            setItemDetailOpen(true);
          }}
          onOpenConditions={(line) => {
            setSelectedLine(line);
            setItemDetailInitialTab('Conditions');
            setItemDetailOpen(true);
          }}
          readOnly
        />

        <FooterActions>
          <Button design="Emphasized" onClick={validateAndSave}>
            Save
          </Button>
          <Button design="Transparent" onClick={() => setPhase('initial')}>
            Cancel
          </Button>
        </FooterActions>
      </div>
    </div>
  );

  return (
    <div>
      <ReferenceDocumentsButton instance={instance} />
      <ActivityLayout instructions={instructionsPane} screen={screenPane} />

      <Dialog open={incompleteOpen} headerText="Save Incomplete Document" onAfterClose={() => setIncompleteOpen(false)}>
        <div className="incomplete-dialog">
          <p>Document Incomplete</p>
          <p className="incomplete-question">Would you like to save or edit the incomplete document?</p>
          <div className="incomplete-actions">
            <Button
              design="Default"
              onClick={() => {
                setIncompleteOpen(false);
                handleSave(false);
              }}
            >
              Save
            </Button>
            <Button design="Default" onClick={() => setIncompleteOpen(false)}>
              Edit
            </Button>
            <Button design="Default" onClick={() => setIncompleteOpen(false)}>
              <Icon name="decline" className="cwr-decline" /> Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
