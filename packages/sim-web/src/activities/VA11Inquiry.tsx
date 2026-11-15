import FooterActions from '../components/FooterActions';
import { useState } from 'react';
import { Button, Icon, MessageStrip, Title } from '@ui5/webcomponents-react';
import type { AssignmentInstance, SalesDocument, SalesDocumentItem } from '@sap-sim/shared';
import { CUSTOMERS, MATERIALS, VA11_CONFIG, priceDocument, getMaterial } from '@sap-sim/engine';
import ActivityLayout from '../components/ActivityLayout';
import ReferenceDocumentsButton from '../components/ReferenceDocumentsModal';
import SapChrome, { OVERVIEW_TOOLBAR_ICONS } from '../components/SapChrome';
import ItemsGrid from '../components/ItemsGrid';
import ItemDetailPanel from '../components/ItemDetailPanel';
import EasyAccessMenu from '../components/EasyAccessMenu';
import DocumentTabStrip from '../components/DocumentTabStrip';
import InitialScreenFields from '../components/InitialScreenFields';

const OVERVIEW_TABS = ['Sales', 'Item Overview', 'Item detail', 'Ordering party', 'Procurement', 'Shipping', 'Reason for rejection'];
import SearchDialog, { type SearchItem } from '../components/SearchDialog';
import { createDocument, logEvent } from '../api';
import { todayIso, monthFromNowIso } from '../dateUtils';
import { formatCurrency } from '../formatUtils';

// Column order matches Kent's 2026-11-02 screenshot of the real results grid: Search term (the
// last 3 digits of the customer number), Ctry/Reg., Postal Code, City, Name 1, Customer, D
// (deletion flag), Std.Address. We only have a small curated pool, so unlike the real training
// system this never returns 500+ near-duplicate rows.
const CUSTOMER_RESULT_COLUMNS = ['Search term', 'Ctry/Reg.', 'Postal Code', 'City', 'Name 1', 'Customer', 'D', 'Std.Address'];
const CUSTOMER_ITEMS: SearchItem[] = CUSTOMERS.map((c) => ({
  id: c.id,
  label: c.name,
  sublabel: `${c.city}, ${c.country}`,
  columns: [c.id.slice(-3), c.country, c.postalCode, c.city, c.name, c.id, '', 'X'],
}));
// Column order matches Kent's 2026-11-02 screenshot of the real results grid: Material
// description, Language, Material — language is always "EN", there's no per-material language data.
const MATERIAL_RESULT_COLUMNS = ['Material description', 'Language', 'Material'];
const MATERIAL_ITEMS: SearchItem[] = MATERIALS.map((m) => ({
  id: m.id,
  label: m.description,
  sublabel: `$${m.basePrice}/unit`,
  columns: [m.description, 'EN', m.id],
}));

interface DraftItem {
  lineNumber: number;
  materialId: string;
  quantity: number;
  orderProbability: number;
}

function nextLineNumber(items: DraftItem[]): number {
  return items.length === 0 ? 10 : Math.max(...items.map((i) => i.lineNumber)) + 10;
}

export default function VA11Inquiry({
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
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [initialError, setInitialError] = useState<string | null>(null);
  const [createWithReferenceNotice, setCreateWithReferenceNotice] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);

  const [soldToParty, setSoldToParty] = useState<SearchItem | null>(null);
  // Real SAP only shows the matchcode icon once you click into the field (Kent, 2026-11-02).
  const [soldToFocused, setSoldToFocused] = useState(false);
  const [custReference, setCustReference] = useState('');
  const [custReferenceDate, setCustReferenceDate] = useState(todayIso());
  const [validFrom, setValidFrom] = useState(todayIso());
  const [validTo, setValidTo] = useState(monthFromNowIso());
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState(todayIso());
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saved, setSaved] = useState<SalesDocument | null>(null);
  const [showBlankTabNotice, setShowBlankTabNotice] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Per Kent's 2026-11-01 note: the pink "required and empty" tint only appears after a failed
  // Save attempt — fields start plain white, not pre-flagged just for being blank.
  const [saveAttempted, setSaveAttempted] = useState(false);

  // Selection on the items grid — doubles as "rows to remove" and "the item the toolbar's
  // item-detail icon opens" (same as real SAP: select a row, then act on it).
  const [selectedLines, setSelectedLines] = useState<number[]>([]);
  const [itemDetailOpen, setItemDetailOpen] = useState(false);
  const [itemDetailInitialTab, setItemDetailInitialTab] = useState<'Sales A' | 'Conditions'>('Sales A');

  const selectedLine = selectedLines[0] ?? null;
  const selectedItem = items.find((i) => i.lineNumber === selectedLine) ?? null;

  function handleInitialContinue() {
    setInitialError(null);
    const wrong = VA11_CONFIG.initialScreen.fields.filter(
      (f) => f.value && (initialValues[f.name] ?? '').trim().toUpperCase() !== f.value.toUpperCase(),
    );
    if (wrong.length > 0) {
      setInitialError(`Check your entries — ${wrong.map((f) => f.label).join(', ')} must match exactly.`);
      return;
    }
    setPhase('steps');
  }

  function addMaterial(item: SearchItem) {
    setItems((prev) => [...prev, { lineNumber: nextLineNumber(prev), materialId: item.id, quantity: 0, orderProbability: 30 }]);
    setMaterialDialogOpen(false);
  }

  function removeSelected() {
    setItems((prev) => prev.filter((i) => !selectedLines.includes(i.lineNumber)));
    setSelectedLines([]);
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
    setSelectedLines([items[target].lineNumber]);
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
      lineNumber: item.lineNumber,
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
      requestedDeliveryDate,
      items: docItems,
      headerConditions: [],
      status: 'complete',
      savedAt: new Date().toISOString(),
    });
    logEvent(studentKey, 'document_saved', { docId: doc.id, docType: 'inquiry' }, doc.id);
    setSaved(doc);
    onDocumentSaved(doc);
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
                <strong>{VA11_CONFIG.menuPath.join(' ▸ ')}</strong>.
              </p>
            </div>
          }
          screen={
            <EasyAccessMenu
              targetPath={VA11_CONFIG.menuPath}
              onNavigate={() => {
                logEvent(studentKey, 'menu_navigated', { transaction: 'VA11' });
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
              <Title level="H5">{VA11_CONFIG.initialScreen.title}</Title>
              <p>
                Enter IN for Inquiry Type, UE00 for Sales Organization, WH for Distribution Channel, and BI for
                Division. Then click {VA11_CONFIG.initialScreen.continueLabel}.
              </p>
            </div>
          }
          screen={
            <div>
              <SapChrome title={VA11_CONFIG.initialScreen.title} code={VA11_CONFIG.id} onBack={() => setPhase('menu')} />
              <div className="sap-screen-body">
                {initialError && (
                  <MessageStrip design="Negative" style={{ marginBottom: 12 }}>
                    {initialError}
                  </MessageStrip>
                )}
                {createWithReferenceNotice && (
                  <MessageStrip design="Information" style={{ marginBottom: 12 }} onClose={() => setCreateWithReferenceNotice(false)}>
                    Not used in this exercise — an inquiry is the first document in the chain, so there's no earlier
                    inquiry to reference.
                  </MessageStrip>
                )}
                <InitialScreenFields
                  fields={VA11_CONFIG.initialScreen.fields}
                  editable
                  values={initialValues}
                  onChange={(name, value) => setInitialValues((prev) => ({ ...prev, [name]: value }))}
                />
                <FooterActions>
                  <Button design="Transparent" onClick={() => setCreateWithReferenceNotice(true)}>
                    Create with Reference
                  </Button>
                  <Button design="Emphasized" onClick={handleInitialContinue}>
                    {VA11_CONFIG.initialScreen.continueLabel}
                  </Button>
                </FooterActions>
              </div>
            </div>
          }
        />
      </div>
    );
  }

  function validateAndSave() {
    setSaveError(null);
    setSaveAttempted(true);
    const missing: string[] = [];
    if (!soldToParty) missing.push('Sold-To Party');
    if (!custReference) missing.push('Cust. Reference');
    if (!custReferenceDate) missing.push('Customer Ref. Date');
    if (!validFrom) missing.push('Valid From');
    if (!validTo) missing.push('Valid To');
    if (!requestedDeliveryDate) missing.push('Req. Deliv. Date');
    if (items.length === 0) missing.push('at least one material');
    else if (items.some((i) => !i.quantity || i.quantity <= 0)) missing.push('a quantity for every material');
    if (missing.length > 0) {
      setSaveError(`Enter the required fields marked with an asterisk: ${missing.join(', ')}.`);
      return;
    }
    handleSave();
  }

  // Item Data is a full screen navigation, not a popup (Kent, 2026-11-02) — it replaces the
  // Overview screen pane entirely while open, the same way the initial screen replaces the menu.
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
                  ? 'Not used in this exercise — pricing conditions apply starting at the Quotation.'
                  : 'Order Probability lives on the Sales A tab, buried among several fields that are not used in this exercise.'}
              </p>
            </div>
          }
          screen={
            <ItemDetailPanel
              key={`${selectedItem.lineNumber}-${itemDetailInitialTab}`}
              title={VA11_CONFIG.title}
              code={VA11_CONFIG.id}
              materialId={selectedItem.materialId}
              lineNumber={selectedItem.lineNumber}
              quantity={selectedItem.quantity}
              onQuantityChange={(qty) =>
                setItems((prev) => prev.map((it) => (it.lineNumber === selectedItem.lineNumber ? { ...it, quantity: qty } : it)))
              }
              itemCategory={{ code: 'AFN', label: 'Inquiry Item' }}
              orderProbability={selectedItem.orderProbability}
              onProbabilityChange={(value) =>
                setItems((prev) => prev.map((it) => (it.lineNumber === selectedItem.lineNumber ? { ...it, orderProbability: value } : it)))
              }
              onNavigate={items.length > 1 ? navigateItem : undefined}
              initialTab={itemDetailInitialTab}
              onBack={() => setItemDetailOpen(false)}
            />
          }
        />
      </div>
    );
  }

  const instructionsPane = (
    <div>
      <Title level="H5">Create Inquiry: Overview</Title>
      <p>
        Find the customer named in your assignment brief using the Sold-To Party search — type the full name, or
        the first few letters followed by an asterisk (e.g. "bos*"). Enter the Customer PO Number from your
        assignment brief into Cust. Reference, set the reference date to today, the valid-from date to today, the
        valid-to date to one month from today, and the requested delivery date to today.
      </p>
      <p>
        Add your two materials — the search works the same way — and enter the requested quantities. Each item
        defaults to a 30% order probability; select it and open its detail (the icon in the toolbar) to raise it
        to the value your brief gives you.
      </p>
      <p>
        When everything is filled in, check the net value and Save. Watch the status bar at the bottom of the
        screen, not this panel — that is where your new inquiry number will appear.
      </p>
    </div>
  );

  const screenPane = (
    <div>
      <SapChrome title={`${VA11_CONFIG.title}: Overview`} code={VA11_CONFIG.id} toolbarIcons={OVERVIEW_TOOLBAR_ICONS} />
      <div className="sap-screen-body">
        {saveError && (
          <MessageStrip design="Negative" style={{ marginBottom: 12 }}>
            {saveError}
          </MessageStrip>
        )}

        <div className="field-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div className="field-row-inline">
            <label>Inquiry:</label>
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
          <span className="sap-input-with-icon">
            {soldToParty ? (
              <span
                className="sap-display-value"
                style={{ minWidth: 140, cursor: 'pointer' }}
                tabIndex={0}
                onClick={() => setCustomerDialogOpen(true)}
                onFocus={() => setSoldToFocused(true)}
                onBlur={() => setSoldToFocused(false)}
              >
                {soldToParty.id}
              </span>
            ) : (
              <input
                className={!soldToParty && saveAttempted ? 'partner-field-empty' : undefined}
                value=""
                readOnly
                style={{ width: 140 }}
                onClick={() => setCustomerDialogOpen(true)}
                onFocus={() => setSoldToFocused(true)}
                onBlur={() => setSoldToFocused(false)}
              />
            )}
            {soldToFocused && (
              <span
                className="sap-chrome-icon-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setCustomerDialogOpen(true)}
              >
                <Icon name="duplicate" />
              </span>
            )}
          </span>
          {soldToParty && (
            <span>
              {soldToParty.label}, {soldToParty.sublabel}
            </span>
          )}
        </div>

        <div className="field-row field-row-inline">
          <label>Ship-to Party:</label>
          {soldToParty ? (
            <span className="sap-display-value" style={{ minWidth: 140 }}>
              {soldToParty.id}
            </span>
          ) : (
            <input
              className={!soldToParty && saveAttempted ? 'partner-field-empty' : undefined}
              value=""
              readOnly
              style={{ width: 140 }}
            />
          )}
          {soldToParty && (
            <span>
              {soldToParty.label}, {soldToParty.sublabel}
            </span>
          )}
        </div>

        <div className="field-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          <div>
            <label>Cust. Reference:</label>
            <input value={custReference} onChange={(e) => setCustReference(e.target.value)} />
          </div>
          <div>
            <label>Cust. Ref. Date:</label>
            <input type="date" value={custReferenceDate} onChange={(e) => setCustReferenceDate(e.target.value)} />
          </div>
        </div>
      </div>

      <DocumentTabStrip tabs={OVERVIEW_TABS} active="Item Overview" />
      <div className="sap-screen-body">
        <div className="field-row" style={{ display: 'flex', gap: 24 }}>
          <div>
            <label>Valid From:</label>
            <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </div>
          <div>
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
          selectedLines={selectedLines}
          onToggleSelect={(line) => setSelectedLines((cur) => (cur.includes(line) ? cur.filter((l) => l !== line) : [...cur, line]))}
          onQuantityChange={(line, qty) => setItems((prev) => prev.map((it) => (it.lineNumber === line ? { ...it, quantity: qty } : it)))}
          onAddRow={items.length < 2 ? () => setMaterialDialogOpen(true) : undefined}
          onRemoveSelected={removeSelected}
          onRowOpen={(line) => {
            setSelectedLines([line]);
            setItemDetailInitialTab('Sales A');
            setItemDetailOpen(true);
          }}
          onOpenConditions={(line) => {
            setSelectedLines([line]);
            setItemDetailInitialTab('Conditions');
            setItemDetailOpen(true);
          }}
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
      <SearchDialog
        open={customerDialogOpen}
        entityLabel="A: Customers (General)"
        fields={['Search term', 'Country/Region Key', 'Postal Code', 'City', 'Name', 'Customer', 'Deletion Flag']}
        activeField="Name"
        resultColumns={CUSTOMER_RESULT_COLUMNS}
        items={CUSTOMER_ITEMS}
        onSelect={(item) => {
          setSoldToParty(item);
          setCustomerDialogOpen(false);
        }}
        onClose={() => setCustomerDialogOpen(false)}
      />
      <SearchDialog
        open={materialDialogOpen}
        entityLabel="M: Material by description"
        fields={['Material description', 'Language Key', 'Material']}
        activeField="Material description"
        resultColumns={MATERIAL_RESULT_COLUMNS}
        items={MATERIAL_ITEMS}
        onSelect={addMaterial}
        onClose={() => setMaterialDialogOpen(false)}
      />
    </div>
  );
}
