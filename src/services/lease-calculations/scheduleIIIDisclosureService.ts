// @ts-nocheck
import { groupNaturesByMapping, getAccountType } from "./groupLeaseMapping";

export const generateScheduleIIIDisclosure = (
  allLeaseSummaries: any[],
  mappings: any[] = [],
  disclosureSettings: any[] = []
) => {
  if (!allLeaseSummaries || allLeaseSummaries.length === 0) {
    return { entries: [] };
  }

  const assetTypesInData = [
    ...new Set(allLeaseSummaries.map((item) => item.LeaseInfo?.natureOfLease)),
  ].filter(Boolean);

  const entries: any[] = [
    {
      entryNo: "Entry 1",
      narration: "Addition in Gross Block of ROU and Lease Liability during the period",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "Addition in ROU and Lease Liability",
      color: "#00adef",
      lines: [
        { particular: "ROU Gross Block", key: "ROUGrossBlockMovement.addition", sign: "Same", column: "Addition" },
        { particular: "ROU Gross Block - Prepaid Rent", key: "PrepaidRentMovement.addition", sign: "Same", column: "Addition" },
        { particular: "Lease Liability", key: "leaseLiability.addition", sign: "Opposite", column: "Addition" },
        { particular: "Security Deposit", key: "PrepaidRentMovement.addition", sign: "Opposite", column: "" },
      ],
    },
    {
      entryNo: "Entry 2",
      narration: "(Gain) / Loss on terminaltion of lease during the period",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "(Gain) / Loss on terminaltion",
      color: "#92d050",
      lines: [
        { particular: "Lease Liability", key: "leaseLiability.termination", sign: "Opposite", column: "Termination" },
        { particular: "ROU Gross Block", key: "ROUGrossBlockMovement.disposal", sign: "Same", column: "Disposal" },
        { particular: "ROU Gross Block - Prepaid Rent", key: "PrepaidRentMovement.disposal", sign: "Same", column: "Disposal" },
        { particular: "ROU Accumulated Depreciation", key: "ROUAccumlatedDepreciationMovement.disposalAccumulatedDepreciation", sign: "Opposite", column: "Disposal Accumulated Depreciation" },
        { particular: "ROU Accumulated Depreciation - Prepaid Rent", key: "PrepaidRentMovement.disposalAccumulatedDepreciation", sign: "Opposite", column: "Disposal Accumulated Depreciation" },
        { particular: "(Gain) / Loss on Termination", key: "profitLoss.ProfitLossonTermination", sign: "Same", column: "" },
        { particular: "(Gain) / Loss on Termination - Prepaid Rent", key: "profitLoss.ProfitLossOnTerminationPrepaidRent", sign: "Same", column: "" },
      ],
    },
    {
      entryNo: "Entry 3",
      narration: "Interest and rent expense on lease liability during the period",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "Interest & rent expenses on lease liability",
      color: "#0070c0",
      lines: [
        { particular: "Interest expense on lease liability", key: "leaseLiability.interest", sign: "Same", column: "Interest on Lease Liability for the period" },
        { particular: "Rent Expense", key: "leaseLiability.rentPaid", sign: "Same", column: "Rent Paid for the period" },
        { particular: "Lease Liability", key: "leaseLiability.interest", sign: "Opposite", column: "" },
        { particular: "Lease Liability", key: "leaseLiability.rentPaid", sign: "Opposite", column: "" },
      ],
    },
    {
      entryNo: "Entry 4",
      narration: "Depreciation expense on ROU during the period",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "Depreciation expense on ROU",
      color: "#ffff00",
      lines: [
        { particular: "Depreciation expense on Right of use", key: "ROUAccumlatedDepreciationMovement.depreciationForPeriod", sign: "Same", column: "Depreciation of the period" },
        { particular: "Depreciation expense on prepaid portion of security deposit", key: "PrepaidRentMovement.depreciationForPeriod", sign: "Same", column: "Depreciation of the period" },
        { particular: "ROU Accumulated Depreciation", key: "ROUAccumlatedDepreciationMovement.depreciationForPeriod", sign: "Opposite", column: "" },
        { particular: "ROU Accumulated Depreciation - Prepaid Rent", key: "PrepaidRentMovement.depreciationForPeriod", sign: "Opposite", column: "" },
      ],
    },
    {
      entryNo: "Entry 5",
      narration: "(Gain) / Loss on modification of lease during the period",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "(Gain) / Loss on modification",
      color: "#ffc000",
      lines: [
        { particular: "Lease Liability", key: "leaseLiability.modification", sign: "Opposite", column: "Modification" },
        { particular: "ROU Gross Block", key: "ROUGrossBlockMovement.modification", sign: "Same", column: "Modification" },
        { particular: "(Gain) / Loss on Modification", key: "profitLoss.ProfitLossonModification", sign: "Opposite", column: "Gain / (Loss) on Modification" },
      ],
    },
    {
      entryNo: "Entry 6",
      narration: "Unwinding of interest on security deposit",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "Unwinding interest on security deposit",
      color: "#cfe2f3",
      lines: [
        { particular: "Security Deposit", key: "securityDeposit.UnwindingInterestOnSD", sign: "Same", column: "" },
        { particular: "Unwinding of interest on security deposit", key: "securityDeposit.UnwindingInterestOnSD", sign: "Opposite", column: "Unwinding of Interest for the period" },
      ],
    },
    {
      entryNo: "Entry 8",
      narration: "Inter - Unit received / transferred during the period",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "Inter - Unit received / transferred",
      color: "#e6f7ff",
      lines: [
        { particular: "Lease Liability", key: "leaseLiability.iuTransferred", sign: "Opposite", column: "" },
        { particular: "ROU Gross Block", key: "ROUGrossBlockMovement.iuTransferred", sign: "Same", column: "" },
        { particular: "ROU Accumulated Depreciation", key: "ROUAccumlatedDepreciationMovement.iuTransferred", sign: "Opposite", column: "" },
        { particular: "ROU Gross Block - Prepaid Rent", key: "PrepaidRentMovement.iuTransferred", sign: "Same", column: "" },
        { particular: "ROU Accumulated Depreciation - Prepaid Rent", key: "PrepaidRentMovement.iuTransferredAD", sign: "Opposite", column: "" },
        { particular: "Security Deposit", key: "securityDeposit.securityDepositTransfer", sign: "Same", column: "" },
        { particular: "Inter Unit receivable / (Payable)", key: "special.iuBalancingFigure", sign: "Same", column: "" },
      ],
    },
  ];

  const activeCurrent = mappings.find(
    (m: any) =>
      m.account_type === "Current Lease Liability" &&
      (m.is_active === true || m.is_active === "true")
  );
  const activeNonCurrent = mappings.find(
    (m: any) =>
      m.account_type === "Non-Current Lease Liability" &&
      (m.is_active === true || m.is_active === "true")
  );

  if (activeNonCurrent && !activeCurrent) {
    entries.push({
      entryNo: "Entry 7",
      narration: "Current - Non Current of Lease Liability as at period end",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "Current - Non Current of Lease Liability",
      color: "#d9d9d9",
      lines: [
        { particular: "Current Lease Liability", key: "reclass.liability", sign: "Opposite", column: "Current - Non Current of Lease Liability" },
        { particular: "Non-Current Lease Liability", key: "reclass.liability", sign: "Same", column: "" },
      ],
    });
  } else if (activeCurrent && !activeNonCurrent) {
    entries.push({
      entryNo: "Entry 7",
      narration: "Current - Non Current of Lease Liability as at period end",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "Current - Non Current of Lease Liability",
      color: "#d9d9d9",
      lines: [
        { particular: "Current Lease Liability", key: "reclass.liability", sign: "Same", column: "Current - Non Current of Lease Liability" },
        { particular: "Non-Current Lease Liability", key: "reclass.liability", sign: "Opposite", column: "" },
      ],
    });
  }

  entries.sort((a, b) => {
    const numA = parseInt(a.entryNo.replace("Entry ", ""));
    const numB = parseInt(b.entryNo.replace("Entry ", ""));
    return numA - numB;
  });

  const result: any[] = [];

  entries.forEach((entry) => {
    const entrySetting: any = disclosureSettings.find(
      (s: any) => s.entryNo === entry.entryNo
    );

    const natureGroups = groupNaturesByMapping(
      assetTypesInData,
      mappings,
      entry.lines
    );

    natureGroups.forEach((group) => {
      entry.lines.forEach((line: any) => {
        let accTypeForMapping = getAccountType(line.particular);

        if (
          line.particular === "Current Lease Liability" &&
          entry.entryNo === "Entry 7"
        ) {
          accTypeForMapping = "Current Lease Liability";
        } else if (
          line.particular === "Non-Current Lease Liability" &&
          entry.entryNo === "Entry 7"
        ) {
          accTypeForMapping = "Non-Current Lease Liability";
        } else if (accTypeForMapping === "Lease Liability") {
          const activeMapping = mappings.find(
            (m: any) =>
              (m.account_type === "Current Lease Liability" ||
                m.account_type === "Non-Current Lease Liability") &&
              (m.is_active === true || m.is_active === "true")
          );
          accTypeForMapping =
            activeMapping?.account_type || "Current Lease Liability";
        }

        const mapping = mappings.find(
          (m) =>
            group.natures.includes(m.asset_type) &&
            m.account_type === accTypeForMapping
        );

        let rawAmt = 0;
        const groupData = allLeaseSummaries.filter((item) =>
          group.natures.includes(item.LeaseInfo?.natureOfLease)
        );

        if (line.particular?.trim() === "(Gain) / Loss on Termination") {
          rawAmt = groupData.reduce((sum, item) => {
            const ll = Number(item.leaseLiability?.termination) || 0;
            const rou = Number(item.ROUGrossBlockMovement?.disposal) || 0;
            const accDep =
              Number(
                item.ROUAccumlatedDepreciationMovement
                  ?.disposalAccumulatedDepreciation
              ) || 0;
            if (item.LeaseInfo?.iuStatus === "IU Transferred") return sum;
            return sum + (ll - rou + accDep);
          }, 0);
        } else if (line.particular === "(Gain) / Loss on Modification") {
          rawAmt = groupData.reduce((sum, item) => {
            const ll = Number(item.leaseLiability?.modification) || 0;
            const rou = Number(item.ROUGrossBlockMovement?.modification) || 0;
            return sum + (rou - ll);
          }, 0);
        } else if (
          line.particular?.trim() ===
          "(Gain) / Loss on Termination - Prepaid Rent"
        ) {
          rawAmt = groupData.reduce((sum, item) => {
            const rou = Number(item.PrepaidRentMovement?.disposal) || 0;
            const accDep =
              Number(
                item.PrepaidRentMovement?.disposalAccumulatedDepreciation
              ) || 0;
            if (item.LeaseInfo?.iuStatus === "IU Transferred") return sum;
            return sum + (accDep - rou);
          }, 0);
        } else {
          rawAmt = groupData.reduce((sum, item) => {
            const isStandardEntry = ["Entry 1", "Entry 2", "Entry 7"].includes(entry.entryNo);
            if (isStandardEntry && item.LeaseInfo?.iuStatus === "IU Transferred") {
              return sum;
            }

            if (line.key === "reclass.liability") {
              let val = 0;
              if (activeNonCurrent && !activeCurrent) {
                val = Number(item.leaseLiability?.current) || 0;
              } else if (activeCurrent && !activeNonCurrent) {
                val = Number(item.leaseLiability?.nonCurrent) || 0;
              }
              return sum + val;
            }

            if (line.key === "special.iuBalancingFigure") {
              const leaseLiability = Number(item.leaseLiability?.iuTransferred) || 0;
              const rouGross = Number(item.ROUGrossBlockMovement?.iuTransferred) || 0;
              const rouAccDep = Number(item.ROUAccumlatedDepreciationMovement?.iuTransferred) || 0;
              const prepaidRent = Number(item.PrepaidRentMovement?.iuTransferred) || 0;
              const prepaidRentAD = Number(item.PrepaidRentMovement?.iuTransferredAD) || 0;
              const securityDeposit = Number(item.securityDeposit?.securityDepositTransfer) || 0;

              const sumOfOthers =
                -leaseLiability +
                rouGross +
                -rouAccDep +
                prepaidRent +
                -prepaidRentAD +
                securityDeposit;

              const balancingFigure = -sumOfOthers;
              return sum + balancingFigure;
            }

            const keys = line.key.split(".");
            let val = item;
            for (const k of keys) val = val?.[k];
            return sum + (Number(val) || 0);
          }, 0);
        }

        const finalAmount = (line.sign === "Opposite" ? -1 : 1) * rawAmt;

        const cocCode = mapping?.coc_code?.trim() || "";
        const cocName = mapping?.coc_name?.trim() || "";
        let cocDisplay = "";
        if (cocName && cocCode) {
          cocDisplay = `${cocName} / ${cocCode}`;
        } else if (cocName || cocCode) {
          cocDisplay = cocName || cocCode;
        }

        const glCode = mapping?.gl_code?.trim() || "";
        const glName = mapping?.gl_name?.trim() || "";
        let glDisplay = "";
        if (glName && glCode) {
          glDisplay = `${glName} / ${glCode}`;
        } else if (glName || glCode) {
          glDisplay = glName || glCode;
        }

        result.push({
          entryNo: entry.entryNo,
          narration: entrySetting?.narration || entry.narration,
          particular:
            line.particular === "Lease Liability"
              ? accTypeForMapping
              : line.particular,
          coc: cocDisplay,
          gl: glDisplay,
          cocCode: cocCode,
          glCode: glCode,
          amount: finalAmount,
          color: entry.color || "transparent",
          adjustmentType: entrySetting?.adjustment_type || entry.adjustmentType || "",
          tag: entrySetting?.tag || entry.tag || "",
          entryType: entrySetting?.entry_type || entry.entryType || "",
        });
      });
    });
  });

  // Second pass: Group by entryNo + particular + cocCode + glCode
  const groupedResultMap = new Map();
  result.forEach((row) => {
    // Only return objects that have a valid cocCode
    if (!row.cocCode || !row.cocCode.trim() || row.cocCode.trim() === "-") {
      return;
    }
    const key = `${row.entryNo}|${row.particular}|${row.cocCode}|${row.glCode}`;
    if (!groupedResultMap.has(key)) {
      groupedResultMap.set(key, { ...row });
    } else {
      groupedResultMap.get(key).amount += row.amount;
    }
  });

  const groupedResult = Array.from(groupedResultMap.values());

  const finalResult = groupedResult.map((row, idx) => ({
    ...row,
    key: `grouped-${idx}`,
    entryNo: row.entryNo,
    amount: Number(Number(row.amount || 0).toFixed(2)),
    narration: row.narration || "",
    adjustmentType: row.adjustmentType || "",
    tag: row.tag || "",
    entryType: row.entryType || "",
  }));

  return {
    entries: finalResult,
  };
};
