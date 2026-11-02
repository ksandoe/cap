/**
 * The document-level tab strip real SAP shows on the Overview screen (Sales | Item Overview |
 * Item detail | Ordering party | ...) — distinct from the per-item tab strip in ItemDetailPanel.
 * Purely decorative chrome unless a screen passes `onSelect` (the Order Overview does, so clicking a
 * tab scrolls the screen back up the way it does in real SAP).
 */
export default function DocumentTabStrip({
  tabs,
  active,
  onSelect,
}: {
  tabs: string[];
  active: string;
  onSelect?: (tab: string) => void;
}) {
  return (
    <div className="sap-tab-strip">
      {tabs.map((t) => (
        <div key={t} className={`sap-tab${t === active ? ' active' : ''}`} onClick={onSelect ? () => onSelect(t) : undefined}>
          {t}
        </div>
      ))}
    </div>
  );
}
