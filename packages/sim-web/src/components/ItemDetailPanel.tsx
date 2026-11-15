import FooterActions from './FooterActions';
import { useState } from 'react';
import { Button } from '@ui5/webcomponents-react';
import type { AppliedCondition, ConditionTypeDef } from '@sap-sim/shared';
import { getMaterial } from '@sap-sim/engine';
import SapChrome from './SapChrome';
import PricingElementsTable from './PricingElementsTable';
import { todayIso } from '../dateUtils';
import { formatCurrency } from '../formatUtils';

const TABS = ['Sales A', 'Sales B', 'Shipping', 'Billing Document', 'Conditions', 'Account Assignment', 'Schedule lines', 'Partner'] as const;

// Decorative — real SAP's Item Data toolbar; none of these are wired to anything (Kent, 2026-11-02).
const ITEM_DATA_TOOLBAR_ICONS = ['delete', 'bookmark', 'documents', 'pie-chart'];

/**
 * "Create X: Item Data" — a full screen navigation (not a popup), reached by selecting a row in the
 * ItemsGrid and clicking either the item-detail toolbar icon (Conditions) or double-clicking the row
 * (Sales A). Real screens bury the one field that matters among a dozen others — see "The Sales
 * Process in SAP.pdf" pages 9/10/18 — so most tabs here are decorative on purpose.
 */
export default function ItemDetailPanel({
  title,
  code,
  materialId,
  lineNumber,
  quantity,
  onQuantityChange,
  itemCategory,
  orderProbability,
  onProbabilityChange,
  conditionDef,
  appliedCondition,
  onCommitCondition,
  onActivate,
  initialTab = 'Sales A',
  onBack,
  onNavigate,
}: {
  /** e.g. "Create Inquiry" — combined with ": Item Data" for the chrome title. */
  title: string;
  code?: string;
  materialId: string;
  lineNumber: number;
  quantity: number;
  onQuantityChange?: (value: number) => void;
  /** e.g. {code: 'AFN', label: 'Inquiry Item'} for VA11, {code: 'AGN', label: 'Standard Item'} for VA21/VA01. */
  itemCategory?: { code: string; label: string };
  orderProbability?: number | null;
  onProbabilityChange?: (value: number) => void;
  conditionDef?: ConditionTypeDef;
  appliedCondition?: AppliedCondition | null;
  onCommitCondition?: (amount: number) => void;
  onActivate?: () => void;
  initialTab?: (typeof TABS)[number];
  onBack: () => void;
  /** Original exercise quirk: "advance to the next item" without leaving the item-detail screen. */
  onNavigate?: (direction: 'first' | 'prev' | 'next' | 'last') => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>(initialTab);
  const material = getMaterial(materialId);

  return (
    <div>
      <SapChrome title={`${title}: Item Data`} code={code} toolbarIcons={ITEM_DATA_TOOLBAR_ICONS} onBack={onBack} />
      <div className="sap-screen-body">
        {onNavigate && (
          <div className="layout-toggle">
            <Button icon="close-command-field" design="Default" onClick={() => onNavigate('first')} />
            <Button icon="slim-arrow-left" design="Default" onClick={() => onNavigate('prev')} />
            <Button icon="slim-arrow-right" design="Default" onClick={() => onNavigate('next')} />
            <Button icon="open-command-field" design="Default" onClick={() => onNavigate('last')} />
          </div>
        )}
        <div className="field-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div className="field-row-inline">
            <label>Sales Document Item:</label>
            <span className="sap-display-value">{lineNumber}</span>
          </div>
          {itemCategory && (
            <div className="field-row-inline">
              <label>Item Category:</label>
              <span className="sap-display-value">{itemCategory.code}</span>
              <span>{itemCategory.label}</span>
            </div>
          )}
        </div>
        <div className="field-row field-row-inline">
          <label>Material:</label>
          <span className="sap-display-value">{materialId}</span>
          <span>— {material.description}</span>
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
            <div className="field-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div className="field-row-inline">
                <label>Order Quantity:</label>
                {onQuantityChange ? (
                  <input
                    type="number"
                    min={1}
                    value={quantity || ''}
                    onChange={(e) => onQuantityChange(Number(e.target.value))}
                    style={{ width: 80 }}
                  />
                ) : (
                  <span className="sap-display-value">{quantity}</span>
                )}
                <span>EA</span>
              </div>
              {/* Decorative sales-unit/base-unit conversion, always 1:1 — not part of pricing.ts. */}
              <div className="field-row-inline">
                <span className="sap-display-value">1</span>
                <span>EA</span>
                <span>&lt;-&gt;</span>
                <span className="sap-display-value">1</span>
                <span>EA</span>
              </div>
            </div>
            <div className="field-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div className="field-row-inline">
                <label>First Delivery Date:</label>
                <input value="D" disabled style={{ width: 28, textAlign: 'center' }} />
                <span className="sap-display-value">{todayIso()}</span>
              </div>
              <div className="field-row-inline">
                <label>Requirement Segment:</label>
                <span className="sap-display-value" style={{ minWidth: 120 }}>
                  &nbsp;
                </span>
              </div>
            </div>

            <h4>General Sales Data</h4>
            <div className="field-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div className="field-row-inline">
                <label>Net Value:</label>
                <span className="sap-display-value">{formatCurrency(material.basePrice * quantity)}</span>
              </div>
              <div className="field-row-inline">
                <label>Exch. Rate:</label>
                <span className="sap-display-value">1.00000</span>
              </div>
            </div>
            <div className="field-row field-row-inline">
              <label>Pricing Date:</label>
              <span className="sap-display-value">{todayIso()}</span>
            </div>
            <div className="field-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div className="field-row-inline">
                <label>Material Entered:</label>
                <span className="sap-display-value">{materialId}</span>
              </div>
              <div className="field-row-inline">
                <label>Preference:</label>
                <input type="checkbox" disabled />
              </div>
            </div>
            <div className="field-row field-row-inline">
              <label>EAN/UPC:</label>
              <input disabled style={{ width: 220 }} />
            </div>
            <div className="field-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div className="field-row-inline">
                <label>Engineering Change:</label>
                <input disabled style={{ width: 160 }} />
              </div>
              <div className="field-row-inline">
                <label>BOM explosion number:</label>
                <input disabled style={{ width: 100 }} />
              </div>
            </div>
            <div className="field-row field-row-inline">
              <label>Usage:</label>
              <select disabled style={{ width: 200 }}></select>
            </div>
            <div className="field-row field-row-inline">
              <label>Reason for Rejection:</label>
              <select disabled style={{ width: 300 }}></select>
            </div>
            <div className="field-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div className="field-row-inline">
                <label className={onProbabilityChange ? 'required' : undefined}>Order Probability:</label>
                {onProbabilityChange ? (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={orderProbability ?? ''}
                    onChange={(e) => onProbabilityChange(Number(e.target.value))}
                    style={{ width: 80 }}
                  />
                ) : (
                  <span className="sap-display-value">{orderProbability ?? 100}</span>
                )}
                <span>%</span>
              </div>
              <div className="field-row-inline">
                <label>Alternative to Item:</label>
                <span className="sap-display-value">0</span>
              </div>
            </div>
          </div>
        )}

        {tab === 'Conditions' && (
          <PricingElementsTable
            level="item"
            basePrice={material.basePrice}
            quantity={quantity}
            conditionDef={conditionDef}
            appliedCondition={appliedCondition ?? null}
            onCommitCondition={onCommitCondition}
            onActivate={onActivate}
          />
        )}

        {tab !== 'Sales A' && tab !== 'Conditions' && <p style={{ color: '#888' }}>Not used in this exercise.</p>}

        <FooterActions>
          <Button design="Emphasized" onClick={onBack}>
            Save
          </Button>
          <Button design="Transparent" onClick={onBack}>
            Cancel
          </Button>
        </FooterActions>
      </div>
    </div>
  );
}
