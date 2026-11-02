import { useState } from 'react';
import { Icon } from '@ui5/webcomponents-react';

// Initial screens and Overview screens both show just a single "Menu" dropdown plus a transaction-
// code field — not a bar of menu-item words. Per Kent's 2026-11-01 note: "the menu is a dropdown,
// not a bar." The old multi-item bar (Sales Document / Edit / Goto / ...) never matched any real
// screenshot; those are items *inside* the one Menu dropdown, not a row of their own.
//
// The icons sit on the same row as the Menu dropdown, immediately to the right of the tcode field —
// not a separate row below (Kent, 2026-11-01). They're screen-specific — the initial screen has none
// at all (see Kent's 2026-11-01 screenshot of "Create Inquiry"); callers that want some pass
// `toolbarIcons` explicitly. The Overview screen's own set: Display / Propose Items / Header Preview /
// Reject Document / Aggregation / More — per Kent's 2026-11-01 walkthrough of "Create Inquiry:
// Overview". "Display" is the classic SAP eyeglasses icon, confirmed against the icon explorer as
// `display` (not `show`, which is a Fiori eye). None of these open the item-detail drill-in; that's
// triggered by double-clicking a row in the items grid instead (see ItemsGrid's onRowOpen).
export const OVERVIEW_TOOLBAR_ICONS = ['display', 'add-process', 'header', 'decline', 'sum', 'overflow'];

/**
 * The classic SAP header bar + menu row + toolbar — docs/decisions/001 and the real screenshots
 * in "The Sales Process in SAP.pdf" (pages 3, 9, 18) and Kent's own perth.cob.csuchico.edu
 * captures. Visual density on purpose: this is what Kent asked us to replicate after seeing the
 * thin slice's screens looked too clean next to the real SAP UI.
 */
export interface MenuItem {
  label: string;
  children?: MenuItem[];
  /** Leaf actions only; anything without one is decorative clutter, like most of real SAP's menu. */
  onSelect?: () => void;
}

function MenuList({ items, onPick }: { items: MenuItem[]; onPick: () => void }) {
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  return (
    <div className="sap-menu-list">
      {items.map((item) => (
        <div
          key={item.label}
          className="sap-menu-item"
          onMouseEnter={() => setOpenLabel(item.children ? item.label : null)}
          onClick={(e) => {
            e.stopPropagation();
            if (item.children) {
              setOpenLabel(item.label);
              return;
            }
            item.onSelect?.();
            onPick();
          }}
        >
          {item.label}
          {item.children && <span className="sap-menu-arrow">›</span>}
          {item.children && openLabel === item.label && (
            <div className="sap-menu-sub">
              <MenuList items={item.children} onPick={onPick} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SapChrome({
  title,
  code,
  toolbarIcons = [],
  menuItems,
  onBack,
}: {
  title: string;
  /** The transaction code shown top-right, e.g. "VA11" — see "The Sales Process in SAP.pdf" screenshots. */
  code?: string;
  /** The decorative icon row — e.g. OVERVIEW_TOOLBAR_ICONS for the Overview screen. Omit entirely
   * for the initial screen, which has no icon row at all. */
  toolbarIcons?: string[];
  /** Makes the "Menu" dropdown real — the exercise sends students through Goto ▸ Header ▸ Conditions. */
  menuItems?: MenuItem[];
  /** Real SAP's back arrow is the actual way back — there's no separate Back button anywhere. */
  onBack?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="sap-chrome">
      <div className="sap-chrome-bar">
        <span className={`sap-chrome-back${onBack ? ' sap-chrome-back--active' : ''}`} onClick={onBack}>
          ‹
        </span>
        <span className="sap-chrome-logo">SAP</span>
        <span className="sap-chrome-title">{title}</span>
        {code && <span className="sap-chrome-code">› {code} ⌄</span>}
        <span className="sap-chrome-exit">Exit</span>
      </div>
      <div className="sap-chrome-minimal-row">
        <span className={menuItems ? 'sap-menu-trigger' : undefined} onClick={() => menuItems && setMenuOpen((o) => !o)}>
          Menu ⌄
          {menuItems && menuOpen && (
            <>
              <div className="sap-menu-backdrop" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
              <MenuList items={menuItems} onPick={() => setMenuOpen(false)} />
            </>
          )}
        </span>
        <span className="sap-chrome-command-field" />
        {toolbarIcons.length > 0 && (
          <div className="sap-chrome-toolbar">
            {toolbarIcons.map((icon) => (
              <span key={icon} className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
                <Icon name={icon} />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
