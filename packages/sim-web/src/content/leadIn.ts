import type { AssignmentInstance } from '@sap-sim/shared';
import { CUSTOMERS, getMaterial } from '@sap-sim/engine';

export interface LeadIn {
  title: string;
  whereThisSits: string;
  whatThisIs: string[];
  whatToWatchFor: string[];
  whyItMattersLater: string;
}

function customerName(customerId: string): string {
  return CUSTOMERS.find((c) => c.id === customerId)?.name ?? customerId;
}

function materialLabel(materialId: string): string {
  return getMaterial(materialId).description;
}

/** The two assigned products, named by description — this is what makes the material search
 * dialogs unambiguous even though the underlying catalog has six colors across two models,
 * see docs/architecture-proposal.md §3c. */
export function assignedProductsSentence(instance: AssignmentInstance): string {
  const [first, second] = instance.resolvedParams.items;
  return `a ${materialLabel(first.materialId)} and a ${materialLabel(second.materialId)}`;
}

export function inquiryLeadIn(instance: AssignmentInstance): LeadIn {
  const customer = customerName(instance.resolvedParams.customerId);
  return {
    title: 'Before: Create Inquiry',
    whereThisSits:
      `Every sale that starts with a customer asking "what would this cost?" begins here, before ` +
      `any commitment exists on either side. You're about to play the role of an inside sales rep, ` +
      `fielding a price request from ${customer} — a prospective customer who hasn't bought from ` +
      `you yet and isn't obligated to.`,
    whatThisIs: [
      'An inquiry is SAP’s record of a *non-binding* request: nothing you enter is a commitment ' +
        '— no stock gets reserved, no invoice gets created.',
      'SAP still wants you to estimate Order Probability: how likely is it that this inquiry turns ' +
        'into a real order? Multiply the net value by that probability and you get the Expected ' +
        'Order Value — the number sales forecasting actually runs on.',
    ],
    whatToWatchFor: [
      `${customer} would like pricing on ${assignedProductsSentence(instance)}. You'll be given a ` +
        `Customer PO Number (${instance.custPoNumber}) — it was assigned by the customer's own ` +
        `purchasing system, not by SAP. Type it into Customer Reference; it's your handle for ` +
        `finding this request again later, not something our system generated.`,
      'Required fields are marked with an asterisk (*). SAP won’t stop you from trying to save ' +
        'past a missing one — you’ll just see exactly what you missed.',
      'Order Probability defaults to 30%. Raise it to the value your brief gives you — SAP never ' +
        'guesses your confidence for you.',
      'When you save, look at the bottom of the screen, not the middle — your new document ' +
        'number appears in the status bar, not a popup.',
    ],
    whyItMattersLater:
      'Everything you enter here — the customer, the materials, the quantities — is about to ' +
      'get copied, untouched, into the quotation.',
  };
}

export function quotationLeadIn(instance: AssignmentInstance): LeadIn {
  const deluxe = instance.resolvedParams.itemConditions[0];
  const header = instance.resolvedParams.headerConditions[0];
  return {
    title: 'Before: Create Quotation',
    whereThisSits:
      'Your customer looked at your inquiry response and said "okay, formalize that for us." ' +
      'You’re moving from gathering information to making a commitment — "non-binding" becomes ' +
      '"binding."',
    whatThisIs: [
      'A quotation is a legally binding offer. You’ll use Create with Reference to pull the ' +
        'inquiry forward instead of retyping it — standard SAP practice, not a shortcut unique to ' +
        'this exercise.',
      'Pricing happens through conditions, not by editing a price directly: K004 is an item-level ' +
        'discount (one specific product), RA00 is a header-level discount (the whole order) — ' +
        'genuinely different business levers, which is why SAP keeps them separate.',
    ],
    whatToWatchFor: [
      `Your sales manager has authorized a $${deluxe.amount} discount on each ` +
        `${materialLabel(deluxe.materialId)} (condition K004), and a ${header.amount}% discount on ` +
        'the whole order (condition RA00). Enter both exactly as given — the net value you end up ' +
        'with is what gets checked.',
      'Re-entering Customer Reference triggers a warning, then an info message — both need ' +
        'acknowledgment before you continue.',
      'The RA00 discount won’t apply until you explicitly Activate it.',
    ],
    whyItMattersLater:
      'The discounted price you land on here is the price that carries forward into the sales order.',
  };
}

export function orderLeadIn(instance: AssignmentInstance): LeadIn {
  return {
    title: 'Before: Create Sales Order',
    whereThisSits:
      'Your customer has accepted the quotation. This is where the deal stops being a sales ' +
      'conversation and starts being an operational commitment — the trigger that, in a real ' +
      'company, sets delivery and billing in motion.',
    whatThisIs: [
      'A sales order is your company’s formal acknowledgment that it will fulfill the request ' +
        'exactly as quoted — same materials, same quantities, same negotiated price.',
    ],
    whatToWatchFor: [
      `Create with Reference again, searching by the same Customer PO Number (${instance.custPoNumber}).`,
      'Almost everything is pre-filled, pricing included — you’re mainly confirming, not ' +
        're-entering.',
      'Watch the save confirmation for your new order number — you’ll need it for Document Flow.',
    ],
    whyItMattersLater:
      'Document Flow ties your three documents together in one view: one customer request, three ' +
      'linked documents, one dollar value, shaped by every discount decision you made along the way.',
  };
}
