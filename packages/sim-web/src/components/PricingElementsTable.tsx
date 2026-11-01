import { useState } from 'react';
import { Button, MessageStrip } from '@ui5/webcomponents-react';
import type { AppliedCondition, ConditionTypeDef } from '@sap-sim/shared';

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * The "Conditions" tab's Pricing Elements table — the real interaction behind both the item-level
 * K004 discount and the header-level RA00 discount, replicated from "The Sales Process in SAP.pdf"
 * pages 18-19. Mostly read-only system rows (PR00 Price, Gross Value, Rebate Basis, Total) plus
 * one editable row at the bottom where the student types a condition type code and an amount.
 *
 * Per docs/decisions/001: a wrong condition type code is rejected (structural — real SAP would
 * reject an unrecognized code too), but a wrong *amount*, or applying the condition to the wrong
 * item/level entirely, is accepted and simply produces a wrong net value downstream.
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
  conditionDef: ConditionTypeDef;
  appliedCondition: AppliedCondition | null;
  onCommitCondition: (amount: number) => void;
  onActivate: () => void;
}) {
  const [codeInput, setCodeInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const grossValue = level === 'item' ? basePrice * (quantity ?? 1) : basePrice;
  const isActive = appliedCondition?.active ?? false;
  const discountValue = appliedCondition
    ? conditionDef.calcType === 'amount'
      ? -(appliedCondition.amount * (quantity ?? 1))
      : -(grossValue * (appliedCondition.amount / 100))
    : 0;
  const netValue = grossValue + (isActive || !conditionDef.requiresActivation ? discountValue : 0);

  function handleCommit() {
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
      <div className="field-row" style={{ display: 'flex', gap: 24 }}>
        <div>
          <label>Net</label>
          <div>${money(netValue)}</div>
        </div>
        <div>
          <label>Tax</label>
          <div>$0.00</div>
        </div>
        {conditionDef.requiresActivation && appliedCondition && (
          <Button design={isActive ? 'Transparent' : 'Emphasized'} disabled={isActive} onClick={onActivate}>
            {isActive ? 'Active' : 'Activate'}
          </Button>
        )}
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
          </tr>
        </thead>
        <tbody>
          <tr>
            <td></td>
            <td>PR00</td>
            <td>Price</td>
            <td>{level === 'item' ? `$${money(basePrice)}` : ''}</td>
            {level === 'item' && <td>1 EA</td>}
            <td>${money(grossValue)}</td>
          </tr>
          <tr className="subtotal">
            <td></td>
            <td></td>
            <td>Gross Value</td>
            <td></td>
            {level === 'item' && <td></td>}
            <td>${money(grossValue)}</td>
          </tr>
          {appliedCondition && (
            <tr>
              <td>
                <span className="status-dot" />
              </td>
              <td>{conditionDef.code}</td>
              <td>{conditionDef.name}</td>
              <td>
                {conditionDef.calcType === 'amount' ? `-$${money(appliedCondition.amount)}` : `-${appliedCondition.amount}%`}
              </td>
              {level === 'item' && <td>1 EA</td>}
              <td>-${money(-discountValue)}</td>
            </tr>
          )}
          <tr>
            <td></td>
            <td></td>
            <td>Discount Amount</td>
            <td></td>
            {level === 'item' && <td></td>}
            <td>${money(isActive || !conditionDef.requiresActivation ? discountValue : 0)}</td>
          </tr>
          <tr>
            <td></td>
            <td></td>
            <td>Rebate Basis</td>
            <td></td>
            {level === 'item' && <td></td>}
            <td>${money(grossValue)}</td>
          </tr>
          <tr className="subtotal">
            <td></td>
            <td></td>
            <td>{level === 'item' ? 'Net Value for Item' : 'Net Value'}</td>
            <td></td>
            {level === 'item' && <td></td>}
            <td>${money(netValue)}</td>
          </tr>
          <tr className="subtotal">
            <td></td>
            <td></td>
            <td>Total</td>
            <td></td>
            {level === 'item' && <td></td>}
            <td>${money(netValue)}</td>
          </tr>
          {!appliedCondition && (
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
