// @ts-nocheck
export const getAccountType = (particular: string): string => {
  const map: Record<string, string> = {
    "ROU Gross Block": "ROU Gross Block",
    "ROU Gross Block - Prepaid Rent": "ROU Gross Block - Prepaid Rent",
    "Lease Liability": "Lease Liability",
    "ROU Accumulated Depreciation": "ROU Accumulated Depreciation",
    "ROU Accumulated Depreciation - Prepaid Rent": "ROU Accumulated Depreciation - Prepaid Rent",
    "(Gain) / Loss on Termination": "(Gain) / Loss on Termination",
    "(Gain) / Loss on Termination - Prepaid Rent": "(Gain) / Loss on Termination - Prepaid Rent",
    "Interest expense on lease liability": "Interest Expense on Lease Liability",
    "Rent Expense": "Rent Expense",
    "Depreciation expense on Right of use": "Depreciation Expense on Right of Use",
    "Security Deposit": "Security Deposit",
    "(Gain) / Loss on Modification": "(Gain) / Loss on Modification",
    "Unwinding of interest on security deposit": "Unwinding of Interest on Security Deposit",
  };
  return map[particular] || particular;
};

export const groupNaturesByMapping = (
  natures: (string | null | undefined)[],
  mappings: any[],
  entryLines: any[]
) => {
  const natureToGroupKey = new Map<string | null | undefined, string>();

  natures.forEach((nature) => {
    const groupKey = entryLines
      .map((line) => {
        let accType = getAccountType(line.particular);
        if (accType === "Lease Liability") {
          const activeMapping = mappings.find(
            (m) => (m.account_type === "Current Lease Liability" || m.account_type === "Non-Current Lease Liability") &&
                   (m.is_active === true || m.is_active === "true")
          );
          if (activeMapping) {
            accType = activeMapping.account_type;
          } else {
            accType = "Current Lease Liability";
          }
        }
        
        const m = mappings.find(
          (m) => m.asset_type === nature && m.account_type === accType
        );
        return `${m?.coc_code || ""}_${m?.gl_code || ""}`;
      })
      .join("|");
    natureToGroupKey.set(nature, groupKey);
  });

  const uniqueGroups = Array.from(new Set(natureToGroupKey.values()));

  return uniqueGroups.map((groupKey) => ({
    groupKey,
    natures: natures.filter((n) => natureToGroupKey.get(n) === groupKey),
  }));
};
