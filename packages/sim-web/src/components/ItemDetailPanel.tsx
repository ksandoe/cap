import { useState } from 'react';
import { Dialog, Bar, Button } from '@ui5/webcomponents-react';
import type { AppliedCondition, ConditionTypeDef } from '@sap-sim/shared';
import { getMaterial } from '@sap-sim/engine';
import PricingElementsTable from './PricingElementsTable';

const TABS = ['Sales A', 'Sales B', 'Shipping', 'Billing Document', 'Conditions', 'Account Assignment', 'Schedule lines', 'Partner'] as const;

/**
 * "Create X: Item Data" — opened by selecting a row in the ItemsGrid and clicking the item-detail
 * toolbar icon. Real screens bury the one field that matters (Order Probability, or the Conditions
 * tab) among a dozen others — see "The Sales Process in SAP.pdf" pages 9/10/18. Most tabs here are
 * decorative on purpose, for the same reason.
 */
export default function ItemDetailPanel({
  open,
  materialId,
  lineNumber,
  quantity,
  orderProbability,
  onProbabilityChange,
  conditionDef,
  appliedCondition,
  onCommitCondition,
  onActivate,
  initialTab = 'Sales A',
  onClose,
  onNavigate,
}: {
  open: boolean;
  materialId: string;
  lineNumber: number;
  quantity: number;
  orderProbability?: number | null;
  onProbabilityChange?: (value: number) => void;
  conditionDef?: ConditionTypeDef;
  appliedCondition?: AppliedCondition | null;
  onCommitCondition?: (amount: number) => void;
  onActivate?: () => void;
  initialTab?: (typeof TABS)[number];
  onClose: () => void;
  /** Original exercise quirk: "advance to the next item" without leaving the item-detail screen. */
  onNavigate?: (direction: 'prev' | 'next') => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>(initialTab);
  const material = getMaterial(materialId);

  return (
    <Dialog
      open={open}
      headerText="Item Data"
      onAfterClose={onClose}
      footer={
        <Bar
          endContent={
            <Button design="Transparent" onClick={onClose}>
              Back
            </Button>
          }
        />
      }
    >
      <div style={{ minWidth: 480, maxWidth: 560 }}>
        {onNavigate && (
          <div className="layout-toggle">
            <Button icon="slim-arrow-left" design="Transparent" onClick={() => onNavigate('prev')} />
            <Button icon="slim-arrow-right" design="Transparent" onClick={() => onNavigate('next')} />
          </div>
        )}
        <div className="field-row" style={{ display: 'flex', gap: 24 }}>
          <div>
            <label>Sales Document Item</label>
            <div>{lineNumber}</div>
          </div>
          <div>
            <label>Material</label>
            <div>
              {materialId} — {material.description}
            </div>
          </div>
        </div>

        <div className="sap-tab-strip">
          {TABS.map((t) => (
            <div key={t} className={`sap-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t}
            </div>
          ))}
        </div>

        {tab === 'Sales A' && (
          <div>
            <h4 style={{ marginTop: 0 }}>Order Quantity and Delivery Date</h4>
            <div className="field-row">
              <label>Order Quantity</label>
              <input value={quantity} disabled style={{ width: 80 }} /> EA
            </div>
            <h4>General Sales Data</h4>
            <div className="field-row">
              <label>Net Value</label>
              <input value={`$${(material.basePrice * quantity).toFixed(2)}`} disabled />
            </div>
            <div className="field-row">
              <label>EAN/UPC</label>
              <input disabled placeholder="" />
            </div>
            <div className="field-row">
              <label>Engineering Change</label>
              <input disabled placeholder="" />
            </div>
            {onProbabilityChange ? (
              <div className="field-row">
                <label className="required">Order Probability</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={orderProbability ?? ''}
                  onChange={(e) => onProbabilityChange(Number(e.target.value))}
                  style={{ width: 80 }}
                />
                %
              </div>
            ) : (
              <div className="field-row">
                <label>Order Probability</label>
                <input disabled value="100" style={{ width: 80 }} />%
              </div>
            )}
          </div>
        )}

        {tab === 'Conditions' &&
          (conditionDef ? (
            <PricingElementsTable
              level="item"
              basePrice={material.basePrice}
              quantity={quantity}
              conditionDef={conditionDef}
              appliedCondition={appliedCondition ?? null}
              onCommitCondition={onCommitCondition ?? (() => {})}
              onActivate={onActivate ?? (() => {})}
            />
          ) : (
            <p style={{ color: '#888' }}>Not used in this exercise.</p>
          ))}

        {tab !== 'Sales A' && tab !== 'Conditions' && <p style={{ color: '#888' }}>Not used in this exercise.</p>}
      </div>
    </Dialog>
  );
}
