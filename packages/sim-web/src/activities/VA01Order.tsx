import FooterActions from '../components/FooterActions';
import { useState } from 'react';
import { Button, Dialog, Icon, MessageStrip, Title } from '@ui5/webcomponents-react';
import type { AssignmentInstance, SalesDocument } from '@sap-sim/shared';
import { VA01_CONFIG, getConditionType, getCustomer, getMaterial } from '@sap-sim/engine';
import ActivityLayout from '../components/ActivityLayout';
import ReferenceDocumentsButton from '../components/ReferenceDocumentsModal';
import SapChrome, { type MenuItem } from '../components/SapChrome';
import OrderOverview, { type OrderFocusRequest } from '../components/OrderOverview';
import type { StatusMessage } from '../components/StatusBar';
import ItemDetailPanel from '../components/ItemDetailPanel';
import HeaderDataPanel from '../components/HeaderDataPanel';
import EasyAccessMenu from '../components/EasyAccessMenu';
import InitialScreenFields from '../components/InitialScreenFields';
import CreateWithReferenceDialog from '../components/CreateWithReferenceDialog';
import { createDocument, listDocuments, logEvent, updateDocument } from '../api';

// Real SAP titles the screen after the order type once it is known: "Create Standard Order: Overview".
const SCREEN_TITLE = 'Create Standard Order';

const K004 = getConditionType('K004');
const RA00 = getConditionType('RA00');

export default function VA01Order({
  instance,
  studentKey,
  onStatus,
  onDocumentSaved,
  onSaved,
}: {
  instance: AssignmentInstance;
  studentKey: string;
  /** Pushes a message into the shell's status bar (e.g. "Enter Customer Reference"). */
  onStatus: (message: StatusMessage | null) => void;
  /** Fired immediately on save, while still showing the in-screen confirmation — drives the status bar. */
  onDocumentSaved: (doc: SalesDocument) => void;
  onSaved: (doc: SalesDocument) => void;
}) {
  const [phase, setPhase] = useState<'menu' | 'initial' | 'steps'>('menu');
  const [continueNotice, setContinueNotice] = useState(false);
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [initialError, setInitialError] = useState<string | null>(null);
  const [createRefOpen, setCreateRefOpen] = useState(false);
  const [quotationDocs, setQuotationDocs] = useState<SalesDocument[]>([]);
  const [quotation, setQuotation] = useState<SalesDocument | null>(null);

  // Provisional until Kent shares the real Order Overview: Cust. Reference and its date are
  // re-entered like on the quotation; the delivery date, items and pricing are copied.
  const [custReference, setCustReference] = useState('');
  const [custReferenceDate, setCustReferenceDate] = useState('');
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('');
  const [focusRequest, setFocusRequest] = useState<OrderFocusRequest | null>(null);
  const [incompleteOpen, setIncompleteOpen] = useState(false);
  // The first required field still empty when Save was pressed; "Edit" in the popup jumps back to it.
  const [missingField, setMissingField] = useState<OrderFocusRequest['field']>('custReference');
  const [draftDoc, setDraftDoc] = useState<SalesDocument | null>(null);
  const [savedIncomplete, setSavedIncomplete] = useState<SalesDocument | null>(null);

  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [itemDetailOpen, setItemDetailOpen] = useState(false);
  const [itemDetailInitialTab, setItemDetailInitialTab] = useState<'Sales A' | 'Conditions'>('Sales A');
  const [headerDialogOpen, setHeaderDialogOpen] = useState(false);

  const [saved, setSaved] = useState<SalesDocument | null>(null);

  const items = quotation?.items ?? [];
  const selectedItem = items.find((i) => i.lineNumber === selectedLine) ?? null;

  function initialEntriesValid(): boolean {
    setInitialError(null);
    const wrong = VA01_CONFIG.initialScreen.fields.filter(
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
    const docs = await listDocuments(studentKey, 'quotation');
    setQuotationDocs(docs.filter((d) => d.status === 'complete'));
    logEvent(studentKey, 'search_dialog_opened', { for: 'create-with-reference', docType: 'quotation' });
    setCreateRefOpen(true);
  }

  function handleContinue() {
    if (!initialEntriesValid()) return;
    setContinueNotice(true);
  }

  function copyFromQuotation(doc: SalesDocument) {
    setQuotation(doc);
    setRequestedDeliveryDate(doc.requestedDeliveryDate ?? '');
    logEvent(studentKey, 'create_with_reference_used', { predecessorId: doc.id }, doc.id);
    setCreateRefOpen(false);
    setPhase('steps');
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

  async function handleSave(complete = true) {
    if (!quotation) return;
    const fields = {
      docType: 'order' as const,
      assignmentId: instance.assignmentId,
      studentKey,
      predecessorId: quotation.id,
      customerId: quotation.customerId,
      custReference,
      custReferenceDate,
      validFrom: null,
      validTo: null,
      requestedDeliveryDate: requestedDeliveryDate || null,
      items: quotation.items,
      headerConditions: quotation.headerConditions,
      status: complete ? ('complete' as const) : ('in_progress' as const),
      savedAt: new Date().toISOString(),
    };
    const doc = draftDoc ? await updateDocument(draftDoc.id, fields) : await createDocument(fields);
    logEvent(studentKey, 'document_saved', { docId: doc.id, docType: 'order', status: fields.status }, doc.id);
    onDocumentSaved(doc);
    if (complete) {
      setDraftDoc(null);
      setSaved(doc);
    } else {
      setDraftDoc(doc);
      setSavedIncomplete(doc);
    }
  }

  function focusField(field: OrderFocusRequest['field']) {
    setFocusRequest((prev) => ({ field, tick: (prev?.tick ?? 0) + 1 }));
  }

  function validateAndSave() {
    // Real SAP puts "Enter Customer Reference" in the status bar AND opens "Save Incomplete
    // Document" (Kent's 2026-11-02 screenshot, Cust. Reference and date both blank). The message
    // for a blank date alone is a provisional guess; the requested delivery date arrives copied, so
    // it only trips if the student clears it, and then there is no status message.
    const missing: OrderFocusRequest['field'] | null = !custReference.trim()
      ? 'custReference'
      : !custReferenceDate
        ? 'custReferenceDate'
        : !requestedDeliveryDate
          ? 'requestedDeliveryDate'
          : null;
    if (!missing) {
      handleSave();
      return;
    }
    logEvent(studentKey, 'document_save_blocked', { reason: 'incomplete', missing });
    if (missing === 'custReference') onStatus({ text: 'Enter Customer Reference', kind: 'warning' });
    if (missing === 'custReferenceDate') onStatus({ text: 'Enter Customer Reference Date', kind: 'warning' });
    setMissingField(missing);
    setIncompleteOpen(true);
  }

  if (savedIncomplete) {
    return (
      <div>
        <MessageStrip design="Positive">
          Order saved as <strong>{savedIncomplete.id}</strong> — check the status bar at the bottom.
        </MessageStrip>
        <MessageStrip design="Information" style={{ marginTop: 12 }}>
          This order is incomplete: Customer Reference or its date is still missing. SAP kept what you entered — go
          back into it, fill in what is missing and save again.
        </MessageStrip>
        <Button design="Emphasized" style={{ marginTop: 16 }} onClick={() => setSavedIncomplete(null)}>
          Edit Document
        </Button>
      </div>
    );
  }

  if (saved) {
    return (
      <div>
        <ReferenceDocumentsButton instance={instance} />
        <ActivityLayout
          instructions={
            <div>
              <Title level="H5">Order saved</Title>
              <p>
                SAP confirmed the save in the status bar at the bottom of the screen — look there for your sales order
                number, not in this panel. The screen itself just reset to a new, empty order.
              </p>
              <Button design="Emphasized" onClick={() => onSaved(saved)}>
                Continue
              </Button>
            </div>
          }
          screen={<OrderOverview key="blank" mode="blank" title={`${SCREEN_TITLE}: Overview`} code={VA01_CONFIG.id} />}
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
                Enter OR for Order Type, UE00 for Sales Organization, WH for Distribution Channel, and BI for
                Division. Then click {VA01_CONFIG.initialScreen.continueLabel}. In the popup, find your quotation — the
                search icon in the Quot. field looks it up by Customer PO Number — and click Copy.
              </p>
            </div>
          }
          screen={
            <div>
              <SapChrome title={VA01_CONFIG.initialScreen.title} code={VA01_CONFIG.id} onBack={() => setPhase('menu')} />
              <div className="sap-screen-body">
                {initialError && (
                  <MessageStrip design="Negative" style={{ marginBottom: 12 }}>
                    {initialError}
                  </MessageStrip>
                )}
                {continueNotice && (
                  <MessageStrip design="Information" style={{ marginBottom: 12 }} onClose={() => setContinueNotice(false)}>
                    Not used in this exercise — every order here is created with reference to a quotation.
                  </MessageStrip>
                )}
                <InitialScreenFields
                  fields={VA01_CONFIG.initialScreen.fields}
                  editable
                  values={initialValues}
                  onChange={(name, value) => setInitialValues((prev) => ({ ...prev, [name]: value }))}
                />
                <FooterActions>
                  <Button design="Emphasized" onClick={handleContinue}>
                    Continue
                  </Button>
                  <Button design="Transparent" onClick={handleCreateWithReference}>
                    {VA01_CONFIG.initialScreen.continueLabel}
                  </Button>
                </FooterActions>
              </div>
            </div>
          }
        />
        <CreateWithReferenceDialog
          open={createRefOpen}
          activeTab="Quotation"
          docLabel="Quot."
          documents={quotationDocs}
          onCopy={copyFromQuotation}
          onClose={() => setCreateRefOpen(false)}
        />
      </div>
    );
  }

  const customer = quotation ? getCustomer(quotation.customerId) : null;
  const customerLine = customer ? `${customer.name}, ${customer.city}, ${customer.country}` : '';

  // The order's items and pricing are copied and not edited here, so Item Data and Header Data are
  // read-only views: the student can look at where the net value comes from, not change it.
  if (itemDetailOpen && selectedItem) {
    return (
      <div>
        <ReferenceDocumentsButton instance={instance} />
        <ActivityLayout
          instructions={
            <div>
              <Title level="H5">Item Data</Title>
              <p>
                The quantity and the K004 discount came across from your quotation. Nothing needs to change here —
                this is where to look if the net value is not what you expected.
              </p>
            </div>
          }
          screen={
            <ItemDetailPanel
              key={`${selectedItem.lineNumber}-${itemDetailInitialTab}`}
              title={SCREEN_TITLE}
              code={VA01_CONFIG.id}
              materialId={selectedItem.materialId}
              lineNumber={selectedItem.lineNumber}
              quantity={selectedItem.quantity}
              itemCategory={{ code: 'TAN', label: 'Standard Item' }}
              orderProbability={null}
              conditionDef={K004}
              appliedCondition={selectedItem.itemConditions[0] ?? null}
              onNavigate={items.length > 1 ? navigateItem : undefined}
              initialTab={itemDetailInitialTab}
              onBack={() => setItemDetailOpen(false)}
            />
          }
        />
      </div>
    );
  }

  if (headerDialogOpen && quotation) {
    const grossTotal = items.reduce((sum, item) => sum + getMaterial(item.materialId).basePrice * item.quantity, 0);
    const itemDiscountTotal = quotation.items.reduce((sum, i) => sum + i.itemNetValue, 0) - grossTotal;
    return (
      <div>
        <ReferenceDocumentsButton instance={instance} />
        <ActivityLayout
          instructions={
            <div>
              <Title level="H5">Header Data</Title>
              <p>The header discount was copied from your quotation along with everything else.</p>
            </div>
          }
          screen={
            <HeaderDataPanel
              title={SCREEN_TITLE}
              code={VA01_CONFIG.id}
              docLabel="Standard Order"
              custReference={custReference}
              customerId={quotation.customerId}
              customerLine={customerLine}
              grossValue={grossTotal}
              itemDiscount={itemDiscountTotal}
              conditionDef={RA00}
              appliedCondition={quotation.headerConditions[0] ?? null}
              onBack={() => setHeaderDialogOpen(false)}
            />
          }
        />
      </div>
    );
  }

  const MENU_ITEMS: MenuItem[] = [
    { label: 'Sales document' },
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
      <Title level="H5">{SCREEN_TITLE}: Overview</Title>
      <p>
        The customer, delivery date, materials and discounts were all copied from your quotation — but, as before, SAP
        does not carry Customer Reference forward. Re-enter the same Customer PO Number and set the reference date to
        today.
      </p>
      <p>
        Compare the Net Value with the quotation's: nothing was typed in again, so it should match. Then Save. Your new
        sales order number will appear in the status bar at the bottom of the screen.
      </p>
    </div>
  );

  const screenPane = (
    <OrderOverview
      key="live"
      mode="live"
      title={`${SCREEN_TITLE}: Overview`}
      code={VA01_CONFIG.id}
      menuItems={MENU_ITEMS}
      customerId={quotation?.customerId}
      netValue={quotation?.netValue ?? 0}
      items={items}
      selectedLine={selectedLine}
      onSelectLine={setSelectedLine}
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
      custReference={custReference}
      custReferenceDate={custReferenceDate}
      onCustReferenceChange={setCustReference}
      onCustReferenceDateChange={setCustReferenceDate}
      requestedDeliveryDate={requestedDeliveryDate}
      onRequestedDeliveryDateChange={setRequestedDeliveryDate}
      focusRequest={focusRequest}
      onSave={validateAndSave}
      onCancel={() => setPhase('initial')}
    />
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
            <Button
              design="Default"
              onClick={() => {
                setIncompleteOpen(false);
                focusField(missingField);
              }}
            >
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
