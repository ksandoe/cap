import type { Customer } from '@sap-sim/shared';

// Pilot customer pool — docs/architecture-proposal.md §3b.
// Company code "999" and country "US" are constant for all of them, carried over from
// Parand/UCC's sandbox master data for flavor; there is no live SAP connection.
export const CUSTOMERS: Customer[] = [
  { id: '129999', street: '299 Summer St', state: 'MA', postalCode: '02210', city: 'Boston', name: 'Beantown Bikes', country: 'US' },
  { id: '126999', street: '48 Bleecker St', state: 'NY', postalCode: '10014', city: 'New York City', name: 'Big Apple Bikes', country: 'US' },
  { id: '127999', street: '1500 Market St', state: 'PA', postalCode: '19073', city: 'Philadelphia', name: 'Philly Bikes', country: 'US' },
  { id: '135999', street: '820 H St NE', state: '', postalCode: '20003', city: 'Washington, DC', name: 'DC Bikes', country: 'US' },
  { id: '128999', street: '3330 Peachtree Rd', state: 'GA', postalCode: '30319', city: 'Atlanta', name: 'Peachtree Bikes', country: 'US' },
  { id: '132999', street: '215 Woodward Ave', state: 'MI', postalCode: '48076', city: 'Detroit', name: 'Motown Bikes', country: 'US' },
  { id: '131999', street: '60 Monroe Ave NW', state: 'MI', postalCode: '49504', city: 'Grand Rapids', name: 'Furniture City Bikes', country: 'US' },
  { id: '130999', street: '410 N Michigan Ave', state: 'IL', postalCode: '60515', city: 'Chicago', name: 'Windy City Bikes', country: 'US' },
  { id: '125999', street: '1700 Larimer St', state: 'CO', postalCode: '80207', city: 'Denver', name: 'Rocky Mountain Bikes', country: 'US' },
  { id: '133999', street: '18 Technology Dr', state: 'CA', postalCode: '92612', city: 'Irvine', name: 'SoCal Bikes', country: 'US' },
  { id: '134999', street: '525 University Ave', state: 'CA', postalCode: '94304', city: 'Palo Alto', name: 'Silicon Valley Bikes', country: 'US' },
  { id: '136999', street: '1201 Third Ave', state: 'WA', postalCode: '98146', city: 'Seattle', name: 'Northwest Bikes', country: 'US' },
];

export function getCustomer(id: string): Customer {
  const customer = CUSTOMERS.find((c) => c.id === id);
  if (!customer) throw new Error(`Unknown customer id: ${id}`);
  return customer;
}
