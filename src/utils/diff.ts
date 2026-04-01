// IST offset in ms (UTC+5:30)
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Normalize a date-like value to an IST calendar date string (YYYY-MM-DD).
 * Handles plain date strings ("2026-04-01") and ISO datetime strings
 * ("2026-03-31T18:30:00.000Z") which represent the same IST date.
 */
const toISTDateString = (val: any): string | null => {
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getTime() + IST_OFFSET_MS).toISOString().split("T")[0];
  } catch {
    return null;
  }
};

const isDateLike = (val: any): boolean =>
  (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) ||
  val instanceof Date;

/**
 * Treat null / undefined / "" / [] all as "no value".
 */
const isNoValue = (val: any): boolean =>
  val === null ||
  val === undefined ||
  val === "" ||
  (Array.isArray(val) && val.length === 0);

/**
 * Strip _id keys and normalise dates for clean comparison / storage.
 */
const cleanForStorage = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;

  // Normalise date strings → IST YYYY-MM-DD
  if (typeof obj === "string" && isDateLike(obj)) {
    const d = toISTDateString(obj);
    return d !== null ? d : obj;
  }

  if (typeof obj !== "object") return obj;
  if (obj instanceof Date) {
    const d = toISTDateString(obj);
    return d !== null ? d : obj.toISOString();
  }

  if (Array.isArray(obj)) return obj.map(cleanForStorage);

  // Plain object — exclude _id
  const SKIP = new Set(["_id"]);
  const result: any = {};
  for (const key of Object.keys(obj).sort()) {
    if (SKIP.has(key)) continue;
    result[key] = cleanForStorage(obj[key]);
  }
  return result;
};

const isEquivalent = (a: any, b: any): boolean => {
  try {
    // Both "no value" → equal
    if (isNoValue(a) && isNoValue(b)) return true;
    if (isNoValue(a) !== isNoValue(b)) return false;

    // Direct equality
    if (a === b) return true;

    // Date comparison — normalise both to IST date string
    if (isDateLike(a) || isDateLike(b)) {
      const da = toISTDateString(a);
      const db = toISTDateString(b);
      if (da !== null && db !== null) return da === db;
    }

    if (typeof a !== typeof b) return false;

    if (typeof a === "object") {
      return (
        JSON.stringify(cleanForStorage(a)) ===
        JSON.stringify(cleanForStorage(b))
      );
    }

    return false;
  } catch {
    return false;
  }
};

/**
 * Compare two arrays of objects element-by-element.
 * Returns only the sub-fields that actually changed per element.
 * 
 * Example output for discountingRates where only rate changed:
 * [{ rate: { old: 10, new: 11 } }]
 * 
 * If dates also changed, they'd appear too:
 * [{ rate: { old: 10, new: 11 }, dateRange: { old: [...], new: [...] } }]
 */
const getArrayChanges = (
  oldArr: any[],
  newArr: any[]
): { hasChanges: boolean; old: any[]; new: any[] } => {
  const maxLen = Math.max(oldArr.length, newArr.length);
  const oldResult: any[] = [];
  const newResult: any[] = [];
  let hasChanges = false;

  for (let i = 0; i < maxLen; i++) {
    const oldItem = i < oldArr.length ? oldArr[i] : undefined;
    const newItem = i < newArr.length ? newArr[i] : undefined;

    // Element added
    if (oldItem === undefined && newItem !== undefined) {
      hasChanges = true;
      oldResult.push(null);
      newResult.push(cleanForStorage(newItem));
      continue;
    }

    // Element removed
    if (oldItem !== undefined && newItem === undefined) {
      hasChanges = true;
      oldResult.push(cleanForStorage(oldItem));
      newResult.push(null);
      continue;
    }

    // Both exist — compare sub-fields if both are objects
    if (
      typeof oldItem === "object" &&
      !Array.isArray(oldItem) &&
      typeof newItem === "object" &&
      !Array.isArray(newItem)
    ) {
      const oldClean = cleanForStorage(oldItem) || {};
      const newClean = cleanForStorage(newItem) || {};

      const subKeys = new Set([
        ...Object.keys(oldClean),
        ...Object.keys(newClean),
      ]);

      const oldDiff: any = {};
      const newDiff: any = {};
      let elementHasChanges = false;

      for (const key of subKeys) {
        if (!isEquivalent(oldClean[key], newClean[key])) {
          elementHasChanges = true;
          oldDiff[key] = oldClean[key] ?? null;
          newDiff[key] = newClean[key] ?? null;
        }
      }

      if (elementHasChanges) {
        hasChanges = true;
        oldResult.push(oldDiff);
        newResult.push(newDiff);
      }
      // If no changes in this element, skip it (don't push)
    } else {
      // Primitive array elements — direct compare
      if (!isEquivalent(oldItem, newItem)) {
        hasChanges = true;
        oldResult.push(cleanForStorage(oldItem));
        newResult.push(cleanForStorage(newItem));
      }
    }
  }

  return { hasChanges, old: oldResult, new: newResult };
};

// Top-level fields that are system/internal and should never be tracked
const EXCLUDED_FIELDS = new Set([
  "_id",
  "__v",
  "createdAt",
  "updatedAt",
  "userId",
  "originalLeaseId",
  "previousVersionId",
  "versionNumber",
  "period",
  "status",
  "selectedOptions",
]);

/**
 * Human-readable labels for field names.
 * camelCase → "Readable Label"
 */
const FIELD_LABELS: Record<string, string> = {
  // Top-level fields
  lessorName: "Lessor Name",
  natureOfLease: "Nature of Lease",
  scope: "Scope",
  leasePeriod: "Lease Period",
  lockingPeriod: "Locking Period",
  leaseWorkingPeriod: "Lease Working Period",
  rentPaymentType: "Rent Payment Type",
  rentPaymentFrequency: "Rent Payment Frequency",
  rentAmount: "Rent Amount",
  frequencyForInterestCalculation: "Frequency for Interest Calculation",
  transitionType: "Transition Type",
  transitionDiscountAdjustment: "Transition Discount Adjustment",
  rentPaymentDate: "Rent Payment Date",
  securityDeposit: "Security Deposit",
  leaseEqualizationPertaining: "Lease Equalization Pertaining",
  otherAdjustmentInRightOfUse: "Other Adjustment in Right of Use",
  discountingRates: "Discounting Rates",
  systematicEscalations: "Systematic Escalations",
  adhocEscalations: "Adhoc Escalations",
  rentFreePeriods: "Rent Free Periods",
  randomPayments: "Random Payments",
  rentAdhocWise: "Rent Adhoc Wise",
  cutOffDate: "Cut-Off Date",
  cutOffLeasePeriod: "Cut-Off Lease Period",
  agreementBeginningLeaseLiability: "Agreement Beginning Lease Liability",
  agreementBeginningROU: "Agreement Beginning ROU",
  interestExpenseBeginningTillCutOffDate: "Interest Expense Beginning Till Cut-Off Date",
  rentPaidBeginningTillCutOffDate: "Rent Paid Beginning Till Cut-Off Date",
  depreciationExpenseTillCutOffDate: "Depreciation Expense Till Cut-Off Date",
  modificationAdjustmentInROUWithProspective: "Modification Adjustment in ROU (Prospective)",
  leaseLiabilityCutOff: "Lease Liability Cut-Off",
  cutOffDateROU: "Cut-Off Date ROU",
  agreementBeginningDiscountedSecurityDeposit: "Agreement Beginning Discounted Security Deposit",
  agreementBeginningPrepaidRent: "Agreement Beginning Prepaid Rent",
  interestIncomeOnSDfromAgreementBeginningTillCutoffDate: "Interest Income on SD from Beginning Till Cut-Off Date",
  depreciationExpenseOnPRTillCutOffDate: "Depreciation Expense on PR Till Cut-Off Date",
  cutOffSecurityDeposit: "Cut-Off Security Deposit",
  cutOffDatePrepaidRent: "Cut-Off Date Prepaid Rent",
  leaseModificationDate: "Lease Modification Date",
  leaseClosureDate: "Lease Closure Date",
  dateOfSDClosure: "Date of SD Closure",
  leaseTerminationDate: "Lease Termination Date",
  remarks: "Remarks",
  otherLeaseInformations: "Other Lease Informations",
  // Sub-fields inside nested objects
  extensionOption: "Extension Option",
  purchaseOption: "Purchase Option",
  terminationOption: "Termination Option",
  dateRange: "Date Range",
  rate: "Rate",
  date: "Date",
  rent: "Rent",
  frequency: "Frequency",
  percentage: "Percentage",
  amount: "Amount",
};

/** Convert a field key to a human-readable label */
const toLabel = (key: string): string => {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  // Fallback: convert camelCase → "Title Case"
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
};

/** Make a value human-readable (booleans → Yes/No) */
const humanizeValue = (val: any): any => {
  if (val === true) return "Yes";
  if (val === false) return "No";
  return val;
};

/**
 * For nested plain objects (like otherLeaseInformations),
 * compare field-by-field and return only changed sub-fields
 * with human-readable keys and values.
 */
const getObjectChanges = (
  oldObj: any,
  newObj: any
): { hasChanges: boolean; old: any; new: any } => {
  const oldClean = cleanForStorage(oldObj) || {};
  const newClean = cleanForStorage(newObj) || {};

  const subKeys = new Set([
    ...Object.keys(oldClean),
    ...Object.keys(newClean),
  ]);

  const oldDiff: any = {};
  const newDiff: any = {};
  let hasChanges = false;

  for (const key of subKeys) {
    if (!isEquivalent(oldClean[key], newClean[key])) {
      hasChanges = true;
      const label = toLabel(key);
      oldDiff[label] = humanizeValue(oldClean[key] ?? null);
      newDiff[label] = humanizeValue(newClean[key] ?? null);
    }
  }

  return { hasChanges, old: oldDiff, new: newDiff };
};

export const getChanges = (
  oldObj: any,
  newObj: any
): Record<string, { old?: any; new?: any }> => {
  try {
    const changes: Record<string, { old?: any; new?: any }> = {};
    const oldData = oldObj || {};
    const newData = newObj || {};

    const allKeys = new Set([
      ...Object.keys(oldData),
      ...Object.keys(newData),
    ]);

    for (const key of allKeys) {
      if (EXCLUDED_FIELDS.has(key)) continue;

      const oldVal = oldData[key];
      const newVal = newData[key];

      if (isEquivalent(oldVal, newVal)) continue;

      const label = toLabel(key);

      // ----- Array of objects: granular per-element diff -----
      if (Array.isArray(oldVal) || Array.isArray(newVal)) {
        const oldArr = Array.isArray(oldVal) ? oldVal : [];
        const newArr = Array.isArray(newVal) ? newVal : [];

        // Check if elements are objects (not primitive arrays like leasePeriod: ["2019-04-01", "2028-09-30"])
        const hasObjectElements =
          oldArr.some((el) => typeof el === "object" && el !== null && !Array.isArray(el)) ||
          newArr.some((el) => typeof el === "object" && el !== null && !Array.isArray(el));

        if (hasObjectElements) {
          const result = getArrayChanges(oldArr, newArr);
          if (result.hasChanges) {
            changes[label] = { old: result.old, new: result.new };
          }
        } else {
          // Primitive arrays (e.g., leasePeriod, lockingPeriod) — store cleaned values
          const entry: { old?: any; new?: any } = {};
          if (!isNoValue(oldVal)) entry.old = cleanForStorage(oldVal);
          if (!isNoValue(newVal)) entry.new = cleanForStorage(newVal);
          if (Object.keys(entry).length > 0) {
            changes[label] = entry;
          }
        }
        continue;
      }

      // ----- Nested plain objects (e.g., otherLeaseInformations): granular sub-field diff -----
      if (
        typeof oldVal === "object" && oldVal !== null && !Array.isArray(oldVal) && !(oldVal instanceof Date) &&
        typeof newVal === "object" && newVal !== null && !Array.isArray(newVal) && !(newVal instanceof Date)
      ) {
        const result = getObjectChanges(oldVal, newVal);
        if (result.hasChanges) {
          changes[label] = { old: result.old, new: result.new };
        }
        continue;
      }

      // ----- Scalar fields -----
      const entry: { old?: any; new?: any } = {};
      if (!isNoValue(oldVal)) entry.old = humanizeValue(cleanForStorage(oldVal));
      if (!isNoValue(newVal)) entry.new = humanizeValue(cleanForStorage(newVal));

      // Only record if at least one side has a meaningful value
      if (Object.keys(entry).length > 0) {
        changes[label] = entry;
      }
    }

    return changes;
  } catch (err) {
    // Never throw — a diff failure must not block the user's save operation
    console.error("getChanges error (non-blocking):", err);
    return {};
  }
};
