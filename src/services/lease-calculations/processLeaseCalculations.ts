// @ts-nocheck
// ===== IMPORTS =====
import dayjs from "dayjs";
import { formatDateToStr, generateDailyRentArray } from "./CalculateDailyRent";
import {
  calculateMonthlyRentAdvance,
  calculateMonthlyRentRegular,
} from "./calculationForBothRent";
import { formatToGBDate } from "./dateUtils";
import { normalizeDiscountingRate } from "./normalizeDiscountingRate";
import { calculationTransitionWithProspective } from "./calculationTransitionWithProspective";
import { goalSeek } from "./goalSeek";
import { deepClone } from "./deepClone";

// ===== TYPE DEFINITIONS =====
interface LeaseRecord {
  leasePeriod: any;
  leaseWorkingPeriod: [string, string];
  rentPaymentFrequency: string;
  rentAmount: number;
  rentPaymentDate: string;
  rentPaymentType: string;
  systematicEscalations: any[];
  adhocEscalations: any[];
  rentFreePeriods: any[];
  securityDeposit: number;
  leaseEqualizationPertaining: number;
  discountingRates: Array<{ rate: number }>;
  cutOffDate: string;
  cutOffLeasePeriod: [string, string];
  cutOffDateROU: number;
  cutOffDatePrepaidRent: number;
  leaseLiabilityCutOff: number;
  cutOffSecurityDeposit: number;
  frequencyForInterestCalculation: string;
  transitionType?: string;
  transitionDiscountAdjustment?: string;
  randomPayments?: Array<{ date: string; amount: number }>;
  rouAdjustments?: Array<{ adjustmentDate: string; adjustmentAmount: number }>;
}

interface DateObject {
  Date: string;
}

// ===== UTILITY FUNCTIONS =====
const generateDateArray = (
  startDate: string | Date,
  endDate: string | Date,
): DateObject[] => {
  const dates: DateObject[] = [];
  const currentDate = new Date(startDate);
  const finalDate = new Date(endDate);

  while (currentDate <= finalDate) {
    dates.push({
      Date: formatToGBDate(formatDateToStr(currentDate)),
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
};

const calculateDailyPVFactor = (
  days: number,
  discountRate: number,
  daysInYear: number,
): number => {
  const dailyRate = discountRate / 100 / daysInYear;
  const pvFactor = 1 / Math.pow(1 + dailyRate, days);
  return pvFactor;
};

const isSameDate = (date1: Date, date2: Date): boolean =>
  date1.getFullYear() === date2.getFullYear() &&
  date1.getMonth() === date2.getMonth() &&
  date1.getDate() === date2.getDate();

// ===== MAIN PROCESSING FUNCTION =====
export const processLeaseCalculations = async (leaseRecord: LeaseRecord) => {
  const {
    leasePeriod,
    leaseWorkingPeriod,
    rentPaymentFrequency,
    rentAmount,
    rentPaymentDate,
    rentPaymentType,
    systematicEscalations,
    adhocEscalations,
    rentFreePeriods,
    securityDeposit,
    leaseEqualizationPertaining,
    discountingRates,
    cutOffDate,
    cutOffDateROU,
    cutOffDatePrepaidRent,
    leaseLiabilityCutOff,
    cutOffSecurityDeposit,
    frequencyForInterestCalculation,
    transitionType,
    transitionDiscountAdjustment,
  } = leaseRecord;
  if (transitionType === "prospective") {
    // 1. Calculate the original result with the original discount rate
    const originalResult =
      await calculationTransitionWithProspective(leaseRecord);
    const originalLastEntryLeaseLiability =
      originalResult.updatedPVofRent[originalResult.updatedPVofRent.length - 1][
        "Lease Liability"
      ];

    if (
      Math.abs(originalLastEntryLeaseLiability) <= 0.01 ||
      transitionDiscountAdjustment === "no"
    ) {
      return originalResult;
    }

    // Use goal seek to find the optimal discount rate
    const optimizedResult = await goalSeek(leaseRecord, 0); // Target lease liability of 0

    return optimizedResult;
  }
  // Calculate discount rate
  const disCountRatePA =
    frequencyForInterestCalculation === "monthly"
      ? normalizeDiscountingRate(discountingRates)
      : discountingRates?.[discountingRates?.length - 1]?.rate;

  const leaseData = {
    leasePeriod,
    leaseWorkingPeriod,
    rentPaymentFrequency,
    rentAmount,
  };

  // Generate daily rent data
  const dailyRentArray = await generateDailyRentArray(
    leaseData,
    systematicEscalations,
    adhocEscalations,
    rentFreePeriods,
  );

  if (!dailyRentArray || dailyRentArray.length === 0) {
    throw new Error("No daily rent data generated");
  }

  // Calculate monthly rent based on payment type
  const rentPaymentDay =
    rentPaymentDate === "endOfPeriod" ? -1 : parseInt(rentPaymentDate) || 1; // -1 signals "end of period"
  const rentFrequencyData =
    rentPaymentType === "Advance Payment"
      ? calculateMonthlyRentAdvance(
          dailyRentArray,
          rentPaymentFrequency,
          rentPaymentDay,
          leaseWorkingPeriod,
        )
      : calculateMonthlyRentRegular(
          dailyRentArray,
          rentPaymentFrequency,
          rentPaymentDay,
          leaseWorkingPeriod,
        );

  if (!rentFrequencyData || rentFrequencyData.length === 0) {
    throw new Error("No rent frequency data generated");
  }

  // Format rent data
  const formattedRentData = rentFrequencyData.map((item) => ({
    date: formatToGBDate(item.paymentDate),
    rent: item.subRentTotal,
  }));

  // Generate lease date range
  const generateDates = generateDateArray(
    leaseWorkingPeriod[0],
    leaseWorkingPeriod[1],
  );

  // OPTIMIZATION: Pre-compute rent and random payments in Maps for O(1) lookup
  const rentMap = new Map<string, number>();
  formattedRentData.forEach((rentObj) => {
    rentMap.set(rentObj.date, (rentMap.get(rentObj.date) || 0) + (rentObj.rent || 0));
  });

  const randomMap = new Map<string, number>();
  (leaseRecord.randomPayments || []).forEach((rp: any) => {
    const dateStr = formatToGBDate(rp.date);
    randomMap.set(dateStr, (randomMap.get(dateStr) || 0) + (rp.amount || 0));
  });

  const rouAdjMap = new Map<string, number>();
  (leaseRecord.rouAdjustments || []).forEach((adj: any) => {
    const dateStr = formatToGBDate(adj.adjustmentDate);
    rouAdjMap.set(dateStr, (rouAdjMap.get(dateStr) || 0) + (Number(adj.adjustmentAmount) || 0));
  });

  const combinedArray = generateDates.map((dateObj) => {
    const rentPayments = rentMap.get(dateObj.Date) || 0;
    const randomPayment = randomMap.get(dateObj.Date) || 0;

    return {
      ...dateObj,
      RentPayment: (rentPayments + randomPayment) || null,
    };
  });

  // Add discount days
  const updatedArray = combinedArray.map((item, index) => ({
    ...item,
    "Discount Days": index,
  }));

  // Calculate daily PV factor
  const updatedDailyPVFactor = updatedArray.map((entry) => {
    const daysInYear = 365;
    const dailyPVFactor = calculateDailyPVFactor(
      entry["Discount Days"],
      disCountRatePA,
      daysInYear,
    );
    return { ...entry, "Daily PV Factor": dailyPVFactor };
  });

  // Calculate PV of Rent
  let updatedPVofRent = updatedDailyPVFactor.map((entry) => {
    const pvOfRent =
      entry.RentPayment !== null
        ? entry.RentPayment * entry["Daily PV Factor"]
        : null;
    return { ...entry, "PV of Rent": pvOfRent };
  });

  // Sum PV of Rent and calculate initial values
  const sumPVOfRent = updatedPVofRent.reduce(
    (acc, curr) => acc + (curr["PV of Rent"] || 0),
    0,
  );
  const totalDays = generateDates.length;
  const roundedSumPVOfRent = Number(sumPVOfRent);

  const securityDepositAfterInterest =
    securityDeposit / Math.pow(1 + disCountRatePA / 100 / 365, totalDays - 1);

  // Initialize first entry values
  updatedPVofRent[0]["Lease Liability"] =
    roundedSumPVOfRent != null
      ? roundedSumPVOfRent - (updatedPVofRent?.[0]?.RentPayment ?? 0)
      : null;
  updatedPVofRent[0]["Interest on lease liability"] = 0;
  const day0DateStr = generateDates[0].Date;
  const day0Adjustment = rouAdjMap.get(day0DateStr) || 0;

  updatedPVofRent[0]["ROU"] =
    (leaseEqualizationPertaining
      ? roundedSumPVOfRent - leaseEqualizationPertaining
      : roundedSumPVOfRent) +
    day0Adjustment;
  updatedPVofRent[0]["Depreciation"] = 0 - day0Adjustment;
  updatedPVofRent[0]["Pre-paid Rent"] =
    securityDeposit - securityDepositAfterInterest;
  updatedPVofRent[0]["Dep on Prepaid Rent"] = 0;
  updatedPVofRent[0]["Interest Income on security deposit"] = 0;
  updatedPVofRent[0]["Security Deposit"] = securityDepositAfterInterest;

  // Process calculations for subsequent entries
  const leaseCutOffDate = new Date(cutOffDate);
  const transitionWorkingDate = dayjs(leaseCutOffDate).add(1, "day").toDate();

  for (let i = 1; i < updatedPVofRent.length; i++) {
    const entryDate = new Date(updatedPVofRent?.[i]?.["Date"]);
    const daysInYear = 365;
    const discountRate = disCountRatePA;
    const currentEntry = updatedPVofRent[i];
    const previousEntry = updatedPVofRent[i - 1];
    const dailyRate = discountRate / 100 / daysInYear;
    const interestOnLeaseLiability =
      previousEntry["Lease Liability"] * dailyRate;

    // Update Lease Liability
    const rentPayment = currentEntry["RentPayment"] || 0;
    const leaseLiability =
      previousEntry["Lease Liability"]! -
      rentPayment +
      interestOnLeaseLiability;

    currentEntry["Lease Liability"] = isSameDate(entryDate, leaseCutOffDate)
      ? leaseLiabilityCutOff
      : isSameDate(entryDate, transitionWorkingDate)
        ? previousEntry["Lease Liability"] -
          rentPayment +
          interestOnLeaseLiability +
          previousEntry["Transition Adjustment of Lease Liability"]
        : leaseLiability;

    if (isSameDate(entryDate, leaseCutOffDate)) {
      currentEntry["Transition Adjustment of Lease Liability"] =
        leaseLiability - leaseLiabilityCutOff;
    }

    currentEntry["Interest on lease liability"] = interestOnLeaseLiability;

    // Calculate depreciation and ROU
    const entryDateStr = currentEntry["Date"];
    const adjustmentForToday = rouAdjMap.get(entryDateStr) || 0;
    const baseDepreciation = updatedPVofRent[i - 1]["ROU"] / (totalDays - i);
    const Depreciation = baseDepreciation - adjustmentForToday;
    updatedPVofRent[i]["Depreciation"] = Depreciation;
    updatedPVofRent[i]["ROU"] = isSameDate(entryDate, leaseCutOffDate)
      ? cutOffDateROU
      : updatedPVofRent[i - 1]["ROU"] - Depreciation;

    // Calculate prepaid rent depreciation
    const DepOnPrepaidRent =
      updatedPVofRent[i - 1]["Pre-paid Rent"] / (totalDays - i);
    updatedPVofRent[i]["Dep on Prepaid Rent"] = DepOnPrepaidRent;
    updatedPVofRent[i]["Pre-paid Rent"] = isSameDate(entryDate, leaseCutOffDate)
      ? cutOffDatePrepaidRent
      : updatedPVofRent[i - 1]["Pre-paid Rent"] - DepOnPrepaidRent;

    // Calculate security deposit interest
    const InterestIncomeOnSecurityDeposit =
      updatedPVofRent[i - 1]["Security Deposit"] * dailyRate;
    updatedPVofRent[i]["Interest Income on security deposit"] =
      InterestIncomeOnSecurityDeposit;
    updatedPVofRent[i]["Security Deposit"] = isSameDate(
      entryDate,
      leaseCutOffDate,
    )
      ? cutOffSecurityDeposit
      : isSameDate(entryDate, transitionWorkingDate)
        ? previousEntry["Security Deposit"] +
          InterestIncomeOnSecurityDeposit +
          previousEntry["Transition Adjustment of Security Deposit"]
        : updatedPVofRent[i - 1]["Security Deposit"] +
          InterestIncomeOnSecurityDeposit;

    if (isSameDate(entryDate, leaseCutOffDate)) {
      currentEntry["Transition Adjustment of Security Deposit"] = -(
        cutOffSecurityDeposit -
        (updatedPVofRent[i - 1]["Security Deposit"] +
          InterestIncomeOnSecurityDeposit)
      );
    }
  }

  // Handle cutoff date filtering and transition adjustments
  if (cutOffDate) {
    updatedPVofRent = updatedPVofRent?.filter((item) => {
      const itemDate = new Date(item.Date);
      const leaseCutOffDateOnly = new Date(leaseCutOffDate);
      leaseCutOffDateOnly.setHours(0, 0, 0, 0);
      return itemDate >= leaseCutOffDateOnly;
    });

    // Extract the transition adjustment values from the first object
    const firstObj = updatedPVofRent[0];
    const transitionLease =
      firstObj["Transition Adjustment of Lease Liability"];
    const transitionDeposit =
      firstObj["Transition Adjustment of Security Deposit"];
    // Add them to the second object
    if (updatedPVofRent.length > 1) {
      updatedPVofRent[1]["Transition Adjustment of Lease Liability"] =
        transitionLease;
      updatedPVofRent[1]["Transition Adjustment of Security Deposit"] =
        transitionDeposit;
    }

    // Keep specific values and set others to null for first object
    if (updatedPVofRent.length > 0) {
      const firstObj = updatedPVofRent[0];
      const keysToKeep = [
        "Date",
        "Lease Liability",
        "ROU",
        "Pre-paid Rent",
        "Security Deposit",
      ];

      Object.keys(firstObj).forEach((key) => {
        if (!keysToKeep.includes(key)) {
          firstObj[key] = null;
        }
      });
    }
  }
  return {
    updatedPVofRent: deepClone(updatedPVofRent),
    rentFrequencyData: deepClone(rentFrequencyData),
    dailyRentArray: deepClone(dailyRentArray),
  };
};
