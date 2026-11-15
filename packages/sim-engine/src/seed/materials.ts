import type { Material } from '@sap-sim/shared';

// Pilot material pool — docs/architecture-proposal.md §3b.
// Six materials: one Deluxe + one Professional Touring Bike per student, color (and therefore
// price) randomized independently per slot — see variantResolution.ts.
export const MATERIALS: Material[] = [
  { id: 'DXTR1999', description: 'Deluxe Touring Bike (Black)', basePrice: 900, weightGrams: 8000 },
  { id: 'DXTR3999', description: 'Deluxe Touring Bike (Red)', basePrice: 910, weightGrams: 8000 },
  { id: 'DXTR2999', description: 'Deluxe Touring Bike (Silver)', basePrice: 940, weightGrams: 8000 },
  { id: 'PRTR1999', description: 'Professional Touring Bike (Black)', basePrice: 1200, weightGrams: 7990 },
  { id: 'PRTR3999', description: 'Professional Touring Bike (Red)', basePrice: 1210, weightGrams: 7990 },
  { id: 'PRTR2999', description: 'Professional Touring Bike (Silver)', basePrice: 1240, weightGrams: 7990 },
];

export const DELUXE_COLOR_POOL = ['DXTR1999', 'DXTR3999', 'DXTR2999'];
export const PROFESSIONAL_COLOR_POOL = ['PRTR1999', 'PRTR3999', 'PRTR2999'];

export function getMaterial(id: string): Material {
  const material = MATERIALS.find((m) => m.id === id);
  if (!material) throw new Error(`Unknown material id: ${id}`);
  return material;
}
