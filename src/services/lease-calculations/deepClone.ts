// @ts-nocheck
/**
 * Deep clone utility function to prevent reference issues
 * Handles Date objects, arrays, and nested objects properly
 * @param obj - The object to clone
 * @returns A deep clone of the object
 */
export const deepClone = (obj: any): any => {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item));
  }

  const clonedObj: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clonedObj[key] = deepClone(obj[key]);
    }
  }

  return clonedObj;
};
