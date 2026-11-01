import { Button } from '@ui5/webcomponents-react';
import { getMaterial } from '@sap-sim/engine';

export interface GridItem {
  lineNumber: number;
  materialId: string;
  quantity: number;
}

/**
 * The dense "All Items" grid real SAP shows on the Overview screen — see
 * "The Sales Process in SAP.pdf" pages 3/8/9. Line numbers increment by 10, matching the
 * original screenshots, not 1/2/3.
 */
export default function ItemsGrid({
  items,
  selectedLines,
  onToggleSelect,
  onQuantityChange,
  onAddRow,
  onRemoveSelected,
  readOnly,
}: {
  items: GridItem[];
  selectedLines: number[];
  onToggleSelect: (lineNumber: number) => void;
  onQuantityChange?: (lineNumber: number, qty: number) => void;
  onAddRow?: () => void;
  onRemoveSelected?: () => void;
  readOnly?: boolean;
}) {
  return (
    <div>
      {!readOnly && (onAddRow || onRemoveSelected) && (
        <div className="layout-toggle">
          {onAddRow && (
            <Button icon="add" design="Transparent" onClick={onAddRow}>
              Add material
            </Button>
          )}
          {onRemoveSelected && (
            <Button icon="less" design="Transparent" disabled={selectedLines.length === 0} onClick={onRemoveSelected}>
              Remove selected
            </Button>
          )}
        </div>
      )}
      <table className="sap-items-grid">
        <thead>
          <tr>
            <th></th>
            <th>Item</th>
            <th>Material</th>
            <th>Req. Segment</th>
            <th>Order Quantity</th>
            <th>SU</th>
            <th>Item Description</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.lineNumber} className={selectedLines.includes(item.lineNumber) ? 'selected' : ''}>
              <td>
                <input type="checkbox" checked={selectedLines.includes(item.lineNumber)} onChange={() => onToggleSelect(item.lineNumber)} />
              </td>
              <td>{item.lineNumber}</td>
              <td>{item.materialId}</td>
              <td></td>
              <td>
                {onQuantityChange ? (
                  <input
                    type="number"
                    min={1}
                    value={item.quantity || ''}
                    onChange={(e) => onQuantityChange(item.lineNumber, Number(e.target.value))}
                    style={{ width: 60 }}
                  />
                ) : (
                  item.quantity
                )}
              </td>
              <td>EA</td>
              <td>{getMaterial(item.materialId).description}</td>
            </tr>
          ))}
          {/* An empty trailing row, same as the real grid always showing a few blank rows below data */}
          <tr>
            <td colSpan={7}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
