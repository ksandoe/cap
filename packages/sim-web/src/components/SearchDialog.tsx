import { useState } from 'react';
import { Dialog, Bar, Button, Icon } from '@ui5/webcomponents-react';

export interface SearchItem {
  id: string;
  label: string;
  sublabel?: string;
  /** Cell values for the results grid, in the same order as the dialog's `resultColumns` — real SAP
   * shows a dense multi-column data grid, not a label+sublabel list (Kent, 2026-11-02). */
  columns: string[];
}

interface Props {
  open: boolean;
  /** The value-help's entity line, e.g. "A: Customers (General)" or "M: Material by description". */
  entityLabel: string;
  /** Every filter field, in on-screen order, laid out as a 3-column grid — see Kent's 2026-11-02
   * screenshot of the real "Restrict Value Range" popup for Sold-to Party. Most are inert clutter;
   * only `activeField` actually filters. */
  fields: string[];
  activeField: string;
  /** Results grid column headers, matching each item's `columns` order. */
  resultColumns: string[];
  items: SearchItem[];
  onSelect: (item: SearchItem) => void;
  onClose: () => void;
}

/**
 * Real SAP name search: an exact match, or a prefix followed by "*" (e.g. "bos*") — not a plain
 * substring filter. Typing "boston" with no wildcard deliberately returns nothing, the same way
 * real SAP does; students have to learn the "*" convention, per Kent's 2026-11-01 walkthrough.
 */
function matchesQuery(value: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (q.endsWith('*')) {
    return value.toLowerCase().startsWith(q.slice(0, -1).toLowerCase());
  }
  return value.toLowerCase() === q.toLowerCase();
}

/**
 * The real "Restrict Value Range" value-help popup: a filter form behind a Go button, then a
 * checkbox-selectable results list behind OK — not an instant-filter dropdown. Matches Kent's
 * screenshots of the Sold-to Party and Material searches, 2026-11-01.
 *
 * Deliberately NOT replicated: the real training system returns 500 near-duplicate records for a
 * common search term (same name/description, different customer or material numbers) — exactly
 * the ID-collision mess docs/architecture-proposal.md already decided to drop by replacing the
 * 3-digit-ID mechanic with a small curated pool. We keep that curated pool; only the interaction
 * pattern (filter → Go → select → OK) is reproduced.
 */
export default function SearchDialog({ open, entityLabel, fields, activeField, resultColumns, items, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const results = searched ? items.filter((i) => matchesQuery(i.label, query)) : [];

  function reset() {
    setQuery('');
    setSearched(false);
    setSelectedId(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleGo() {
    setSearched(true);
    setSelectedId(null);
  }

  function confirm(item: SearchItem) {
    onSelect(item);
    reset();
  }

  return (
    <Dialog
      open={open}
      headerText="Restrict Value Range (1)"
      onAfterClose={handleClose}
      footer={
        <Bar
          endContent={
            <>
              {searched && (
                <Button
                  design="Emphasized"
                  disabled={!selectedId}
                  onClick={() => {
                    const item = results.find((i) => i.id === selectedId);
                    if (item) confirm(item);
                  }}
                >
                  OK
                </Button>
              )}
              <Button design="Transparent" onClick={handleClose}>
                Cancel
              </Button>
            </>
          }
        />
      }
    >
      <div className="value-range" style={{ minWidth: 540, maxWidth: 720 }}>
        <div className="value-range-tabs">
          <span className="value-range-tab active">Search and Select</span>
        </div>
        <div className="value-range-header">
          <span className="value-range-entity">{entityLabel} ⌄</span>
          <Button design="Emphasized" disabled={!query.trim()} onClick={handleGo}>
            Go
          </Button>
          <span className="value-range-hide-filters">Hide Filters</span>
          <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
            <Icon name="action-settings" />
          </span>
        </div>
        <div className="value-range-fields">
          {fields.map((f) =>
            f === activeField ? (
              <div className="value-range-field" key={f}>
                <label>{f}:</label>
                <span className="sap-input-with-icon" style={{ width: '100%' }}>
                  <input
                    autoFocus
                    value={query}
                    placeholder="full name, or e.g. bos*"
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setSearched(false);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleGo()}
                  />
                  <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
                    <Icon name="value-help" />
                  </span>
                </span>
              </div>
            ) : (
              <div className="value-range-field" key={f}>
                <label>{f}:</label>
                <span className="sap-input-with-icon" style={{ width: '100%' }}>
                  <input disabled style={{ width: '100%' }} />
                  <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
                    <Icon name="value-help" />
                  </span>
                </span>
              </div>
            ),
          )}
        </div>
        {searched && (
          <>
            <div className="value-range-find-bar">
              <span className="sap-input-with-icon" style={{ flex: 1 }}>
                <input placeholder="Find expression" disabled style={{ width: '100%' }} />
                <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
                  <Icon name="search" />
                </span>
              </span>
              <span className="value-range-find-link">Find</span>
              <span className="value-range-find-link">Find next</span>
              <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
                <Icon name="favorite" />
              </span>
              <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
                <Icon name="print" />
              </span>
              <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
                <Icon name="action-settings" />
              </span>
            </div>
            <div className="value-range-count">Items ({results.length})</div>
            {results.length === 0 ? (
              <div className="value-range-empty">No matches.</div>
            ) : (
              <div className="value-range-results">
                <table className="value-range-grid">
                  <thead>
                    <tr>
                      <th></th>
                      {resultColumns.map((c) => (
                        <th key={c}>
                          {c} <span className="value-range-sort">⇅</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((item) => (
                      <tr
                        key={item.id}
                        className={selectedId === item.id ? 'selected' : ''}
                        onClick={() => setSelectedId(item.id)}
                        onDoubleClick={() => confirm(item)}
                      >
                        <td>
                          <input type="checkbox" checked={selectedId === item.id} onChange={() => setSelectedId(item.id)} />
                        </td>
                        {item.columns.map((cell, i) => (
                          <td key={i}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
