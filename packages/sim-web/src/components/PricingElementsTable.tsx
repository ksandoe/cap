import { useState } from 'react';
import { Button, Icon, MessageStrip } from '@ui5/webcomponents-react';
import type { AppliedCondition, ConditionTypeDef } from '@sap-sim/shared';

// SAP prints numbers with the minus sign after them ("160.00-"), grouped with commas.
function num(n: number, decimals = 2): string {
  const body = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return n < 0 ? `${body}-` : body;
}

const BLANK_ROWS = 12;

/**
 * The "Conditions" tab's Pricing Elements table — the real interaction behind both the item-level
 * K004 discount and the header-level RA00 discount, replicated from Kent's 2026-11-02 screenshots of
 * the real Item Data screen. System rows (PR00 Price, the subtotals, SKTO, VPRS, tax) are grey
 * display fields; the student types a condition type and an amount into the blank row at the bottom
 * and presses Enter, there is no button.
 *
 * Per docs/decisions/001: a wrong condition type code is rejected (structural — real SAP would
 * reject an unrecognized code too), but a wrong *amount*, or applying the condition to the wrong
 * item/level entirely, is accepted and simply produces a wrong net value downstream.
 *
 * `conditionDef` is omitted on the Inquiry's Conditions tab — real SAP still shows the full pricing
 * procedure there, but K004/RA00 aren't enterable until Quotation, so there's no discount row or
 * entry field: Net Value just equals Gross Value.
 */
export default function PricingElementsTable({
  level,
  basePrice,
  quantity,
  itemDiscount = 0,
  conditionDef,
  appliedCondition,
  onCommitCondition,
  onActivate,
}: {
  level: 'item' | 'header';
  basePrice: number; // unit price (item level) or subtotal (header level)
  quantity?: number; // item level only
  /** Header level only: the item-level K004 discounts already in the order, negative. */
  itemDiscount?: number;
  conditionDef?: ConditionTypeDef;
  appliedCondition?: AppliedCondition | null;
  onCommitCondition?: (amount: number) => void;
  onActivate?: () => void;
}) {
  const [codeInput, setCodeInput] = useState('');
  const [codeFocused, setCodeFocused] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isItem = level === 'item';
  const qty = quantity || 1; // per-unit figures never divide by zero
  const grossValue = isItem ? basePrice * (quantity ?? 1) : basePrice;
  const isActive = appliedCondition?.active ?? false;
  // A percentage applies to what is left after the item discounts, same as pricing.ts.
  const discountValue =
    conditionDef && appliedCondition
      ? conditionDef.calcType === 'amount'
        ? -(appliedCondition.amount * (quantity ?? 1))
        : -((grossValue + itemDiscount) * (appliedCondition.amount / 100))
      : 0;
  const appliedConditionValue = isActive || !conditionDef?.requiresActivation ? discountValue : 0;
  const appliedDiscount = itemDiscount + appliedConditionValue;
  const netValue = grossValue + appliedDiscount;
  const canEnter = Boolean(conditionDef && onCommitCondition) && !appliedCondition;

  function handleCommit() {
    if (!conditionDef || !onCommitCondition) return;
    setError(null);
    if (codeInput.trim().toUpperCase() !== conditionDef.code) {
      setError(`Unknown condition type "${codeInput}" — check your Reference Documents for the authorized condition.`);
      return;
    }
    const amount = Number(amountInput);
    if (!amountInput.trim() || Number.isNaN(amount)) {
      setError('Enter a numeric amount.');
      return;
    }
    onCommitCondition(amount);
    setCodeInput('');
    setAmountInput('');
  }

  // One grey display row. Subtotal rows are bold; per-unit figures only exist at item level.
  function row(opts: {
    key: string;
    status?: boolean;
    code?: string;
    description: string;
    amount: number;
    amountDecimals?: number;
    crcy?: string;
    value: number;
    valueCrcy?: string;
    bold?: boolean;
    valueBold?: boolean;
    numc: string;
    perUnit?: boolean;
  }) {
    const perUnit = isItem && opts.perUnit !== false;
    return (
      <tr key={opts.key} className={opts.bold ? 'subtotal' : undefined}>
        <td>
          <input type="checkbox" disabled />
        </td>
        <td>{opts.status && <span className="status-dot" />}</td>
        <td className="pe-display">{opts.code}</td>
        <td className="pe-display">{opts.description}</td>
        <td className="pe-display pe-num">{isItem ? num(opts.amount, opts.amountDecimals) : ''}</td>
        <td className="pe-display">{isItem ? (opts.crcy ?? 'USD') : ''}</td>
        <td className="pe-num">{perUnit ? '1' : ''}</td>
        <td>{perUnit ? 'EA' : ''}</td>
        <td className={`pe-display pe-num${opts.valueBold ? ' pe-value-bold' : ''}`}>{num(opts.value)}</td>
        <td className={`pe-display${opts.valueBold ? ' pe-value-bold' : ''}`}>{opts.valueCrcy ?? 'USD'}</td>
        <td></td>
        {isItem && <td className="pe-display pe-num">{opts.numc}</td>}
        <td className="pe-display"></td>
      </tr>
    );
  }

  const perUnit = (value: number) => (isItem ? value / qty : value);

  // The student's own condition (K004 on an item, RA00 on the header), once entered.
  const appliedRow =
    conditionDef && appliedCondition ? (
      <tr key="applied">
        <td>
          <input type="checkbox" disabled />
        </td>
        <td>
          <span className="status-dot" />
        </td>
        <td className="pe-display">{conditionDef.code}</td>
        <td className="pe-display">{conditionDef.name}</td>
        <td className="pe-display pe-num">
          {conditionDef.calcType === 'amount' ? num(-appliedCondition.amount) : num(-appliedCondition.amount, 3)}
        </td>
        <td className="pe-display">{conditionDef.calcType === 'amount' ? 'USD' : '%'}</td>
        <td className="pe-num">{isItem ? '1' : ''}</td>
        <td>{isItem ? 'EA' : ''}</td>
        <td className="pe-display pe-num">{num(discountValue)}</td>
        <td className="pe-display">USD</td>
        <td></td>
        {isItem && <td className="pe-display pe-num">1</td>}
        <td className="pe-display"></td>
      </tr>
    ) : null;

  // Header level: the item discounts arrive already summed, as one K004 line.
  const itemDiscountRow =
    !isItem && itemDiscount !== 0
      ? row({ key: 'k004-total', status: true, code: 'K004', description: 'Material', amount: 0, value: itemDiscount, valueBold: true, numc: '1' })
      : null;

  const columnCount = isItem ? 13 : 12;

  return (
    <div>
      <div className="pe-summary">
        {isItem && (
          <div className="field-row-inline">
            <label>Quantity:</label>
            <span className="sap-display-value" style={{ minWidth: 110, textAlign: 'right' }}>
              {num(quantity ?? 1, 0)}
            </span>
            <span>EA</span>
          </div>
        )}
        <div className="pe-summary-right">
          <div className="field-row-inline">
            <label>Net:</label>
            <span className="sap-display-value" style={{ minWidth: 150, textAlign: 'right' }}>
              {num(netValue)}
            </span>
            <span>USD</span>
          </div>
          <div className="field-row-inline">
            <label>Tax:</label>
            <span className="sap-display-value" style={{ minWidth: 150, textAlign: 'right' }}>
              {num(0)}
            </span>
          </div>
        </div>
      </div>

      <div className="pe-toolbar">
        <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
          <Icon name="zoom-in" />
        </span>
        <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
          <Icon name="sys-add" />
        </span>
        <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
          <Icon name="sys-minus" />
        </span>
        <Button icon="display" design="Default" className="pe-btn" disabled={!isItem}>
          Condition Record
        </Button>
        {isItem ? (
          <>
            <Button icon="chart-table-view" design="Default" className="pe-btn">
              Analysis
            </Button>
            <Button icon="currency" design="Default" className="pe-btn pe-btn-update">
              Update
            </Button>
          </>
        ) : (
          <span className="pe-header-actions">
            <Button icon="activate" design="Default" className="pe-btn" onClick={() => appliedCondition && !isActive && onActivate?.()}>
              {isActive ? 'Activated' : 'Activate'}
            </Button>
            <Button icon="currency" design="Default" className="pe-btn">
              Update
            </Button>
          </span>
        )}
      </div>

      <div className="pe-title">
        <span>Pricing Elements</span>
        <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
          <Icon name="action-settings" />
        </span>
      </div>

      <div className="pe-scroll">
        <table className="sap-pricing-table">
          <thead>
            <tr>
              <th></th>
              <th>I...</th>
              <th>CnTy</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Crcy</th>
              <th>per</th>
              <th>UoM</th>
              <th>Condition Value</th>
              <th>Crcy</th>
              <th>Status</th>
              {isItem && <th>NumC...</th>}
              <th>ATO/MTS Component</th>
            </tr>
          </thead>
          <tbody>
            {row({ key: 'pr00', code: 'PR00', description: 'Price', amount: isItem ? basePrice : grossValue, value: grossValue, valueBold: !isItem, numc: '1', perUnit: isItem, status: true })}
            {row({ key: 'gross', description: 'Gross Value', amount: perUnit(grossValue), value: grossValue, bold: true, numc: '1' })}
            {itemDiscountRow}
            {appliedRow}
            {row({ key: 'discount', description: 'Discount Amount', amount: perUnit(appliedDiscount), value: appliedDiscount, bold: true, numc: '1' })}
            {row({ key: 'rebate', description: 'Rebate Basis', amount: perUnit(netValue), value: netValue, bold: true, numc: '1' })}
            {row({ key: 'net', description: isItem ? 'Net Value for Item' : 'Net Value', amount: perUnit(netValue), value: netValue, bold: true, numc: '1' })}
            {row({ key: 'net2', description: 'Net Value 2', amount: perUnit(netValue), value: netValue, bold: true, numc: '1' })}
            {row({ key: 'total', description: 'Total', amount: perUnit(netValue), value: netValue, bold: true, numc: '1' })}
            {row({ key: 'skto', status: true, code: 'SKTO', description: 'Cash Discount', amount: 0, amountDecimals: 3, crcy: '%', value: 0, numc: '0', perUnit: false })}
            {/* Decorative only — not part of pricing.ts, never affects net value or CAP verification.
                Real SAP always shows a cost (VPRS) and a tax-jurisdiction line here; the specific
                figures are cosmetic (fixed fractions of gross/net). */}
            {row({ key: 'vprs', status: true, code: 'VPRS', description: 'Internal price', amount: perUnit(grossValue * 0.6), value: grossValue * 0.6, numc: '1' })}
            {row({ key: 'tax', description: 'Standard - USA /With Jur...', amount: perUnit(netValue * 0.13), value: netValue * 0.13, bold: true, numc: '1' })}

            {canEnter && (
              <tr className="editable-row">
                <td>
                  <input type="checkbox" disabled />
                </td>
                <td></td>
                <td>
                  <span className="sap-input-with-icon">
                    <input
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      onFocus={() => setCodeFocused(true)}
                      onBlur={() => setCodeFocused(false)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCommit()}
                      style={{ width: 64 }}
                    />
                    {codeFocused && (
                      <span className="sap-chrome-icon-btn" onMouseDown={(e) => e.preventDefault()}>
                        <Icon name="duplicate" />
                      </span>
                    )}
                  </span>
                </td>
                <td className="pe-display"></td>
                <td>
                  <input
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCommit()}
                    style={{ width: '100%', textAlign: 'right' }}
                  />
                </td>
                <td className="pe-display"></td>
                <td></td>
                <td></td>
                <td className="pe-display"></td>
                <td className="pe-display"></td>
                <td></td>
                {isItem && <td className="pe-display"></td>}
                <td className="pe-display"></td>
              </tr>
            )}
            {Array.from({ length: BLANK_ROWS }).map((_, i) => (
              <tr key={`blank-${i}`}>
                <td>
                  <input type="checkbox" disabled />
                </td>
                <td colSpan={columnCount - 1}></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && (
        <MessageStrip design="Negative" style={{ marginTop: 8 }}>
          {error}
        </MessageStrip>
      )}
    </div>
  );
}
