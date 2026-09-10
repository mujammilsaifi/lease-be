// @ts-nocheck


import { normalizeDiscountingRate } from "./normalizeDiscountingRate";
import { processLeaseCalculations } from "./processLeaseCalculations";
import { differenceInCalendarDays } from "date-fns";
import { formatDateToStr } from "./CalculateDailyRent";
import { formatToGBDate } from "./dateUtils";
function calculateSum(data, key) {
  return data.reduce((sum, item) => {
    const value = item[key];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}

export const processLeaseCalculationsModification = async (
  leaseRecord: {
    activeLease: any;
    previousVersions: any[];
  },
  isDownload = false
) => {
  const sortedLeases = [
    ...(leaseRecord.activeLease ? [leaseRecord.activeLease] : []),
    ...(leaseRecord.previousVersions || []),
  ].sort((a, b) => (a?.versionNumber || 0) - (b?.versionNumber || 0));
  if (!sortedLeases.some((lease) => lease.versionNumber === 1)) {
    throw new Error("No version 1 lease found");
  }
  const firstVersionLease = sortedLeases.find(
    (lease) => lease.versionNumber === 1
  );
  const remainingVersionLeases = sortedLeases.filter(
    (lease) => lease.versionNumber !== 1
  );
  let results: any[] = [];

  const v1LeaseResults = await processLeaseCalculations(firstVersionLease);
  results = [...(v1LeaseResults?.updatedPVofRent || [])];

  for (let i = 0; i < remainingVersionLeases.length; i++) {
    // On the first iteration, re-filter the initial v1 results
    const filteredPreviousData = filterPreviousLeaseData(
      results,
      remainingVersionLeases[i]?.leaseModificationDate
    );

    const previousLeaseLastItem =
      filteredPreviousData[filteredPreviousData.length - 1];

    const calculation = await twoLeaseCalculation(
      remainingVersionLeases[i],
      sortedLeases[i],
      previousLeaseLastItem,
      results,
      isDownload
    );
    // Overwrite results with filtered + new
    results = [...filteredPreviousData, ...(calculation || [])];
  }

  return {
    updatedPVofRent: results,
  };
};

const twoLeaseCalculation = async (
  leaseRecord: any,
  previousVersionLease: any,
  previousLeaseLastItem: any,
  previousCalculation: any,
  isDownload: boolean
) => {
  const {
    discountingRates,
    frequencyForInterestCalculation,
    leaseModificationDate,
    securityDeposit,
    selectedOptions,
    scope,
  } = leaseRecord;
  if (!leaseRecord) return null;

  const rouAdjMap = new Map<string, number>();
  (leaseRecord.rouAdjustments || []).forEach((adj: any) => {
    const dateStr = formatToGBDate(adj.adjustmentDate);
    rouAdjMap.set(dateStr, (rouAdjMap.get(dateStr) || 0) + (Number(adj.adjustmentAmount) || 0));
  });

  let modifiedLeaseWithOldParamenter;
  if (selectedOptions.includes("2")) {
    if (selectedOptions.includes("2") && selectedOptions.includes("4")) {
      modifiedLeaseWithOldParamenter = await processLeaseCalcFor2_4Paramenter(
        leaseRecord,
        previousVersionLease,
        isDownload,
        previousLeaseLastItem
      );
    } else {
      modifiedLeaseWithOldParamenter =
        await processLeaseCalculationsWithOldParamenter(
          leaseRecord,
          previousVersionLease,
          isDownload,
          previousLeaseLastItem
        );
      // console.log(modifiedLeaseWithOldParamenter);
    }
  }

  const activeLeaseRecord = {
    ...leaseRecord,
    leaseWorkingPeriod: [...leaseRecord.leaseWorkingPeriod],
  };
  if (leaseModificationDate) {
    activeLeaseRecord.leaseWorkingPeriod[0] = leaseModificationDate;
  }
  const activeLeaseResult = await processLeaseCalculations(activeLeaseRecord);
  let activeLease = activeLeaseResult?.updatedPVofRent;
  if (previousVersionLease?.rentPaymentType === "Arrear Payment") {
    const arrerLostLeaseRentEntry = arrerLostLeaseRent(
      previousCalculation,
      leaseModificationDate
    );
    // console.log(arrerLostLeaseRentEntry);
    if (arrerLostLeaseRentEntry) {
      activeLease = updateActiveLeaseRent(activeLease, arrerLostLeaseRentEntry);
    }
  }
  const sumPVofRent = calculateSum(activeLease, "PV of Rent");
  const previousLeaseLiability =
    previousLeaseLastItem?.["Lease Liability"] ?? 0;
  const previousROU = previousLeaseLastItem?.["ROU"] ?? 0;
  const modificationOfLeaseLiability = sumPVofRent - previousLeaseLiability;
  const ModificationOfROU = selectedOptions.includes("2")
    ? -previousROU * (scope / 100) +
      (sumPVofRent - modifiedLeaseWithOldParamenter)
    : modificationOfLeaseLiability;
  //  console.log("ModificationOfROU",ModificationOfROU)
  const prevROUinScope =
    sumPVofRent -
    previousLeaseLastItem?.["Lease Liability"] * ((100 - scope) / 100);
  const ModificationOfROUinDecrease =
    -previousROU * (scope / 100) + prevROUinScope;
  const isExactly4InOrder =
    selectedOptions.includes("4") && !selectedOptions.includes("2");
  const hasOneOrTwo =
    selectedOptions.includes("1") || selectedOptions.includes("2");
  const hasTwoAndFour =
    selectedOptions.includes("2") && selectedOptions.includes("4");
  if (activeLease?.[0]) {
    const day0DateStr = activeLease[0]["Date"];
    const day0Adjustment = rouAdjMap.get(day0DateStr) || 0;

    const rentPayment = activeLease[0]["RentPayment"] ?? 0;
    activeLease[0]["Modification of Lease Liability"] =
      modificationOfLeaseLiability;
    const modificationOfROU = isExactly4InOrder
      ? ModificationOfROUinDecrease
      : ModificationOfROU;
    const modificationwithoutTwoFour = isExactly4InOrder
      ? previousROU + ModificationOfROUinDecrease
      : previousROU + ModificationOfROU;

    activeLease[0]["Modification of ROU"] = hasTwoAndFour
      ? ModificationOfROU
      : modificationOfROU;
    activeLease[0]["Profit (Loss) in Modification"] =
      (hasTwoAndFour ? ModificationOfROU : modificationOfROU) -
      modificationOfLeaseLiability;
    activeLease[0]["Lease Liability"] =
      modificationOfLeaseLiability + previousLeaseLiability - rentPayment;
    activeLease[0]["ROU"] = (hasTwoAndFour
      ? previousROU + ModificationOfROU
      : modificationwithoutTwoFour) + day0Adjustment;
    activeLease[0]["Depreciation"] = 0 - day0Adjustment;

    if (hasOneOrTwo) {
      const newSecurityDeposit =
        securityDeposit *
        activeLease[activeLease?.length - 1]["Daily PV Factor"];
      activeLease[0]["Security Deposit"] = newSecurityDeposit;
      activeLease[0]["Interest Income on security deposit"] =
        newSecurityDeposit - previousLeaseLastItem?.["Security Deposit"];
      activeLease[0]["Pre-paid Rent"] =
        previousLeaseLastItem?.["Pre-paid Rent"];
      activeLease[0]["Dep on Prepaid Rent"] = 0;
    } else {
      const getPreviousPR_SD = getLeaseDetailsByDate(
        previousCalculation,
        activeLease?.[0]?.Date
      );
      activeLease[0]["Security Deposit"] =
        getPreviousPR_SD?.["Security Deposit"] || 0;
      activeLease[0]["Interest Income on security deposit"] =
        getPreviousPR_SD?.["Interest Income on security deposit"] || 0;
      activeLease[0]["Pre-paid Rent"] =
        getPreviousPR_SD?.["Pre-paid Rent"] || 0;
      activeLease[0]["Dep on Prepaid Rent"] =
        getPreviousPR_SD?.["Dep on Prepaid Rent"] || 0;
    }
  }
  const totalDays = activeLease?.length;
  // Calculate discount rate
  const disCountRatePA =
    frequencyForInterestCalculation === "monthly"
      ? normalizeDiscountingRate(discountingRates)
      : discountingRates?.[discountingRates?.length - 1]?.rate;
  for (let i = 1; i < activeLease.length; i++) {
    const currentEntry = activeLease[i];
    const previousEntry = activeLease[i - 1];
    const daysInYear = 365;
    const rentPayment = currentEntry["RentPayment"] || 0;
    const dailyRate = disCountRatePA / 100 / daysInYear;
    const interestOnLeaseLiability =
      previousEntry["Lease Liability"] * dailyRate;
    const leaseLiability =
      previousEntry["Lease Liability"]! -
      rentPayment +
      interestOnLeaseLiability;

    currentEntry["Interest on lease liability"] = interestOnLeaseLiability;
    currentEntry["Lease Liability"] = leaseLiability;
    const entryDateStr = currentEntry["Date"];
    const adjustmentForToday = rouAdjMap.get(entryDateStr) || 0;
    const baseDepreciation = previousEntry["ROU"] / (totalDays - i);
    const Depreciation = baseDepreciation - adjustmentForToday;
    currentEntry["Depreciation"] = Depreciation;
    currentEntry["ROU"] = previousEntry["ROU"] - Depreciation;
    if (hasOneOrTwo) {
      const InterestIncomeOnSecurityDeposit =
        previousEntry["Security Deposit"] * dailyRate;
      currentEntry["Security Deposit"] =
        previousEntry["Security Deposit"] + InterestIncomeOnSecurityDeposit;
      currentEntry["Interest Income on security deposit"] =
        InterestIncomeOnSecurityDeposit;
      currentEntry["Pre-paid Rent"] =
        previousEntry["Pre-paid Rent"] -
        previousEntry["Pre-paid Rent"] / (totalDays - i);
      currentEntry["Dep on Prepaid Rent"] =
        previousEntry["Pre-paid Rent"] / (totalDays - i);
    } else {
      const getPreviousPR_SD = getLeaseDetailsByDate(
        previousCalculation,
        currentEntry?.Date
      );
      activeLease[i]["Security Deposit"] =
        getPreviousPR_SD?.["Security Deposit"] || 0;
      activeLease[i]["Interest Income on security deposit"] =
        getPreviousPR_SD?.["Interest Income on security deposit"] || 0;
      activeLease[i]["Pre-paid Rent"] =
        getPreviousPR_SD?.["Pre-paid Rent"] || 0;
      activeLease[i]["Dep on Prepaid Rent"] =
        getPreviousPR_SD?.["Dep on Prepaid Rent"] || 0;
    }
  }
  if (
    isDownload &&
    selectedOptions.includes("4") &&
    !selectedOptions.includes("2")
  ) {
    const leaseLiabilityBeforeMod =
      previousLeaseLastItem?.["Lease Liability"] ?? 0;
    const rouBeforeMod = previousLeaseLastItem?.["ROU"] ?? 0;
    const scopePercentage = scope ?? 0;
    // previousVersionLease might be passed as 'previousVersionLease' argument?
    // Yes, 'previousVersionLease' is the 2nd arg to 'twoLeaseCalculation'.
    let rentBeforeDecrease = previousVersionLease?.rentAmount ?? 0;
    try {
      const prevLeaseCalc = await processLeaseCalculations(
        previousVersionLease
      );
      const modDate = new Date(leaseRecord.leaseModificationDate);
      const modDateStr = formatDateToStr(modDate);

      if (prevLeaseCalc?.rentFrequencyData) {
        const matchingPeriod = prevLeaseCalc.rentFrequencyData.find(
          (item: any) =>
            modDateStr >= item.startDate && modDateStr <= item.endDate
        );

        if (matchingPeriod) {
          rentBeforeDecrease = matchingPeriod.subRentTotal;
        }
      }
    } catch (error) {
      console.error("Error calculating previous rent:", error);
    }
    const rentAfterDecrease = leaseRecord?.rentAmount ?? 0;

    // excel download omitted
  }
  return activeLease;
};

function updateActiveLeaseRent(activeLease, updatedEntry) {
  let updatedRent = activeLease.map((entry) => {
    if (entry.Date === updatedEntry.Date) {
      const currentPayment = entry.RentPayment ?? 0;
      const updatedPayment = updatedEntry.RentPayment ?? 0;

      return {
        ...entry,
        RentPayment: currentPayment + updatedPayment,
      };
    }
    return entry;
  });
  updatedRent = updatedRent.map((entry) => {
    const pvOfRent =
      entry.RentPayment !== null
        ? entry.RentPayment * entry["Daily PV Factor"]
        : null;
    return { ...entry, "PV of Rent": pvOfRent };
  });
  return updatedRent;
}
function arrerLostLeaseRent(activeLease, ModificationDate) {
  // Normalize modDate to start of day
  const modDate = new Date(ModificationDate);
  modDate.setHours(0, 0, 0, 0);

  // Create endDate = modDate + 1 month, and normalize it too
  const endDate = new Date(modDate);
  endDate.setMonth(endDate.getMonth() + 1);

  // Adjust day if next month has fewer days
  if (endDate.getDate() < modDate.getDate()) {
    endDate.setDate(0); // set to last day of previous month
  } else {
    endDate.setDate(modDate.getDate() - 1);
  }
  endDate.setHours(0, 0, 0, 0); // Normalize time

  const rentEntry = activeLease.find((entry) => {
    const entryDate = new Date(entry.Date);
    entryDate.setHours(0, 0, 0, 0); // Normalize entry date

    return (
      entryDate >= modDate && entryDate <= endDate && entry.RentPayment !== null
    );
  });

  return rentEntry || null;
}

function filterPreviousLeaseData(data, leaseModificationDate) {
  const modDate = new Date(leaseModificationDate);
  return data?.filter((item) => {
    const entryDate = new Date(item.Date);
    const entryDateOnly = new Date(
      entryDate.getFullYear(),
      entryDate.getMonth(),
      entryDate.getDate()
    );
    const modDateOnly = new Date(
      modDate.getFullYear(),
      modDate.getMonth(),
      modDate.getDate()
    );
    return entryDateOnly < modDateOnly;
  });
}
const processLeaseCalcFor2_4Paramenter = async (
  leaseRecord,
  previousVersionLease,
  isDownload,
  previousLeaseLastItem
) => {
  const { leaseModificationDate } = leaseRecord;

  // Create a copy of leaseRecord and override the discountingRates
  const modifiedLeaseRecord = {
    ...leaseRecord,
    discountingRates: previousVersionLease.discountingRates,
    leaseWorkingPeriod: [...leaseRecord.leaseWorkingPeriod],
  };

  // Set the leaseWorkingPeriod start date if leaseModificationDate exists
  if (leaseModificationDate) {
    modifiedLeaseRecord.leaseWorkingPeriod[0] = leaseModificationDate;
  }
  // Call the lease calculation function
  const previousLeaseResult = await processLeaseCalculations(
    modifiedLeaseRecord
  );

  const previousLease = previousLeaseResult?.updatedPVofRent;
  if (previousVersionLease?.rentPaymentType === "Arrear Payment") {
    const arrerLastLostLeaseRent = await processLeaseCalculations(
      previousVersionLease
    );
    const updatedArray = updateRentPayments(
      previousLease,
      arrerLastLostLeaseRent?.rentFrequencyData
    );
    if (isDownload) {
      const leaseLiabilityBeforeMod =
        previousLeaseLastItem?.["Lease Liability"] || 0;
      const rouBeforeMod = previousLeaseLastItem?.["ROU"] || 0;
      const scopePercentage = leaseRecord?.scope || 0;
      const modDate = new Date(leaseRecord.leaseModificationDate);
      const oldEndDate = new Date(previousVersionLease.leaseWorkingPeriod[1]);
      const remainingLeaseTermDays =
        differenceInCalendarDays(oldEndDate, modDate) + 1;
      const decreaseInLeaseTermDays =
        remainingLeaseTermDays * (scopePercentage / 100);

      // excel download omitted
    }
    const sumPVofRent = calculateSum(updatedArray, "PV of Rent");
    return sumPVofRent;
  }
  if (isDownload) {
    // excel download omitted
  }
  const sumPVofRent = calculateSum(previousLease, "PV of Rent");
  return sumPVofRent;
};

const processLeaseCalculationsWithOldParamenter = async (
  leaseRecord,
  previousVersionLease,
  isDownload,
  previousLeaseLastItem
) => {
  const { leaseWorkingPeriod, leaseModificationDate } = leaseRecord;
  const previousLeaseRecordTemp = JSON.parse(
    JSON.stringify(previousVersionLease)
  );
  previousLeaseRecordTemp.leaseWorkingPeriod = [...leaseWorkingPeriod];
  if (leaseModificationDate) {
    previousLeaseRecordTemp.leaseWorkingPeriod[0] = leaseModificationDate;
  }
  const previousLeaseResult = await processLeaseCalculations(
    previousLeaseRecordTemp
  );
  const previousLease = previousLeaseResult?.updatedPVofRent;
  if (isDownload) {
    // exporting lease with old paramenter.
    const leaseLiabilityBeforeMod =
      previousLeaseLastItem?.["Lease Liability"] || 0;
    const rouBeforeMod = previousLeaseLastItem?.["ROU"] || 0;
    const scopePercentage = leaseRecord?.scope || 0;
    const modDate = new Date(leaseRecord.leaseModificationDate);
    const oldEndDate = new Date(previousVersionLease.leaseWorkingPeriod[1]);
    const remainingLeaseTermDays =
      differenceInCalendarDays(oldEndDate, modDate) + 1;
    const decreaseInLeaseTermDays =
      remainingLeaseTermDays * (scopePercentage / 100);

    // excel download omitted
  }
  const sumPVofRent = calculateSum(previousLease, "PV of Rent");
  return sumPVofRent;
};
function getLeaseDetailsByDate(dataArray, targetDate) {
  const keysToExtract = [
    "Dep on Prepaid Rent",
    "Pre-paid Rent",
    "Interest Income on security deposit",
    "Security Deposit",
  ];
  const entry = dataArray.find((item) => item.Date === targetDate);

  if (!entry) {
    console.warn(`No entry found for date: ${targetDate}`);
    return null;
  }
  const result = {};
  for (const key of keysToExtract) {
    if (Object.prototype.hasOwnProperty.call(entry, key)) {
      result[key] = entry[key];
    } else {
      console.warn(`Key '${key}' not found in entry for date: ${targetDate}`);
    }
  }

  return result;
}

// helper for update array arrer payment lost
function updateRentPayments(previousdata, paymentDataArray) {
  // Helper function to convert YYYY-MM-DD to DD-MMM-YYYY
  function formatDate(dateString) {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, "0");
    const month = date.toLocaleString("default", { month: "short" });
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  // Create a copy of the previousdata to avoid mutating the original array
  const updatedData = [...previousdata];

  // Iterate over each payment in paymentDataArray
  paymentDataArray.forEach((payment) => {
    const formattedPaymentDate = formatDate(payment.paymentDate);

    // Find the index of the matching entry in updatedData
    const index = updatedData.findIndex(
      (entry) => entry.Date.toLowerCase() === formattedPaymentDate.toLowerCase()
    );

    if (index !== -1) {
      updatedData[index] = {
        ...updatedData[index],
        RentPayment: payment.totalRent,
        "PV of Rent": payment.totalRent * updatedData[index]["Daily PV Factor"],
      };
    }
  });

  return updatedData;
}
