// @ts-nocheck

export const generateInformationDisclosure = (
  allLeaseSummaries: any[],
  oiMappings: any[] = []
) => {
  if (!allLeaseSummaries || allLeaseSummaries.length === 0) {
    return {
      contractualData: [],
      optionsData: [],
      averagePeriodData: [],
      averageRemainingPeriodData: [],
      interestRateData: [],
    };
  }

  const getOiCode = (category: string, particular: string, assetType: string) => {
    const mapping = oiMappings.find(
      (m: any) =>
        m.category === category &&
        m.particular === particular &&
        m.asset_type === assetType
    );
    const code = mapping?.oi_code?.trim();
    return code && code !== "-" ? code : "";
  };

  const groupNaturesByOI = (
    category: string,
    particular: string,
    naturesToGroup: string[]
  ) => {
    const groupMap = new Map<string, string[]>();
    naturesToGroup.forEach((nature) => {
      const code = getOiCode(category, particular, nature);
      if (!code) return; // OI code is mandatory to display row
      if (!groupMap.has(code)) {
        groupMap.set(code, []);
      }
      groupMap.get(code)!.push(nature);
    });
    return Array.from(groupMap.entries()).map(([oiCode, groupNatures]) => ({
      oiCode,
      natures: groupNatures,
    }));
  };

  const natures = [
    ...new Set(allLeaseSummaries.map((item) => item.LeaseInfo?.natureOfLease)),
  ].filter(Boolean);

  // 1. Contractual Maturities Data
  const contractualData: any[] = [];
  const matCategories = [
    { label: "Rent paid within 1 year from reporting date", key: "within1Year" },
    { label: "Rent paid between 1 - 2 year from reporting date", key: "year2" },
    { label: "Rent paid between 2 - 3 year from reporting date", key: "year3" },
    { label: "Rent paid between 3 - 4 year from reporting date", key: "year4" },
    { label: "Rent paid between 4 - 5 year from reporting date", key: "year5" },
    { label: "Rent paid after 5 years from reporting date", key: "after5Years" },
  ];

  matCategories.forEach((cat) => {
    const groups = groupNaturesByOI("Contractual Maturities", cat.label, natures);
    if (groups.length > 0) {
      contractualData.push({
        key: cat.key,
        particulars: cat.label,
        isHeader: true,
      });

      groups.forEach((group, gIdx) => {
        const amount = allLeaseSummaries
          .filter((item) => group.natures.includes(item.LeaseInfo?.natureOfLease))
          .reduce(
            (sum, item) => sum + (Number(item.ContractualMaturities?.[cat.key]) || 0),
            0
          );

        contractualData.push({
          key: `${cat.key}-${gIdx}`,
          particulars: ` - ${group.natures.join(", ")}`,
          oiCode: group.oiCode,
          amount: Math.round(amount).toLocaleString("en-IN"),
          rawAmount: Math.round(amount),
          isHeader: false,
        });
      });
    }
  });

  // 2. Lease Options Data
  const optionsData: any[] = [];
  const optCategories = [
    { label: "Extension Option", key: "extensionOption" },
    { label: "Termination Option", key: "terminationOption" },
    { label: "Purchase Option", key: "purchaseOption" },
  ];

  optCategories.forEach((cat) => {
    const groups = groupNaturesByOI("Lease Options", cat.label, natures);
    if (groups.length > 0) {
      optionsData.push({
        key: cat.key,
        particulars: cat.label,
        isHeader: true,
      });

      groups.forEach((group, gIdx) => {
        const count = allLeaseSummaries.filter(
          (item) =>
            group.natures.includes(item.LeaseInfo?.natureOfLease) &&
            item.otherLeaseInformations?.[cat.key] === true
        ).length;

        optionsData.push({
          key: `${cat.key}-${gIdx}`,
          particulars: ` - ${group.natures.join(", ")}`,
          oiCode: group.oiCode,
          count: count,
          isHeader: false,
        });
      });
    }
  });

  // 3. Average Lease Period Data
  const avgGroups = groupNaturesByOI(
    "Average Lease Period",
    "Average Lease Period",
    natures
  );
  const averagePeriodData = avgGroups.map((group, gIdx) => {
    const groupLeases = allLeaseSummaries.filter(
      (item) =>
        group.natures.includes(item.LeaseInfo?.natureOfLease) &&
        (Number(item.others?.remainingLeasePeriodYears) || 0) > 0
    );
    const totalPeriod = groupLeases.reduce(
      (sum, item) => sum + (Number(item.others?.leasePeriodYears) || 0),
      0
    );
    const avg =
      groupLeases.length > 0 ? (totalPeriod / groupLeases.length).toFixed(2) : "0.00";

    return {
      key: `avg-${gIdx}`,
      nature: group.natures.join(", "),
      oiCode: group.oiCode,
      avgPeriod: avg,
    };
  });

  // 3b. Average Remaining Lease Period Data
  const avgRemainingGroups = groupNaturesByOI(
    "Average remaining lease period",
    "Average remaining lease period",
    natures
  );
  const averageRemainingPeriodData = avgRemainingGroups.map((group, gIdx) => {
    const groupLeases = allLeaseSummaries.filter(
      (item) =>
        group.natures.includes(item.LeaseInfo?.natureOfLease) &&
        (Number(item.others?.remainingLeasePeriodYears) || 0) > 0
    );
    const totalRemainingPeriod = groupLeases.reduce(
      (sum, item) => sum + (Number(item.others?.remainingLeasePeriodYears) || 0),
      0
    );
    const avg =
      groupLeases.length > 0
        ? (totalRemainingPeriod / groupLeases.length).toFixed(2)
        : "0.00";

    return {
      key: `avg-rem-${gIdx}`,
      nature: group.natures.join(", "),
      oiCode: group.oiCode,
      avgRemainingPeriod: avg,
    };
  });

  // 4. Effective Interest Rate Data
  const intGroups = groupNaturesByOI(
    "Effective interest rate for lease liabilities",
    "Effective interest rate",
    natures
  );
  const interestRateData = intGroups.map((group, gIdx) => {
    const groupLeases = allLeaseSummaries.filter(
      (item) =>
        group.natures.includes(item.LeaseInfo?.natureOfLease) &&
        (Number(item.others?.remainingLeasePeriodYears) || 0) > 0
    );
    const rates = groupLeases
      .map((item) => Number(item.others?.effectiveInterestRate))
      .filter((r) => !isNaN(r));
    const range =
      rates.length > 0
        ? `${Math.min(...rates).toFixed(2)} - ${Math.max(...rates).toFixed(2)}`
        : "-";

    return {
      key: `int-${gIdx}`,
      nature: group.natures.join(", "),
      oiCode: group.oiCode,
      range,
    };
  });

  return {
    contractualData,
    optionsData,
    averagePeriodData,
    averageRemainingPeriodData,
    interestRateData,
  };
};
