import type { TransactionConfig } from '@sap-sim/shared';

// Data-driven transaction config — docs/architecture-proposal.md §5.
// Each step's `instructions` is Parand's step-by-step text (§10b); `fields[].required` drives
// the asterisk + validation quirk. The actual item/pricing widgets are hand-built components in
// the web app (not generically rendered from FieldConfig) — see the README note in apps/web.

export const VA11_CONFIG: TransactionConfig = {
  id: 'VA11',
  docType: 'inquiry',
  title: 'Create Inquiry',
  postSaveBehavior: 'blank-tab',
  steps: [
    {
      id: 'customer',
      title: 'Find Your Customer',
      instructions:
        'Search for the customer named in your assignment brief using the Sold-To Party search. ' +
        'Real sales reps search for customers by name every day — you will too.',
      fields: [{ name: 'soldToParty', label: 'Sold-To Party', required: true }],
    },
    {
      id: 'reference',
      title: 'Reference & Validity',
      instructions:
        'Enter the Customer PO Number from your assignment brief into Customer Reference — this is ' +
        'the customer’s own purchase-order number, not anything our system generated. Set the ' +
        'reference date to today, the valid-from date to today, and the valid-to date to one month ' +
        'from today.',
      fields: [
        { name: 'custReference', label: 'Cust. Reference', required: true },
        { name: 'custReferenceDate', label: 'Customer Ref. Date', required: true },
        { name: 'validFrom', label: 'Valid From', required: true },
        { name: 'validTo', label: 'Valid To', required: true },
      ],
    },
    {
      id: 'materials',
      title: 'Add Materials',
      instructions:
        'Your assignment brief names two products by description, color included. Search for each ' +
        'one by name and enter the requested quantity.',
      fields: [{ name: 'items', label: 'Materials', required: true }],
    },
    {
      id: 'probability',
      title: 'Order Probability',
      instructions:
        'Each item defaults to a 30% order probability. Raise it to the value your assignment brief ' +
        'gives you — SAP never guesses your confidence, you have to tell it.',
      fields: [{ name: 'orderProbability', label: 'Order Probability', required: true }],
    },
    {
      id: 'review',
      title: 'Review & Save',
      instructions:
        'Check the net value and expected order value, then Save. Watch the status bar at the ' +
        'bottom of the screen — that is where your new inquiry number will appear.',
      fields: [],
    },
  ],
};

export const VA21_CONFIG: TransactionConfig = {
  id: 'VA21',
  docType: 'quotation',
  title: 'Create Quotation',
  postSaveBehavior: 'blank-tab',
  createWithReference: { predecessorDocType: 'inquiry', searchBy: 'custReference' },
  steps: [
    {
      id: 'create-with-reference',
      title: 'Create with Reference',
      instructions:
        'Search for your inquiry by Customer PO Number, select it, and Copy. This pulls the ' +
        'customer and materials forward so you never retype them.',
      fields: [],
    },
    {
      id: 'reference',
      title: 'Reference & Validity',
      instructions:
        'Re-enter the same Customer PO Number — SAP does not carry Customer Reference forward ' +
        'automatically the way it carries the customer and materials. Set the reference date to ' +
        'today, the valid-to date to one month from today, and the requested delivery date to one ' +
        'month from today.',
      fields: [
        { name: 'custReference', label: 'Cust. Reference', required: true },
        { name: 'custReferenceDate', label: 'Cust. Ref. Date', required: true },
        { name: 'validTo', label: 'Valid To', required: true },
        { name: 'requestedDeliveryDate', label: 'Req. Deliv. Date', required: true },
      ],
      warningsOnAdvance: [
        {
          id: 'quotation-date-warning',
          message: 'Please check the dates you entered and confirm they are correct.',
          kind: 'warning',
          dismissAction: 'enter',
        },
        {
          id: 'quotation-copied-info',
          message: 'Data was copied from the referenced inquiry.',
          kind: 'info',
          dismissAction: 'checkmark',
        },
      ],
    },
    {
      id: 'item-pricing',
      title: 'Item Pricing (K004)',
      instructions:
        'Your assignment brief authorizes a specific per-unit discount on the Deluxe Touring Bike. ' +
        'Select that item, open Item Conditions, and enter condition type K004 with that amount.',
      fields: [{ name: 'itemConditions', label: 'Item Conditions', required: true }],
    },
    {
      id: 'header-pricing',
      title: 'Header Pricing (RA00)',
      instructions:
        'Your assignment brief also authorizes a percentage discount on the whole order. Go to ' +
        'header conditions, enter condition type RA00 with that percentage, then Activate it — ' +
        'it will not apply until you do.',
      fields: [{ name: 'headerConditions', label: 'Header Conditions', required: true }],
    },
    {
      id: 'review',
      title: 'Review & Save',
      instructions:
        'Check the discounted net value, then Save. Your new quotation number will appear in the ' +
        'status bar at the bottom of the screen.',
      fields: [],
    },
  ],
};

export const VA01_CONFIG: TransactionConfig = {
  id: 'VA01',
  docType: 'order',
  title: 'Create Sales Order',
  postSaveBehavior: 'none',
  createWithReference: { predecessorDocType: 'quotation', searchBy: 'custReference' },
  steps: [
    {
      id: 'create-with-reference',
      title: 'Create with Reference',
      instructions:
        'Search for your quotation by the same Customer PO Number you have been using, select it, ' +
        'and Copy.',
      fields: [],
    },
    {
      id: 'reference',
      title: 'Confirm Reference',
      instructions:
        'Re-enter the Customer PO Number and today’s date for Cust. Ref. Date. The requested ' +
        'delivery date is copied from the quotation.',
      fields: [
        { name: 'custReference', label: 'Cust. Reference', required: true },
        { name: 'custReferenceDate', label: 'Cust. Ref. Date', required: true },
      ],
    },
    {
      id: 'review',
      title: 'Review & Save',
      instructions:
        'Almost everything here is copied from your quotation, pricing included — you are mainly ' +
        'confirming, not re-entering. Save, then note your order number from the confirmation at ' +
        'the bottom-left.',
      fields: [],
    },
  ],
};

export const TRANSACTION_CONFIGS = {
  VA11: VA11_CONFIG,
  VA21: VA21_CONFIG,
  VA01: VA01_CONFIG,
} as const;
