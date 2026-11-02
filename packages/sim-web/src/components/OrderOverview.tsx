import FooterActions from './FooterActions';
import { useEffect, useRef, useState } from 'react';
import { Button, Icon } from '@ui5/webcomponents-react';
import type { SalesDocumentItem } from '@sap-sim/shared';
import { getMaterial } from '@sap-sim/engine';
import SapChrome, { OVERVIEW_TOOLBAR_ICONS, type MenuItem } from './SapChrome';
import DocumentTabStrip from './DocumentTabStrip';
import ItemsGrid from './ItemsGrid';
import { todayIso } from '../dateUtils';
import { addressLine, formatCurrency } from '../formatUtils';

const OVERVIEW_TABS = ['Sales', 'Item Overview', 'Item detail', 'Ordering party', 'Procurement', 'Shipping', 'Reason for rejection'];

export interface OrderFocusRequest {
  field: 'custReference' | 'custReferenceDate' | 'requestedDeliveryDate';
  /** Bumped on every request so asking for the same field twice still re-focuses it. */
  tick: number;
}

/**
 * The real "Create Standard Order: Overview" (Kent's 2026-11-02 VA01 screenshots). The document
 * scrolls inside the frame beneath the toolbar, and right after Create with Reference it opens
 * already scrolled to the tab bar, so the required Cust. Reference / Cust. Ref. Date fields sit
 * above the visible area — clicking a tab (or an error from Save) brings the student back up.
 *
 * `mode="blank"` is the fresh, empty copy SAP shows after a successful save: nothing is wired and
 * nothing is highlighted, and the saved order's number is only in the status bar.
 */
export default function OrderOverview({
  mode,
  title,
  code,
  menuItems,
  customerId,
  netValue = 0,
  items = [],
  selectedLine = null,
  onSelectLine,
  onRowOpen,
  onOpenConditions,
  onNoSelection,
  custReference = '',
  custReferenceDate = '',
  onCustReferenceChange,
  onCustReferenceDateChange,
  requestedDeliveryDate = '',
  onRequestedDeliveryDateChange,
  focusRequest = null,
  onSave,
  onCancel,
}: {
  mode: 'live' | 'blank';
  title: string;
  code: string;
  menuItems?: MenuItem[];
  customerId?: string;
  netValue?: number;
  items?: SalesDocumentItem[];
  selectedLine?: number | null;
  onSelectLine?: (line: number | null) => void;
  onRowOpen?: (line: number) => void;
  onOpenConditions?: (line: number) => void;
  onNoSelection?: () => void;
  custReference?: string;
  custReferenceDate?: string;
  onCustReferenceChange?: (value: string) => void;
  onCustReferenceDateChange?: (value: string) => void;
  requestedDeliveryDate?: string;
  onRequestedDeliveryDateChange?: (value: string) => void;
  focusRequest?: OrderFocusRequest | null;
  onSave?: () => void;
  onCancel?: () => void;
}) {
  const live = mode === 'live';
  const today = todayIso();
  const [activeTab, setActiveTab] = useState('Sales');
  const [soldToFocused, setSoldToFocused] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const refInput = useRef<HTMLInputElement>(null);
  const refDateInput = useRef<HTMLInputElement>(null);
  const delivDateInput = useRef<HTMLInputElement>(null);

  // Open already scrolled to the tab bar, as real SAP does after Copy.
  useEffect(() => {
    if (live && scrollRef.current && tabsRef.current) {
      scrollRef.current.scrollTop = tabsRef.current.offsetTop;
    }
  }, [live]);

  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.field === 'requestedDeliveryDate') setActiveTab('Sales');
    scrollRef.current?.scrollTo({ top: 0 });
    const target = { custReference: refInput, custReferenceDate: refDateInput, requestedDeliveryDate: delivDateInput }[
      focusRequest.field
    ];
    target.current?.focus();
  }, [focusRequest]);

  function selectTab(tab: string) {
    setActiveTab(tab);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  const totalWeight = items.reduce((sum, i) => sum + getMaterial(i.materialId).weightGrams * i.quantity, 0);
  const showSalesFields = activeTab === 'Sales' || activeTab === 'Item Overview';
  const address = live && customerId ? addressLine(customerId) : '';

  // Required header fields get bold labels and a yellow box while empty; the blank post-save
  // screen shows them plain.
  const refEmpty = live && !custReference;
  const refDateEmpty = live && !custReferenceDate;

  return (
    <div>
      <SapChrome title={title} code={code} toolbarIcons={OVERVIEW_TOOLBAR_ICONS} menuItems={menuItems} />
      <div className="order-scroll" ref={scrollRef}>
        <div className="order-header">
          <div className="field-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div className="field-row-inline">
              <label>Standard Order:</label>
              {live ? (
                <span className="sap-display-value" style={{ minWidth: 120 }}>
                  &nbsp;
                </span>
              ) : (
                <input style={{ width: 120 }} />
              )}
            </div>
            <div className="field-row-inline">
              <label>Net Value:</label>
              <span className="sap-display-value" style={{ minWidth: 150, textAlign: 'right' }}>
                {live ? formatCurrency(netValue) : '0.00'}
              </span>
            </div>
          </div>

          <div className="field-row field-row-inline">
            <label>Sold-to Party:</label>
            {live ? (
              <>
                <span className="sap-display-value" style={{ minWidth: 100 }}>
                  {customerId}
                </span>
                <span className="sap-display-value">{address}</span>
              </>
            ) : (
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
            )}
            <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative" style={{ marginLeft: 'auto' }}>
              <Icon name="document" />
            </span>
          </div>

          <div className="field-row field-row-inline">
            <label>Ship-to Party:</label>
            {live ? (
              <>
                <span className="sap-display-value" style={{ minWidth: 100 }}>
                  {customerId}
                </span>
                <span className="sap-display-value">{address}</span>
              </>
            ) : (
              <input style={{ width: 140 }} />
            )}
          </div>

          <div className="field-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
            <div className="field-row-inline">
              <label className={live ? 'sap-label-required' : undefined}>Cust. Reference:</label>
              <input
                ref={refInput}
                value={live ? custReference : undefined}
                onChange={live ? (e) => onCustReferenceChange?.(e.target.value) : undefined}
                className={refEmpty ? 'sap-required-empty' : undefined}
                style={{ width: 200 }}
              />
            </div>
            <div className="field-row-inline">
              <label className={live ? 'sap-label-required' : undefined}>Cust. Ref. Date:</label>
              <input
                ref={refDateInput}
                type="date"
                value={live ? custReferenceDate : undefined}
                onChange={live ? (e) => onCustReferenceDateChange?.(e.target.value) : undefined}
                className={refDateEmpty ? 'sap-required-empty' : undefined}
                style={{ width: 150 }}
              />
            </div>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
                <Icon name="inspection" />
              </span>
              <span className="sap-chrome-icon-btn sap-chrome-icon-btn--decorative">
                <Icon name="signature" />
              </span>
            </span>
          </div>
        </div>

        <div ref={tabsRef}>
          <DocumentTabStrip tabs={OVERVIEW_TABS} active={activeTab} onSelect={selectTab} />
        </div>

        <div className="sap-screen-body order-body">
          {showSalesFields ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', columnGap: 32 }}>
                <div>
                  <div className="field-row field-row-inline">
                    <label className="required">Req. Deliv.Date:</label>
                    <input value="D" disabled style={{ width: 28, textAlign: 'center' }} />
                    <input
                      ref={delivDateInput}
                      type="date"
                      style={{ width: 150 }}
                      value={live ? requestedDeliveryDate : undefined}
                      defaultValue={live ? undefined : today}
                      onChange={live ? (e) => onRequestedDeliveryDateChange?.(e.target.value) : undefined}
                    />
                  </div>
                  <div className="field-row field-row-inline">
                    <label>Complete Dlv.:</label>
                    <input type="checkbox" />
                  </div>
                  <div className="field-row field-row-inline">
                    <label>Delivery Block:</label>
                    <select style={{ width: 240 }}></select>
                  </div>
                  <div className="field-row field-row-inline">
                    <label>Billing Block:</label>
                    <select style={{ width: 240 }}></select>
                  </div>
                  <div className="field-row field-row-inline">
                    <label>Pyt Terms:</label>
                    <input style={{ width: 60 }} defaultValue={live ? '0001' : ''} />
                    {live && <span>Pay immediately w/o deduction</span>}
                  </div>
                  <div className="field-row field-row-inline">
                    <label>Inco. Version:</label>
                    <input style={{ width: 60 }} />
                  </div>
                  <div className="field-row field-row-inline">
                    <label>Incoterms:</label>
                    <input style={{ width: 60 }} defaultValue={live ? 'FOB' : ''} />
                  </div>
                  <div className="field-row field-row-inline">
                    <label>Inco. Location1:</label>
                    <input style={{ width: 320 }} defaultValue={live ? 'Miami' : ''} />
                  </div>
                </div>
                <div>
                  <div className="field-row field-row-inline">
                    <label>Deliver.Plant:</label>
                    <input style={{ width: 60 }} />
                  </div>
                  <div className="field-row field-row-inline">
                    <label>Total Weight:</label>
                    <span className="sap-display-value" style={{ minWidth: 150, textAlign: 'right' }}>
                      {live ? totalWeight.toLocaleString('en-US') : '0.000'}
                    </span>
                    {live && <span>G</span>}
                  </div>
                  <div className="field-row field-row-inline">
                    <label>Volume:</label>
                    <span className="sap-display-value" style={{ minWidth: 150, textAlign: 'right' }}>
                      0.000
                    </span>
                  </div>
                  <div className="field-row field-row-inline">
                    <label>Pricing Date:</label>
                    <input type="date" defaultValue={today} style={{ width: 150 }} />
                  </div>
                </div>
              </div>

              <ItemsGrid
                variant="order"
                items={items}
                selectedLines={selectedLine !== null ? [selectedLine] : []}
                onToggleSelect={(line) => onSelectLine?.(selectedLine === line ? null : line)}
                onRowOpen={onRowOpen}
                onOpenConditions={onOpenConditions}
                onNoSelection={onNoSelection}
                readOnly
              />
            </>
          ) : (
            <p style={{ color: '#888' }}>Not used in this exercise.</p>
          )}
        </div>
      </div>

      <FooterActions>
        <Button design="Emphasized" onClick={onSave}>
          Save
        </Button>
        <Button design="Transparent" onClick={onCancel}>
          Cancel
        </Button>
      </FooterActions>
    </div>
  );
}
