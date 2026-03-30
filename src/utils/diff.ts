const isEquivalent = (a: any, b: any): boolean => {
  // 1. Direct equality
  if (a === b) return true;

  // 2. Handle null/undefined normalization
  const isEmptyA = a === null || a === undefined || (Array.isArray(a) && a.length === 0);
  const isEmptyB = b === null || b === undefined || (Array.isArray(b) && b.length === 0);
  if (isEmptyA && isEmptyB) return true;
  if (isEmptyA !== isEmptyB) return false;

  // 3. Date comparison (handle cross-type Date vs ISO string)
  const isDateA = a instanceof Date || (typeof a === "string" && /^\d{4}-\d{2}-\d{2}/.test(a));
  const isDateB = b instanceof Date || (typeof b === "string" && /^\d{4}-\d{2}-\d{2}/.test(b));
  
  if (isDateA && isDateB) {
    try {
      return new Date(a).getTime() === new Date(b).getTime();
    } catch (e) {
      // If parsing fails for one, they might not be dates, fallback to other checks
    }
  }

  // 4. Type mismatch check
  if (typeof a !== typeof b) return false;

  // 5. Deep comparison for arrays/objects (ignoring key order)
  if (typeof a === "object") {
    try {
      const stringifySorted = (obj: any): any => {
        if (!obj || typeof obj !== "object") return obj;
        if (Array.isArray(obj)) return obj.map(stringifySorted);
        
        // Sort keys to handle different property orders
        const sortedKeys = Object.keys(obj).sort();
        const result: any = {};
        for (const key of sortedKeys) {
          result[key] = stringifySorted(obj[key]);
        }
        return result;
      };

      const sortedA = stringifySorted(a);
      const sortedB = stringifySorted(b);

      return JSON.stringify(sortedA) === JSON.stringify(sortedB);
    } catch (e) {
      return false;
    }
  }

  return false;
};

export const getChanges = (oldObj: any, newObj: any): Record<string, { old: any; new: any }> => {
  const changes: Record<string, { old: any; new: any }> = {};
  const oldData = oldObj || {};
  const newData = newObj || {};

  // Hidden/System fields to never track in logs
  const EXCLUDED_FIELDS = [
    "_id", "__v", "createdAt", "updatedAt", "userId", 
    "originalLeaseId", "previousVersionId", "versionNumber", "status",
    "otherLeaseInformations", "selectedOptions" // These are usually modified but might be noise if user didn't change them
  ];

  // Get all unique keys from both objects
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

  for (const key of allKeys) {
    if (EXCLUDED_FIELDS.includes(key)) continue;

    const oldVal = oldData[key];
    const newVal = newData[key];

    if (!isEquivalent(oldVal, newVal)) {
      // If one is empty array and other is undefined/null, skip
      if (Array.isArray(newVal) && newVal.length === 0 && (oldVal === null || oldVal === undefined)) continue;
      if (Array.isArray(oldVal) && oldVal.length === 0 && (newVal === null || newVal === undefined)) continue;

      changes[key] = {
        old: oldVal,
        new: newVal,
      };
    }
  }

  return changes;
};
