import type { Customer } from '@sap-sim/shared';

// Pilot customer pool — docs/architecture-proposal.md §3b.
// Company code "999" and country "US" are constant for all of them, carried over from
// Parand/UCC's sandbox master data for flavor; there is no live SAP connection.
export const CUSTOMERS: Customer[] = [
  { id: '129999', postalCode: '02210', city: 'Boston', name: 'Beantown Bikes', country: 'US' },
  { id: '126999', postalCode: '10014', city: 'New York City', name: 'Big Apple Bikes', country: 'US' },
  { id: '127999', postalCode: '19073', city: 'Philadelphia', name: 'Philly Bikes', country: 'US' },
  { id: '135999', postalCode: '20003', city: 'Washington, DC', name: 'DC Bikes', country: 'US' },
  { id: '128999', postalCode: '30319', city: 'Atlanta', name: 'Peachtree Bikes', country: 'US' },
  { id: '132999', postalCode: '48076', city: 'Detroit', name: 'Motown Bikes', country: 'US' },
  { id: '131999', postalCode: '49504', city: 'Grand Rapids', name: 'Furniture City Bikes', country: 'US' },
  { id: '130999', postalCode: '60515', city: 'Chicago', name: 'Windy City Bikes', country: 'US' },
  { id: '125999', postalCode: '80207', city: 'Denver', name: 'Rocky Mountain Bikes', country: 'US' },
  { id: '133999', postalCode: '92612', city: 'Irvine', name: 'SoCal Bikes', country: 'US' },
  { id: '134999', postalCode: '94304', city: 'Palo Alto', name: 'Silicon Valley Bikes', country: 'US' },
  { id: '136999', postalCode: '98146', city: 'Seattle', name: 'Northwest Bikes', country: 'US' },
];

export function getCustomer(id: string): Customer {
  const customer = CUSTOMERS.find((c) => c.id === id);
  if (!customer) throw new Error(`Unknown customer id: ${id}`);
  return customer;
}
