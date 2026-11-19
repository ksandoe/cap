import type { PublicSalesDocument, SalesDocument, SalesDocumentItem } from '@cap/sim-shared';
import { priceDocument } from './pricing';
import { getMaterial } from './seed/materials';

/**
 * Prices a document from its items and conditions. The server always does this itself and never
 * trusts a net value from the browser.
 */
export function repriceDocument(doc: {
  items: SalesDocumentItem[];
  headerConditions: SalesDocument['headerConditions'];
}): { items: SalesDocumentItem[]; netValue: number } {
  const { itemNetValues, netValue } = priceDocument(
    doc.items.map((i) => ({ materialId: i.materialId, quantity: i.quantity, itemConditions: i.itemConditions })),
    doc.headerConditions,
    getMaterial,
  );
  return { items: doc.items.map((item, idx) => ({ ...item, itemNetValue: itemNetValues[idx] })), netValue };
}

/** A document as the browser may see it: no learner key. */
export function toPublicDocument(doc: SalesDocument): PublicSalesDocument;
export function toPublicDocument(doc: SalesDocument[]): PublicSalesDocument[];
export function toPublicDocument(doc: SalesDocument | SalesDocument[]): PublicSalesDocument | PublicSalesDocument[] {
  const strip = (d: SalesDocument): PublicSalesDocument => {
    const { studentKey: _studentKey, ...pub } = d;
    return pub;
  };
  return Array.isArray(doc) ? doc.map(strip) : strip(doc);
}
