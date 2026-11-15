import { getCustomer } from '@sap-sim/engine';

/** SAP shows amounts with a thousands separator and a trailing currency code — "36,800.00 USD",
 * never a "$" prefix (Kent, 2026-11-02). */
export function formatCurrency(amount: number, currency = 'USD'): string {
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

/** The partner line on the Overview screens: "Company Beantown Bikes, 299 Summer St, Boston MA 02210, USA"
 * (Kent's 2026-11-02 screenshots of the real VA01 and VA21 Overviews). */
export function addressLine(customerId: string): string {
  const c = getCustomer(customerId);
  const country = c.country === 'US' ? 'USA' : c.country;
  return `Company ${c.name}, ${c.street}, ${c.city}${c.state ? ` ${c.state}` : ''} ${c.postalCode}, ${country}`;
}
