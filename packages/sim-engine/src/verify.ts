import type {
  ActivityVerification,
  DocType,
  SalesDocument,
  VerificationItem,
  VerifyActivity,
} from '@cap/sim-shared';

const LABEL: Record<DocType, string> = {
  inquiry: 'inquiry',
  quotation: 'quotation',
  order: 'sales order',
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const NET_TOLERANCE = 0.005;

/**
 * Checks one learner's activity. For each required document type:
 *   - a complete document of that type must exist in the learner's scope (drafts do not count),
 *   - its net value must equal the expected value for that learner, and
 *   - where the definition says so, it must have been created with reference to the earlier document.
 *
 * If a learner has saved several complete documents of a type, the type passes when any one of them
 * passes, so correcting a mistake by saving a new document works.
 *
 * Messages say what to look at and never contain a net value. Callers decide pass or fail from `passed`,
 * not from `allPresent`.
 */
export const verifyActivity: VerifyActivity = async (store, scope, activity) => {
  const instance = await store.getInstance(scope);
  const items: VerificationItem[] = [];
  const foundDocs: string[] = [];
  const missingTypes: DocType[] = [];

  const missing = (docType: DocType): VerificationItem => {
    missingTypes.push(docType);
    return {
      key: docType,
      status: 'missing',
      studentMessage:
        `You have not saved a ${LABEL[docType]} yet. Save it in the corresponding transaction ` +
        `(a document that is still in progress does not count).`,
    };
  };

  for (const { docType, mustReference } of activity.requiredDocuments) {
    if (!instance) {
      items.push(missing(docType));
      continue;
    }
    const complete = (await store.listDocuments(scope, { docType })).filter((d) => d.status === 'complete');
    if (complete.length === 0) {
      items.push(missing(docType));
      continue;
    }

    const expected = instance.expectedNetValue[docType];
    const netOk = (d: SalesDocument) => Math.abs(d.netValue - expected) < NET_TOLERANCE;
    const refOk = async (d: SalesDocument): Promise<boolean> => {
      if (!mustReference) return true;
      if (!d.predecessorId) return false;
      const predecessor = await store.getDocument(scope, d.predecessorId);
      return predecessor?.docType === mustReference;
    };

    let passing: SalesDocument | undefined;
    let netMatchedWithoutReference = false;
    for (const doc of complete) {
      if (!netOk(doc)) continue;
      if (await refOk(doc)) {
        passing = doc;
        break;
      }
      netMatchedWithoutReference = true;
    }

    if (passing) {
      foundDocs.push(passing.id);
      items.push({ key: docType, status: 'ok', studentMessage: `${capitalize(LABEL[docType])} verified.` });
      continue;
    }

    foundDocs.push(complete[0].id);
    items.push({
      key: docType,
      status: 'mismatch',
      studentMessage:
        netMatchedWithoutReference && mustReference
          ? `Your ${LABEL[docType]} was not created with reference to your ${LABEL[mustReference]}. ` +
            `Use Create with Reference so the data carries forward.`
          : `The net value of your ${LABEL[docType]} does not match what we expected. ` +
            `Recheck the discounts and the quantities.`,
    });
  }

  const result: ActivityVerification = {
    passed: items.length > 0 && items.every((i) => i.status === 'ok'),
    allPresent: missingTypes.length === 0,
    foundDocs,
    missingTypes,
    items,
  };
  return result;
};
