import { useState } from 'react';
import { Button, Dialog, Icon, MessageStrip } from '@ui5/webcomponents-react';
import type { SalesDocument } from '@sap-sim/shared';
import SearchDialog, { type SearchItem } from './SearchDialog';

const TABS = ['Inquiry', 'Quotation', 'Order', 'Contract', 'SchedAgree', 'BillDoc'] as const;

const VALUE_HELP_FIELDS = [
  'Customer Reference',
  'Sales Organization',
  'Sold-to Party',
  'Distribution Channel',
  'Division',
  'Sales Office',
  'Sales Group',
  'Created By',
  'Sales Document Type',
  'Customer Ref. Date',
  'Transaction Group',
  'SD Document',
  'Item (SD)',
];

// Column order from Kent's 2026-11-02 screenshot of the real "Sales Document (1)" results grid.
const VALUE_HELP_COLUMNS = [
  'Customer Reference',
  'Sales Org.',
  'Sold-to',
  'Dist. Channel',
  'Division',
  'Sales Office',
  'Sales Group',
  'Created By',
  'Doc. Type',
  'Cust. Ref. Date',
  'Trans. Group',
  'SD Document',
  'Item (SD)',
];

// SAP's transaction group: 1 = inquiry, 2 = quotation. The value help also opens with Sales
// Organization UE00 and the matching group already filled in (Kent's 2026-11-02 screenshot).
const TRANSACTION_GROUP = { Inquiry: '1', Quotation: '2' } as const;

function usDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${m}/${d}/${y}` : iso;
}

/**
 * The real "Create with Reference" popup opened from the initial screen (Kent's 2026-11-02
 * screenshots of VA21/VA01): a tab per predecessor type, one document-number field, and Copy. The
 * Customer PO Number search is behind the document field's search icon — the "Sales Document (1)"
 * value help — not the Search Criteria block below, which (with Item Selection) is decorative.
 */
export default function CreateWithReferenceDialog({
  open,
  activeTab,
  docLabel,
  documents,
  onCopy,
  onClose,
}: {
  open: boolean;
  /** Which predecessor tab is live — Inquiry for a quotation, Quotation for an order. */
  activeTab: 'Inquiry' | 'Quotation';
  /** Label for the document-number field, e.g. "Inquiry" or "Quot.". */
  docLabel: string;
  /** The student's own saved predecessor documents. */
  documents: SalesDocument[];
  onCopy: (doc: SalesDocument) => void;
  onClose: () => void;
}) {
  const [docNumber, setDocNumber] = useState('');
  const [focused, setFocused] = useState(false);
  const [valueHelpOpen, setValueHelpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items: SearchItem[] = documents.map((d) => ({
    id: d.id,
    label: d.custReference,
    columns: [
      d.custReference,
      'UE00',
      d.customerId,
      'WH',
      'BI',
      '',
      '',
      'TEACH-001',
      activeTab === 'Inquiry' ? 'IN' : 'QT',
      usDate(d.custReferenceDate),
      TRANSACTION_GROUP[activeTab],
      d.id,
      '000010',
    ],
  }));

  function handleClose() {
    setDocNumber('');
    setError(null);
    onClose();
  }

  function handleCopy() {
    setError(null);
    const typed = docNumber.trim().toUpperCase();
    if (!typed) {
      setError(`Enter an ${docLabel.replace('.', '').toLowerCase()} number, or use the search icon to find it by Customer Reference.`);
      return;
    }
    const doc = documents.find((d) => d.id.toUpperCase() === typed);
    if (!doc) {
      setError(`${activeTab} ${docNumber.trim()} does not exist.`);
      return;
    }
    setDocNumber('');
    onCopy(doc);
  }

  return (
    <>
      <Dialog
        open={open}
        headerText="Create with Reference"
        onAfterClose={handleClose}
        footer={
          <div className="cwr-footer">
            <span className="cwr-action" onClick={handleCopy}>
              <Icon name="accept" className="cwr-accept" /> Copy
            </span>
            <span className="cwr-action">Item Selection</span>
            <span className="cwr-action" title="Close" onClick={handleClose}>
              <Icon name="decline" className="cwr-decline" />
            </span>
          </div>
        }
      >
        <div className="cwr-body">
          <div className="sap-tab-strip">
            {TABS.map((t) => (
              <div key={t} className={`sap-tab${t === activeTab ? ' active' : ''}`}>
                {t}
              </div>
            ))}
          </div>
          {error && (
            <MessageStrip design="Negative" style={{ margin: '8px 0' }} onClose={() => setError(null)}>
              {error}
            </MessageStrip>
          )}
          <div className="cwr-form">
            <div className="initial-field-row">
              <label>{docLabel}:</label>
              <span className="sap-input-with-icon" style={{ flex: 1 }}>
                <input
                  autoFocus
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCopy()}
                  style={{ width: '100%' }}
                />
                {focused && (
                  <span
                    className="sap-chrome-icon-btn"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setValueHelpOpen(true)}
                  >
                    <Icon name="duplicate" />
                  </span>
                )}
              </span>
            </div>
            <div className="initial-field-row">
              <label>Requested Deliv.Date:</label>
              <input disabled style={{ width: 24 }} />
              <input disabled style={{ width: 110 }} />
            </div>
            <div className="cwr-section">Search Criteria</div>
            <div className="initial-field-row">
              <label>Cust. Reference:</label>
              <input disabled style={{ width: 360 }} />
            </div>
            <div className="initial-field-row">
              <label>Sold-to Party:</label>
              <input disabled style={{ width: 110 }} />
            </div>
            <div className="initial-field-row">
              <label>WBS Element:</label>
              <input disabled style={{ width: 250 }} />
            </div>
            <div className="cwr-search">
              <Button icon="search" design="Default" style={{ width: 210 }}>
                Search
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
      <SearchDialog
        open={valueHelpOpen}
        title="Sales Document (1)"
        entityLabel="A: Sales document according to customer PO number"
        fields={VALUE_HELP_FIELDS}
        fieldColumns={4}
        wide
        activeField="Customer Reference"
        prefilled={{ 'Sales Organization': 'UE00', 'Transaction Group': TRANSACTION_GROUP[activeTab] }}
        placeholder="e.g. PO-1*"
        resultColumns={VALUE_HELP_COLUMNS}
        items={items}
        onSelect={(item) => {
          setDocNumber(item.id);
          setValueHelpOpen(false);
        }}
        onClose={() => setValueHelpOpen(false)}
      />
    </>
  );
}
