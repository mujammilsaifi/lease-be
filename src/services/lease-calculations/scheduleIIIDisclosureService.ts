// @ts-nocheck
import { groupNaturesByMapping, getAccountType } from "./groupLeaseMapping";

export const generateScheduleIIIDisclosure = (
  allLeaseSummaries: any[],
  mappings: any[] = [],
  disclosureSettings: any[] = []
) => {
  if (!allLeaseSummaries || allLeaseSummaries.length === 0) {
    return { entries: [], exportData: [] };
  }

  const assetTypesInData = [
    ...new Set(allLeaseSummaries.map((item) => item.LeaseInfo?.natureOfLease)),
  ].filter(Boolean);

  const entries: any[] = [
    {
      revisedNo: "Entry 1",
      no: "Entry 1",
      narration: "Addition in Gross Block of ROU and Lease Liability during the period",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "Addition in ROU and Lease Liability",
      color: "#00adef",
      lines: [
        { originalEntryNo: "Entry 1", particular: "ROU Gross Block", key: "ROUGrossBlockMovement.addition", sign: "Same", column: "Addition" },
        { originalEntryNo: "Entry 7", particular: "ROU Gross Block - Prepaid Rent", key: "PrepaidRentMovement.addition", sign: "Same", column: "Addition" },
        { originalEntryNo: "Entry 1", particular: "Lease Liability", key: "leaseLiability.addition", sign: "Opposite", column: "Addition" },
        { originalEntryNo: "Entry 7", particular: "Security Deposit", key: "PrepaidRentMovement.addition", sign: "Opposite", column: "" },
      ],
    },
    {
      revisedNo: "Entry 2",
      no: "Entry 2",
      narration: "(Gain) / Loss on terminaltion of lease during the period",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "(Gain) / Loss on terminaltion",
      color: "#92d050",
      lines: [
        { originalEntryNo: "Entry 2", particular: "Lease Liability", key: "leaseLiability.termination", sign: "Opposite", column: "Termination" },
        { originalEntryNo: "Entry 2", particular: "ROU Gross Block", key: "ROUGrossBlockMovement.disposal", sign: "Same", column: "Disposal" },
        { originalEntryNo: "Entry 8", particular: "ROU Gross Block - Prepaid Rent", key: "PrepaidRentMovement.disposal", sign: "Same", column: "Disposal" },
        { originalEntryNo: "Entry 2", particular: "ROU Accumulated Depreciation", key: "ROUAccumlatedDepreciationMovement.disposalAccumulatedDepreciation", sign: "Opposite", column: "Disposal Accumulated Depreciation" },
        { originalEntryNo: "Entry 8", particular: "ROU Accumulated Depreciation - Prepaid Rent", key: "PrepaidRentMovement.disposalAccumulatedDepreciation", sign: "Opposite", column: "Disposal Accumulated Depreciation" },
        { originalEntryNo: "Entry 2", particular: "(Gain) / Loss on Termination", key: "profitLoss.ProfitLossonTermination", sign: "Same", column: "" },
        { originalEntryNo: "Entry 8", particular: "(Gain) / Loss on Termination - Prepaid Rent", key: "profitLoss.ProfitLossOnTerminationPrepaidRent", sign: "Same", column: "" },
      ],
    },
    {
      revisedNo: "Entry 3",
      no: "Entry 3",
      narration: "Interest and rent expense on lease liability during the period",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "Interest & rent expenses on lease liability",
      color: "#0070c0",
      lines: [
        { originalEntryNo: "Entry 3", particular: "Interest expense on lease liability", key: "leaseLiability.interest", sign: "Same", column: "Interest on Lease Liability for the period" },
        { originalEntryNo: "Entry 4", particular: "Rent Expense", key: "leaseLiability.rentPaid", sign: "Same", column: "Rent Paid for the period" },
        { originalEntryNo: "Entry 3 & 4", particular: "Lease Liability", key: "leaseLiability.interest", sign: "Opposite", column: "" },
        { originalEntryNo: "Entry 3 & 4", particular: "Lease Liability", key: "leaseLiability.rentPaid", sign: "Opposite", column: "" },
      ],
    },
    {
      revisedNo: "Entry 4",
      no: "Entry 4",
      narration: "Depreciation expense on ROU during the period",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "Depreciation expense on ROU",
      color: "#ffff00",
      lines: [
        { originalEntryNo: "Entry 5", particular: "Depreciation expense on Right of use", key: "ROUAccumlatedDepreciationMovement.depreciationForPeriod", sign: "Same", column: "Depreciation of the period" },
        { originalEntryNo: "Entry 10", particular: "Depreciation expense on prepaid portion of security deposit", key: "PrepaidRentMovement.depreciationForPeriod", sign: "Same", column: "Depreciation of the period" },
        { originalEntryNo: "Entry 5 & 10", particular: "ROU Accumulated Depreciation", key: "ROUAccumlatedDepreciationMovement.depreciationForPeriod", sign: "Opposite", column: "" },
        { originalEntryNo: "Entry 5 & 10", particular: "ROU Accumulated Depreciation - Prepaid Rent", key: "PrepaidRentMovement.depreciationForPeriod", sign: "Opposite", column: "" },
      ],
    },
    {
      revisedNo: "Entry 5",
      no: "Entry 5",
      narration: "(Gain) / Loss on modification of lease during the period",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "(Gain) / Loss on modification",
      color: "#ffc000",
      lines: [
        { originalEntryNo: "Entry 6", particular: "Lease Liability", key: "leaseLiability.modification", sign: "Opposite", column: "Modification" },
        { originalEntryNo: "Entry 6", particular: "ROU Gross Block", key: "ROUGrossBlockMovement.modification", sign: "Same", column: "Modification" },
        { originalEntryNo: "Entry 6", particular: "(Gain) / Loss on Modification", key: "profitLoss.ProfitLossonModification", sign: "Opposite", column: "Gain / (Loss) on Modification" },
      ],
    },
    {
      revisedNo: "Entry 6",
      no: "Entry 6",
      narration: "Unwinding of interest on security deposit",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "Unwinding interest on security deposit",
      color: "#cfe2f3",
      lines: [
        { originalEntryNo: "Entry 9", particular: "Security Deposit", key: "securityDeposit.UnwindingInterestOnSD", sign: "Same", column: "" },
        { originalEntryNo: "Entry 9", particular: "Unwinding of interest on security deposit", key: "securityDeposit.UnwindingInterestOnSD", sign: "Opposite", column: "Unwinding of Interest for the period" },
      ],
    },
    {
      revisedNo: "Entry 8",
      no: "Entry 8",
      narration: "Inter - Unit received / transferred during the period",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "Inter - Unit received / transferred",
      color: "#e6f7ff",
      lines: [
        { originalEntryNo: "Entry 13", particular: "Lease Liability", key: "leaseLiability.iuTransferred", sign: "Opposite", column: "" },
        { originalEntryNo: "Entry 13", particular: "ROU Gross Block", key: "ROUGrossBlockMovement.iuTransferred", sign: "Same", column: "" },
        { originalEntryNo: "Entry 13", particular: "ROU Accumulated Depreciation", key: "ROUAccumlatedDepreciationMovement.iuTransferred", sign: "Opposite", column: "" },
        { originalEntryNo: "Entry 13", particular: "ROU Gross Block - Prepaid Rent", key: "PrepaidRentMovement.iuTransferred", sign: "Same", column: "" },
        { originalEntryNo: "Entry 13", particular: "ROU Accumulated Depreciation - Prepaid Rent", key: "PrepaidRentMovement.iuTransferredAD", sign: "Opposite", column: "" },
        { originalEntryNo: "Entry 13", particular: "Security Deposit", key: "securityDeposit.securityDepositTransfer", sign: "Same", column: "" },
        { originalEntryNo: "Entry 13", particular: "Inter Unit receivable / (Payable)", key: "special.iuBalancingFigure", sign: "Same", column: "" },
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
      revisedNo: "Entry 7",
      no: "Entry 7",
      narration: "Current - Non Current of Lease Liability as at period end",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "Current - Non Current of Lease Liability",
      color: "#d9d9d9",
      lines: [
        { originalEntryNo: "Entry 11", particular: "Current Lease Liability", key: "reclass.liability", sign: "Opposite", column: "Current - Non Current of Lease Liability" },
        { originalEntryNo: "Entry 11", particular: "Non-Current Lease Liability", key: "reclass.liability", sign: "Same", column: "" },
      ],
    });
  } else if (activeCurrent && !activeNonCurrent) {
    entries.push({
      revisedNo: "Entry 7",
      no: "Entry 7",
      narration: "Current - Non Current of Lease Liability as at period end",
      adjustmentType: "GAAP adjustments",
      tag: "Rucurring",
      entryType: "Current - Non Current of Lease Liability",
      color: "#d9d9d9",
      lines: [
        { originalEntryNo: "Entry 11", particular: "Current Lease Liability", key: "reclass.liability", sign: "Same", column: "Current - Non Current of Lease Liability" },
        { originalEntryNo: "Entry 11", particular: "Non-Current Lease Liability", key: "reclass.liability", sign: "Opposite", column: "" },
      ],
    });
  }

  entries.sort((a, b) => {
    const numA = parseInt(a.revisedNo.replace("Entry ", ""));
    const numB = parseInt(b.revisedNo.replace("Entry ", ""));
    return numA - numB;
  });

  const result: any[] = [];

  entries.forEach((entry) => {
    const entrySetting: any = disclosureSettings.find(
      (s: any) => s.entryNo === entry.no
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
          entry.revisedNo === "Entry 7"
        ) {
          accTypeForMapping = "Current Lease Liability";
        } else if (
          line.particular === "Non-Current Lease Liability" &&
          entry.revisedNo === "Entry 7"
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
            const isStandardEntry = ["Entry 1", "Entry 2", "Entry 7"].includes(entry.no);
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

        result.push({
          revisedNo: entry.revisedNo,
          originalEntryNo: line.originalEntryNo || entry.no,
          entryNo: entry.no,
          narration: entrySetting?.narration || entry.narration,
          particular:
            line.particular === "Lease Liability"
              ? accTypeForMapping
              : line.particular,
          coc: mapping?.coc_code
            ? `${mapping?.coc_name} / ${mapping?.coc_code}`
            : "-",
          gl: mapping?.gl_code
            ? `${mapping?.gl_name} / ${mapping?.gl_code}`
            : "-",
          cocCode: mapping?.coc_code || "-",
          glCode: mapping?.gl_code || "-",
          amount: finalAmount,
          sign: line.sign,
          columnOfReport: line.column,
          color: entry.color || "transparent",
          adjustmentType: entrySetting?.adjustment_type || entry.adjustmentType || "-",
          tag: entrySetting?.tag || entry.tag || "-",
          entryType: entrySetting?.entry_type || entry.entryType || "-",
        });
      });
    });
  });

  // Second pass: Group by revisedNo + originalEntryNo + particular + cocCode + glCode
  const groupedResultMap = new Map();
  result.forEach((row) => {
    const key = `${row.revisedNo}|${row.originalEntryNo}|${row.particular}|${row.cocCode}|${row.glCode}`;
    if (!groupedResultMap.has(key)) {
      groupedResultMap.set(key, { ...row });
    } else {
      groupedResultMap.get(key).amount += row.amount;
    }
  });

  const groupedResult = Array.from(groupedResultMap.values());

  const finalResult: any[] = [];
  const seenEntries = new Set();
  groupedResult.forEach((row, idx) => {
    const showMeta = !seenEntries.has(row.revisedNo);
    if (showMeta) seenEntries.add(row.revisedNo);

    finalResult.push({
      ...row,
      key: `grouped-${idx}`,
      revisedNo: showMeta ? row.revisedNo : "",
      originalEntryNo: row.originalEntryNo,
      narration: showMeta ? row.narration : "",
      adjustmentType: showMeta ? row.adjustmentType : "",
      tag: showMeta ? row.tag : "",
      entryType: showMeta ? row.entryType : "",
    });
  });

  const exportData = finalResult.map((row: any) => {
    const [cocName, cocCode] = (row.coc || "").split(" / ");
    const [glName, glCode] = (row.gl || "").split(" / ");

    return {
      "Entry No": row.revisedNo || "",
      "Particular": row.particular || "",
      "Adjustment Type": row.adjustmentType || "",
      "GL Code": glCode || row.glCode || "",
      "GL Name": glName || "",
      "CoC Code": cocCode || row.cocCode || "",
      "CoC Name": cocName || "",
      "Amount": Math.round(row.amount),
      "Narration": row.narration || "",
      "Tag": row.tag || "",
      "Entry Type": row.entryType || "",
    };
  });

  return {
    entries: finalResult,
    exportData,
  };
};
