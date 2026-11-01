import { useState } from 'react';
import { Button, MessageStrip, Title } from '@ui5/webcomponents-react';
import type { AssignmentInstance, SalesDocument, SalesDocumentItem } from '@sap-sim/shared';
import { CUSTOMERS, MATERIALS, VA11_CONFIG, priceDocument, getMaterial } from '@sap-sim/engine';
import ActivityLayout from '../components/ActivityLayout';
import ReferenceDocumentsButton from '../components/ReferenceDocumentsModal';
import SapChrome from '../components/SapChrome';
import ItemsGrid from '../components/ItemsGrid';
import ItemDetailPanel from '../components/ItemDetailPanel';
import EasyAccessMenu from '../components/EasyAccessMenu';
import SearchDialog, { type SearchItem } from '../components/SearchDialog';
import { createDocument, logEvent } from '../api';
import { todayIso, monthFromNowIso } from '../dateUtils';

const CUSTOMER_ITEMS: SearchItem[] = CUSTOMERS.map((c) => ({ id: c.id, label: c.name, sublabel: `${c.city}, ${c.country}` }));
const MATERIAL_ITEMS: SearchItem[] = MATERIALS.map((m) => ({ id: m.id, label: m.description, sublabel: `$${m.basePrice}/unit` }));

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
  const steps = VA11_CONFIG.steps;
  const [phase, setPhase] = useState<'menu' | 'initial' | 'steps'>('menu');
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

  // Materials step selection (for "Remove selected"); Probability step selection (for item detail).
  const [selectedLines, setSelectedLines] = useState<number[]>([]);
  const [itemDetailOpen, setItemDetailOpen] = useState(false);

  const step = steps[stepIndex];
  const selectedLine = selectedLines[0] ?? null;
  const selectedItem = items.find((i) => i.lineNumber === selectedLine) ?? null;

  function addMaterial(item: SearchItem) {
    setItems((prev) => [...prev, { lineNumber: nextLineNumber(prev), materialId: item.id, quantity: 0, orderProbability: 30 }]);
    setMaterialDialogOpen(false);
  }

  function removeSelected() {
    setItems((prev) => prev.filter((i) => !selectedLines.includes(i.lineNumber)));
    setSelectedLines([]);
  }

  function navigateItem(direction: 'prev' | 'next') {
    const idx = items.findIndex((i) => i.lineNumber === selectedLine);
    if (idx < 0) return;
    const nextIdx = direction === 'next' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    setSelectedLines([items[nextIdx].lineNumber]);
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
      requestedDeliveryDate: null,
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
                Every inquiry starts from the same organizational values for this exercise. Confirm them and
                click {VA11_CONFIG.initialScreen.continueLabel}.
              </p>
            </div>
          }
          screen={
            <div>
              <SapChrome title={VA11_CONFIG.initialScreen.title} />
              <div className="sap-screen-body">
                <div className="initial-screen-fields">
                  {VA11_CONFIG.initialScreen.fields.map((f) => (
                    <div className="field-row" key={f.name}>
                      <label>{f.label}</label>
                      <input value={f.value} disabled style={{ width: 100 }} />
                    </div>
                  ))}
                </div>
                <div className="step-actions">
                  <Button onClick={() => setPhase('menu')}>Back</Button>
                  <Button design="Emphasized" onClick={() => setPhase('steps')}>
                    {VA11_CONFIG.initialScreen.continueLabel}
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
      <SapChrome
        title={`${VA11_CONFIG.title}: Overview`}
        itemDetailIcon={step.id === 'probability'}
        itemDetailDisabled={!selectedItem}
        onItemDetail={() => setItemDetailOpen(true)}
      />
      <div className="sap-screen-body">
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
          <ItemsGrid
            items={items}
            selectedLines={selectedLines}
            onToggleSelect={(line) => setSelectedLines((cur) => (cur.includes(line) ? cur.filter((l) => l !== line) : [...cur, line]))}
            onQuantityChange={(line, qty) => setItems((prev) => prev.map((it) => (it.lineNumber === line ? { ...it, quantity: qty } : it)))}
            onAddRow={items.length < 2 ? () => setMaterialDialogOpen(true) : undefined}
            onRemoveSelected={removeSelected}
          />
        )}

        {step.id === 'probability' && (
          <ItemsGrid
            items={items}
            selectedLines={selectedLine !== null ? [selectedLine] : []}
            onToggleSelect={(line) => setSelectedLines((cur) => (cur[0] === line ? [] : [line]))}
            readOnly
          />
        )}

        {step.id === 'review' && (
          <div>
            <p>Sold-To Party: {soldToParty?.label}</p>
            <p>Cust. Reference: {custReference}</p>
            <ItemsGrid items={items} selectedLines={[]} onToggleSelect={() => {}} readOnly />
            <p style={{ marginTop: 12 }}>
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
      {selectedItem && (
        <ItemDetailPanel
          open={itemDetailOpen}
          materialId={selectedItem.materialId}
          lineNumber={selectedItem.lineNumber}
          quantity={selectedItem.quantity}
          orderProbability={selectedItem.orderProbability}
          onProbabilityChange={(value) =>
            setItems((prev) => prev.map((it) => (it.lineNumber === selectedItem.lineNumber ? { ...it, orderProbability: value } : it)))
          }
          onNavigate={items.length > 1 ? navigateItem : undefined}
          onClose={() => setItemDetailOpen(false)}
        />
      )}
    </div>
  );
}
