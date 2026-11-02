import FooterActions from './FooterActions';
import { useState } from 'react';
import { Button, Icon } from '@ui5/webcomponents-react';
import SapChrome, { OVERVIEW_TOOLBAR_ICONS } from './SapChrome';
import DocumentTabStrip from './DocumentTabStrip';
import ItemsGrid from './ItemsGrid';
import { todayIso } from '../dateUtils';

const OVERVIEW_TABS = ['Sales', 'Item Overview', 'Item detail', 'Ordering party', 'Procurement', 'Shipping', 'Reason for rejection'];

/**
 * What real SAP shows right after a successful Save: a fresh, empty Overview ready for the next
 * document, with the confirmation only in the status bar (Kent's 2026-11-02 screenshot of VA21).
 * The student's saved document is nowhere on this screen — finding the number in the status bar is
 * the point. The fields are inert scenery: nothing here is wired to anything.
 */
export default function BlankOverviewScreen({ title, code, docLabel }: { title: string; code: string; docLabel: string }) {
  const [soldToFocused, setSoldToFocused] = useState(true);
  const today = todayIso();

  return (
    <div>
      <SapChrome title={title} code={code} toolbarIcons={OVERVIEW_TOOLBAR_ICONS} />
      <div className="sap-screen-body">
        <div className="field-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div className="field-row-inline">
            <label>{docLabel}:</label>
            <input style={{ width: 120 }} />
          </div>
          <div className="field-row-inline">
            <label>Net Value:</label>
            <span className="sap-display-value" style={{ minWidth: 150, textAlign: 'right' }}>
              0.00
            </span>
          </div>
        </div>
        <div className="field-row field-row-inline">
          <label>Sold-to Party:</label>
          <span className="sap-input-with-icon">
            <input
              autoFocus
              style={{ width: 140 }}
              onFocus={() => setSoldToFocused(true)}
              onBlur={() => setSoldToFocused(false)}
            />
            {soldToFocused && (
              <span className="sap-chrome-icon-btn" onMouseDown={(e) => e.preventDefault()}>
                <Icon name="duplicate" />
              </span>
            )}
          </span>
        </div>
        <div className="field-row field-row-inline">
          <label>Ship-to Party:</label>
          <input style={{ width: 140 }} />
        </div>
        <div className="field-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 48 }}>
          <div className="field-row-inline">
            <label>Cust. Reference:</label>
            <input />
          </div>
          <div className="field-row-inline">
            <label>Cust. Ref. Date:</label>
            <input type="date" />
          </div>
        </div>
      </div>

      <DocumentTabStrip tabs={OVERVIEW_TABS} active="Item Overview" />
      <div className="sap-screen-body">
        <div className="field-row" style={{ display: 'flex', gap: 48 }}>
          <div className="field-row-inline">
            <label>Valid From:</label>
            <input type="date" defaultValue={today} />
          </div>
          <div className="field-row-inline">
            <label>Valid To:</label>
            <input type="date" />
          </div>
        </div>
        <div className="field-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div className="field-row-inline">
            <label className="required">Req. Deliv. Date:</label>
            <input value="D" disabled style={{ width: 28, textAlign: 'center' }} />
            <input type="date" defaultValue={today} />
          </div>
          <div className="field-row-inline">
            <label>Expect.Ord.Val.:</label>
            <span className="sap-display-value" style={{ minWidth: 150, textAlign: 'right' }}>
              0.00
            </span>
          </div>
        </div>

        <ItemsGrid items={[]} selectedLines={[]} onToggleSelect={() => {}} readOnly />

        <FooterActions>
          <Button design="Emphasized">Save</Button>
          <Button design="Transparent">Cancel</Button>
        </FooterActions>
      </div>
    </div>
  );
}
