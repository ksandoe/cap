import { useState } from 'react';
import { Button, Icon } from '@ui5/webcomponents-react';
import { getMaterial } from '@sap-sim/engine';

export interface GridItem {
  lineNumber: number;
  materialId: string;
  quantity: number;
}

// Decorative icons flanking the real add/remove controls — see Kent's 2026-11-02 screenshot of the
// real "All Items" toolbar (15 icons total). Confirmed names so far: detail-view, sys-add, sys-minus,
// it-instance, currency (11th — opens Item Data on the Conditions tab for the selected row); the
// rest are still being identified against the icon explorer, so the placeholders below just pad the
// count out to 15 until Kent supplies the real names. "+"/"−"/currency are the only ones that do
// anything; the rest (and the trailing "Group" button / gear) are clutter, same reasoning as
// SapChrome's decorative icons.
const LEADING_DECORATIVE_ICONS = ['detail-view'];
const TRAILING_BEFORE_CONDITIONS = ['it-instance', 'sort-ascending', 'copy', 'paste', 'cancel', 'duplicate', 'collapse-group'];
const TRAILING_AFTER_CONDITIONS = ['measuring-point', 'trend-up'];
// The sales order's grid toolbar is a different set again (Kent's 2026-11-02 VA01 screenshot): 13
// icons, the faded one being Item Conditions (disabled until a row is selected), then Group and a
// wrench. Names are best guesses.
const ORDER_BEFORE_CONDITIONS = ['it-instance', 'grid', 'table-view', 'compare', 'tree', 'vertical-bar-chart'];
const ORDER_AFTER_CONDITIONS = ['screen-split-one', 'area-chart', 'action-settings'];
const MIN_BLANK_ROWS = 16;

/**
 * The dense "All Items" grid real SAP shows on the Overview screen — see
 * "The Sales Process in SAP.pdf" pages 3/8/9. Line numbers increment by 10, matching the
 * original screenshots, not 1/2/3. Padded with blank rows so it reads as the same tall, mostly
 * empty grid real SAP shows, not a table sized exactly to the data.
 */
export default function ItemsGrid({
  items,
  selectedLines,
  onToggleSelect,
  onQuantityChange,
  onAddRow,
  onRemoveSelected,
  onRowOpen,
  onOpenConditions,
  readOnly,
  variant = 'quotation',
}: {
  items: GridItem[];
  selectedLines: number[];
  onToggleSelect: (lineNumber: number) => void;
  onQuantityChange?: (lineNumber: number, qty: number) => void;
  onAddRow?: () => void;
  onRemoveSelected?: () => void;
  /** Double-click a row to drill into its item detail (Sales A / Order Probability). */
  onRowOpen?: (lineNumber: number) => void;
  /** The toolbar's currency icon (11th) — jumps straight to the Conditions tab for the one
   * selected row, same "Item Data" screen as onRowOpen (Kent, 2026-11-02). */
  onOpenConditions?: (lineNumber: number) => void;
  readOnly?: boolean;
  /** 'order' swaps in the sales order's columns (S, ItCa) and toolbar, and an inert entry row. */
  variant?: 'quotation' | 'order';
}) {
  const isOrder = variant === 'order';
  const beforeConditions = isOrder ? ORDER_BEFORE_CONDITIONS : TRAILING_BEFORE_CONDITIONS;
  const afterConditions = isOrder ? ORDER_AFTER_CONDITIONS : TRAILING_AFTER_CONDITIONS;
  const columnCount = isOrder ? 10 : 9;
  const blankRows = Math.max(1, MIN_BLANK_ROWS - items.length);
  // Real SAP lets you add an item by clicking straight into the blank row below the data — the
  // Material cell becomes a text box with a matchcode icon next to it (Kent, 2026-11-02), same
  // trigger as the toolbar's "+", not a separate add flow.
  const [newRowFocused, setNewRowFocused] = useState(false);
  const canAddInline = isOrder || (!readOnly && Boolean(onAddRow));

  return (
    <div>
      <div className="sap-grid-toolbar">
        <div className="sap-grid-toolbar-icons">
          {LEADING_DECORATIVE_ICONS.map((icon) => (
            <span key={icon} className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
              <Icon name={icon} />
            </span>
          ))}
          {!readOnly && onAddRow ? (
            <span className="sap-chrome-icon-btn" title="Add row" onClick={onAddRow}>
              <Icon name="sys-add" />
            </span>
          ) : (
            <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
              <Icon name="sys-add" />
            </span>
          )}
          {!readOnly && onRemoveSelected ? (
            <span
              className={`sap-chrome-icon-btn${selectedLines.length === 0 ? ' sap-chrome-icon-btn--disabled' : ''}`}
              title="Remove selected"
              onClick={selectedLines.length === 0 ? undefined : onRemoveSelected}
            >
              <Icon name="sys-minus" />
            </span>
          ) : (
            <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
              <Icon name="sys-minus" />
            </span>
          )}
          {beforeConditions.map((icon) => (
            <span key={icon} className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
              <Icon name={icon} />
            </span>
          ))}
          <span
            className={`sap-chrome-icon-btn${onOpenConditions && selectedLines.length === 1 ? '' : ' sap-chrome-icon-btn--disabled'}`}
            title="Item Conditions"
            onClick={onOpenConditions && selectedLines.length === 1 ? () => onOpenConditions(selectedLines[0]) : undefined}
          >
            <Icon name="currency" />
          </span>
          {afterConditions.map((icon) => (
            <span key={icon} className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
              <Icon name={icon} />
            </span>
          ))}
        </div>
        <Button design="Transparent" icon="expand-group">
          Group
        </Button>
        <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
          <Icon name={isOrder ? 'wrench' : 'settings'} />
        </span>
      </div>

      <div className="sap-grid-header-row">
        <span className="sap-grid-title">All Items</span>
        <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
          <Icon name="action-settings" />
        </span>
      </div>

      <table className="sap-items-grid">
        <thead>
          <tr>
            <th></th>
            <th>Item</th>
            <th>Material</th>
            <th>Req. Segment</th>
            <th>Order Quantity</th>
            <th>{isOrder ? 'Un' : 'SU'}</th>
            <th>{isOrder ? 'S' : 'AltItm'}</th>
            <th>Item Description</th>
            <th>{isOrder ? 'Customer Material Number' : 'Customer Material'}</th>
            {isOrder && <th>ItCa</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.lineNumber}
              className={selectedLines.includes(item.lineNumber) ? 'selected' : ''}
              onDoubleClick={onRowOpen ? () => onRowOpen(item.lineNumber) : undefined}
            >
              <td>
                <input type="checkbox" checked={selectedLines.includes(item.lineNumber)} onChange={() => onToggleSelect(item.lineNumber)} />
              </td>
              <td className={isOrder ? 'sap-grid-display-cell' : undefined}>
                {isOrder ? <span className="sap-display-value">{item.lineNumber}</span> : item.lineNumber}
              </td>
              <td className={isOrder ? 'sap-grid-display-cell' : undefined}>{item.materialId}</td>
              <td></td>
              <td style={{ textAlign: 'right' }}>
                {onQuantityChange ? (
                  <input
                    type="number"
                    min={1}
                    value={item.quantity || ''}
                    onChange={(e) => onQuantityChange(item.lineNumber, Number(e.target.value))}
                    style={{ width: 60, textAlign: 'right' }}
                  />
                ) : (
                  item.quantity
                )}
              </td>
              <td>EA</td>
              <td style={isOrder ? undefined : { textAlign: 'right' }}>
                {isOrder ? <input type="checkbox" checked disabled readOnly /> : 0}
              </td>
              <td>{getMaterial(item.materialId).description}</td>
              <td></td>
              {isOrder && <td>TAN</td>}
            </tr>
          ))}
          {/* Blank rows, same as the real grid showing many empty rows below the data. The first one
              doubles as the add-item row when onAddRow is available. */}
          {Array.from({ length: blankRows }).map((_, i) =>
            i === 0 && canAddInline ? (
              <tr key={`blank-${i}`}>
                <td></td>
                <td></td>
                <td colSpan={2}>
                  <span className="sap-input-with-icon" style={{ width: '100%' }}>
                    <input
                      value=""
                      readOnly
                      style={{ width: '100%' }}
                      onFocus={() => setNewRowFocused(true)}
                      onBlur={() => setNewRowFocused(false)}
                      onClick={onAddRow}
                    />
                    {newRowFocused && (
                      <span className="sap-chrome-icon-btn" onMouseDown={(e) => e.preventDefault()} onClick={onAddRow}>
                        <Icon name="duplicate" />
                      </span>
                    )}
                  </span>
                </td>
                <td colSpan={isOrder ? 6 : 5}></td>
              </tr>
            ) : (
              <tr key={`blank-${i}`}>
                <td colSpan={columnCount}></td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
