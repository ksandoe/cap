import { useState } from 'react';
import { Button, MessageStrip } from '@ui5/webcomponents-react';
import type { AppliedCondition, ConditionTypeDef } from '@sap-sim/shared';
import { formatCurrency } from '../formatUtils';

/**
 * The "Conditions" tab's Pricing Elements table — the real interaction behind both the item-level
 * K004 discount and the header-level RA00 discount, replicated from "The Sales Process in SAP.pdf"
 * pages 18-19. Mostly read-only system rows (PR00 Price, Gross Value, Rebate Basis, Total) plus
 * one editable row at the bottom where the student types a condition type code and an amount.
 *
 * Per docs/decisions/001: a wrong condition type code is rejected (structural — real SAP would
 * reject an unrecognized code too), but a wrong *amount*, or applying the condition to the wrong
 * item/level entirely, is accepted and simply produces a wrong net value downstream.
 *
 * `conditionDef` is omitted on the Inquiry's Conditions tab — real SAP still shows the full pricing
 * procedure there (Kent, 2026-11-02), but K004/RA00 aren't enterable until Quotation, so there's no
 * discount row or entry field: Net Value just equals Gross Value.
 */
export default function PricingElementsTable({
  level,
  basePrice,
  quantity,
  conditionDef,
  appliedCondition,
  onCommitCondition,
  onActivate,
}: {
  level: 'item' | 'header';
  basePrice: number; // unit price (item level) or subtotal (header level)
  quantity?: number; // item level only
  conditionDef?: ConditionTypeDef;
  appliedCondition?: AppliedCondition | null;
  onCommitCondition?: (amount: number) => void;
  onActivate?: () => void;
}) {
  const [codeInput, setCodeInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const grossValue = level === 'item' ? basePrice * (quantity ?? 1) : basePrice;
  const isActive = appliedCondition?.active ?? false;
  const discountValue =
    conditionDef && appliedCondition
      ? conditionDef.calcType === 'amount'
        ? -(appliedCondition.amount * (quantity ?? 1))
        : -(grossValue * (appliedCondition.amount / 100))
      : 0;
  const netValue = grossValue + (isActive || !conditionDef?.requiresActivation ? discountValue : 0);

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

  return (
    <div>
      <div className="field-row" style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
        <div>
          <label>Net</label>
          <div>{formatCurrency(netValue)}</div>
        </div>
        <div>
          <label>Tax</label>
          <div>{formatCurrency(0)}</div>
        </div>
        {conditionDef?.requiresActivation && appliedCondition && onActivate && (
          <Button design={isActive ? 'Transparent' : 'Emphasized'} disabled={isActive} onClick={onActivate}>
            {isActive ? 'Active' : 'Activate'}
          </Button>
        )}
      </div>

      <div className="sap-pricing-toolbar">
        <Button design="Transparent" icon="search">
          Condition Record
        </Button>
        <Button design="Transparent" icon="bar-chart">
          Analysis
        </Button>
        <Button design="Transparent" icon="refresh">
          Update
        </Button>
      </div>

      <table className="sap-pricing-table">
        <thead>
          <tr>
            <th></th>
            <th>CnTy</th>
            <th>Description</th>
            <th>Amount</th>
            {level === 'item' && <th>per/UoM</th>}
            <th>Condition Value</th>
            <th>NumC</th>
            <th>ATO/MTS Component</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td></td>
            <td>PR00</td>
            <td>Price</td>
            <td>{level === 'item' ? formatCurrency(basePrice) : ''}</td>
            {level === 'item' && <td>1 EA</td>}
            <td>{formatCurrency(grossValue)}</td>
            <td>1</td>
            <td></td>
          </tr>
          <tr className="subtotal">
            <td></td>
            <td></td>
            <td>Gross Value</td>
            <td></td>
            {level === 'item' && <td></td>}
            <td>{formatCurrency(grossValue)}</td>
            <td></td>
            <td></td>
          </tr>
          {conditionDef && appliedCondition && (
            <tr>
              <td>
                <span className="status-dot" />
              </td>
              <td>{conditionDef.code}</td>
              <td>{conditionDef.name}</td>
              <td>
                {conditionDef.calcType === 'amount' ? `-${formatCurrency(appliedCondition.amount)}` : `-${appliedCondition.amount}%`}
              </td>
              {level === 'item' && <td>1 EA</td>}
              <td>-{formatCurrency(-discountValue)}</td>
              <td>1</td>
              <td></td>
            </tr>
          )}
          <tr>
            <td></td>
            <td></td>
            <td>Discount Amount</td>
            <td></td>
            {level === 'item' && <td></td>}
            <td>{formatCurrency(isActive || !conditionDef?.requiresActivation ? discountValue : 0)}</td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td></td>
            <td></td>
            <td>Rebate Basis</td>
            <td></td>
            {level === 'item' && <td></td>}
            <td>{formatCurrency(grossValue)}</td>
            <td></td>
            <td></td>
          </tr>
          <tr className="subtotal">
            <td></td>
            <td></td>
            <td>{level === 'item' ? 'Net Value for Item' : 'Net Value'}</td>
            <td></td>
            {level === 'item' && <td></td>}
            <td>{formatCurrency(netValue)}</td>
            <td></td>
            <td></td>
          </tr>
          <tr className="subtotal">
            <td></td>
            <td></td>
            <td>Net Value 2</td>
            <td></td>
            {level === 'item' && <td></td>}
            <td>{formatCurrency(netValue)}</td>
            <td></td>
            <td></td>
          </tr>
          <tr className="subtotal">
            <td></td>
            <td></td>
            <td>Total</td>
            <td></td>
            {level === 'item' && <td></td>}
            <td>{formatCurrency(netValue)}</td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td>
              <span className="status-dot" />
            </td>
            <td>SKTO</td>
            <td>Cash Discount</td>
            <td>0.000%</td>
            {level === 'item' && <td></td>}
            <td>{formatCurrency(0)}</td>
            <td>0</td>
            <td></td>
          </tr>
          {/* Decorative only — not part of pricing.ts, never affects net value or CAP verification.
              Real SAP always shows a cost (VPRS) and a tax-jurisdiction line here; the specific
              figures are cosmetic (fixed fractions of gross/net), matching the *shape* of the
              screen Kent captured on 2026-11-01, not any real costing/tax data we model. */}
          <tr>
            <td>
              <span className="status-dot" />
            </td>
            <td>VPRS</td>
            <td>Internal price</td>
            <td>{level === 'item' ? formatCurrency((grossValue * 0.6) / (quantity || 1)) : ''}</td>
            {level === 'item' && <td>1 EA</td>}
            <td>{formatCurrency(grossValue * 0.6)}</td>
            <td>1</td>
            <td></td>
          </tr>
          <tr>
            <td></td>
            <td></td>
            <td>Standard - USA /With Jur...</td>
            <td>{level === 'item' ? formatCurrency((netValue * 0.13) / (quantity || 1)) : ''}</td>
            {level === 'item' && <td>1 EA</td>}
            <td>{formatCurrency(netValue * 0.13)}</td>
            <td>1</td>
            <td></td>
          </tr>
          {conditionDef && !appliedCondition && (
            <tr className="editable-row">
              <td></td>
              <td>
                <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="e.g. K004" />
              </td>
              <td></td>
              <td>
                <input value={amountInput} onChange={(e) => setAmountInput(e.target.value)} placeholder="amount" />
              </td>
              {level === 'item' && <td></td>}
              <td>
                <Button design="Transparent" onClick={handleCommit}>
                  Enter
                </Button>
              </td>
              <td></td>
              <td></td>
            </tr>
          )}
        </tbody>
      </table>
      {error && (
        <MessageStrip design="Negative" style={{ marginTop: 8 }}>
          {error}
        </MessageStrip>
      )}
    </div>
  );
}
