import { Icon } from '@ui5/webcomponents-react';

const MENU_ITEMS = ['Sales Document', 'Edit', 'Goto', 'Extras', 'Environment', 'System', 'Help'];
// Mostly decorative — real SAP buries the handful of icons a student actually needs among many
// that do nothing for this exercise. A couple (search-help, item-detail) are wired by the caller.
// Names must exist in the installed @ui5/webcomponents-icons set — verified against the running
// app, since an unregistered name silently renders a blank box.
const DECORATIVE_ICONS = ['add', 'less', 'sort', 'filter', 'refresh', 'grid', 'group-2', 'overflow'];

/**
 * The classic SAP header bar + menu row + toolbar — docs/decisions/001 and the real screenshots
 * in "The Sales Process in SAP.pdf" (pages 3, 9, 18). Visual density on purpose: this is what
 * Kent asked us to replicate after seeing the thin slice's screens looked too clean next to the
 * real SAP UI.
 */
export default function SapChrome({
  title,
  itemDetailIcon,
  onItemDetail,
  itemDetailDisabled,
}: {
  title: string;
  itemDetailIcon?: boolean;
  onItemDetail?: () => void;
  itemDetailDisabled?: boolean;
}) {
  return (
    <div className="sap-chrome">
      <div className="sap-chrome-bar">
        <span className="sap-chrome-back">‹</span>
        <span className="sap-chrome-logo">SAP</span>
        <span className="sap-chrome-title">{title}</span>
        <span className="sap-chrome-exit">Exit</span>
      </div>
      <div className="sap-chrome-menu">
        {MENU_ITEMS.map((m) => (
          <span key={m} className="sap-chrome-menu-item">
            {m} ⌄
          </span>
        ))}
      </div>
      <div className="sap-chrome-toolbar">
        {DECORATIVE_ICONS.map((icon) => (
          <span key={icon} className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
            <Icon name={icon} />
          </span>
        ))}
        {itemDetailIcon && (
          <span
            className={`sap-chrome-icon-btn${itemDetailDisabled ? ' sap-chrome-icon-btn--disabled' : ''}`}
            title="Item conditions / detail"
            onClick={itemDetailDisabled ? undefined : onItemDetail}
          >
            <Icon name="document" />
          </span>
        )}
      </div>
    </div>
  );
}
