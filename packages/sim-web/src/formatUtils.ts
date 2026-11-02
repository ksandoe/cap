/** SAP shows amounts with a thousands separator and a trailing currency code — "36,800.00 USD",
 * never a "$" prefix (Kent, 2026-11-02). */
export function formatCurrency(amount: number, currency = 'USD'): string {
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}
