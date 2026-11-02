import FooterActions from './FooterActions';
import { Button } from '@ui5/webcomponents-react';
import type { AppliedCondition, ConditionTypeDef } from '@sap-sim/shared';
import SapChrome from './SapChrome';
import DocumentTabStrip from './DocumentTabStrip';
import PricingElementsTable from './PricingElementsTable';

// Tab names from Kent's 2026-11-02 screenshots of the real "Create Quotation: Header Data" screen;
// only Conditions does anything, the rest are clutter like the Overview's tab strip.
const HEADER_TABS = [
  'Sales',
  'Shipping',
  'Billing Document',
  'Accounting',
  'Conditions',
  'Account Assignment',
  'Partner',
  'Texts',
  'Order Data',
  'Status',
];

/**
 * "Create X: Header Data" — a full screen navigation like Item Data, reached through
 * Menu ▸ Goto ▸ Header ▸ Conditions. Shows the whole order's pricing, including the item-level
 * discounts already entered, and takes the header-level RA00 percentage, which does nothing until
 * the student presses Activate.
 */
export default function HeaderDataPanel({
  title,
  code,
  docLabel = 'Quotation',
  custReference,
  customerId,
  customerLine,
  grossValue,
  itemDiscount,
  conditionDef,
  appliedCondition,
  onCommitCondition,
  onActivate,
  onBack,
}: {
  title: string;
  code?: string;
  /** Label for the document-number field; the document is not numbered yet while being created. */
  docLabel?: string;
  custReference: string;
  customerId: string;
  customerLine: string;
  /** Sum of the items' list prices x quantities, before any discount. */
  grossValue: number;
  /** Sum of the item-level discounts so far, zero or negative. */
  itemDiscount: number;
  conditionDef: ConditionTypeDef;
  appliedCondition: AppliedCondition | null;
  /** Omit both to show the conditions read-only, as on an order whose pricing was copied. */
  onCommitCondition?: (amount: number) => void;
  onActivate?: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <SapChrome title={`${title}: Header Data`} code={code} toolbarIcons={['header']} onBack={onBack} />
      <div className="sap-screen-body">
        <div className="field-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div className="field-row-inline">
            <label>{docLabel}:</label>
            <span className="sap-display-value" style={{ minWidth: 120 }}>
              &nbsp;
            </span>
          </div>
          <div className="field-row-inline">
            <label>Customer Reference:</label>
            <span className="sap-display-value" style={{ minWidth: 160 }}>
              {custReference || ' '}
            </span>
          </div>
        </div>
        <div className="field-row field-row-inline">
          <label>Sold-to Party:</label>
          <span className="sap-display-value" style={{ minWidth: 100 }}>
            {customerId}
          </span>
          <span>{customerLine}</span>
        </div>
      </div>

      <DocumentTabStrip tabs={HEADER_TABS} active="Conditions" />
      <div className="sap-screen-body">
        <PricingElementsTable
          level="header"
          basePrice={grossValue}
          itemDiscount={itemDiscount}
          conditionDef={conditionDef}
          appliedCondition={appliedCondition}
          onCommitCondition={onCommitCondition}
          onActivate={onActivate}
        />
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
