// Customer PO Number formatting — docs/architecture-proposal.md §3c.
// The counter itself is persisted state (packages/server owns the next-sequence counter per
// assignment); this just formats a sequence number the way the counter produces it.
export function formatPoNumber(sequence: number): string {
  return `PO-${10000 + sequence}`;
}
