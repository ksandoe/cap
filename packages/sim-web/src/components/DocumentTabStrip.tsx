/**
 * The document-level tab strip real SAP shows on the Overview screen (Sales | Item Overview |
 * Item detail | Ordering party | ...) — distinct from the per-item tab strip in ItemDetailPanel.
 * Purely decorative chrome: our wizard already walks the student through "Item Overview" step by
 * step, so the other tabs aren't wired to anything, same reasoning as SapChrome's decorative icons.
 */
export default function DocumentTabStrip({ tabs, active }: { tabs: string[]; active: string }) {
  return (
    <div className="sap-tab-strip">
      {tabs.map((t) => (
        <div key={t} className={`sap-tab${t === active ? ' active' : ''}`}>
          {t}
        </div>
      ))}
    </div>
  );
}
