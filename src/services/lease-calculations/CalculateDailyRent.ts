// @ts-nocheck
import {
  startOfMonth,
  endOfMonth,
  addMonths,
  differenceInDays,
  eachDayOfInterval,
  parseISO,
} from "date-fns";

export interface LeaseDataUtils {
  leasePeriod: [string, string];
  leaseWorkingPeriod: [string, string];
  rentPaymentFrequency: string;
  rentAmount: number;
}

export interface RentFreePeriod {
  dateRange: [string, string];
  percentage: string;
}

export interface AdhocEscalation {
  dateRange: [string, string];
  frequency: "monthly" | "quarterly" | "semi-annual" | "annual";
  amount: string;
}

export interface DailyRent {
  date: string;
  rent: number;
}

export interface Escalation {
  dateRange: string;
  frequency: "monthly" | "quarterly" | "semi-annual" | "annual";
  percentage: number;
}

export function formatDateToStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDaysInMonth(date: Date): number {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  return differenceInDays(end, start) + 1;
}

export function calculateFrequencyEndDate(
  startDate: Date,
  frequency: string
): Date {
  const startDay = startDate.getDate();

  switch (frequency) {
    case "monthly": {
      const nextMonth = addMonths(startDate, 1);
      const endDay = Math.min(
        startDay - 1,
        new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate()
      );
      return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), endDay);
    }
    case "quarterly": {
      const nextQuarter = addMonths(startDate, 3);
      const endDay = Math.min(
        startDay - 1,
        new Date(
          nextQuarter.getFullYear(),
          nextQuarter.getMonth() + 1,
          0
        ).getDate()
      );
      return new Date(
        nextQuarter.getFullYear(),
        nextQuarter.getMonth(),
        endDay
      );
    }
    case "semi-annual": {
      const nextHalfYear = addMonths(startDate, 6);
      const endDay = Math.min(
        startDay - 1,
        new Date(
          nextHalfYear.getFullYear(),
          nextHalfYear.getMonth() + 1,
          0
        ).getDate()
      );
      return new Date(
        nextHalfYear.getFullYear(),
        nextHalfYear.getMonth(),
        endDay
      );
    }
    case "annual": {
      const nextYear = addMonths(startDate, 12);
      const endDay = Math.min(
        startDay - 1,
        new Date(nextYear.getFullYear(), nextYear.getMonth() + 1, 0).getDate()
      );
      return new Date(nextYear.getFullYear(), nextYear.getMonth(), endDay);
    }
    default:
      throw new Error("Invalid rent payment frequency");
  }
}

function isLastDayOfMonth(date: Date): boolean {
  const nextDay = new Date(date.getTime());
  nextDay.setDate(date.getDate() + 1);
  return nextDay.getMonth() !== date.getMonth();
}

function calculateFrequencyEndDateE(
  startDate: Date,
  frequency: string,
  isOriginalLastDay: boolean
): Date {
  let monthsToAdd: number;
  switch (frequency) {
    case "monthly":
      monthsToAdd = 1;
      break;
    case "quarterly":
      monthsToAdd = 3;
      break;
    case "semi-annual":
      monthsToAdd = 6;
      break;
    case "annual":
      monthsToAdd = 12;
      break;
    default:
      throw new Error("Invalid frequency");
  }

  const nextDate = addMonths(startDate, monthsToAdd);
  if (isOriginalLastDay) {
    nextDate.setMonth(nextDate.getMonth() + 1, 0);
  } else {
    const startDay = startDate.getDate();
    const lastDayOfNextMonth = new Date(
      nextDate.getFullYear(),
      nextDate.getMonth() + 1,
      0
    ).getDate();
    nextDate.setDate(Math.min(startDay, lastDayOfNextMonth));
  }
  return nextDate;
}

function generateEscalations(
  leasePeriod: [string, string],
  escalations: Escalation[]
): { date: string; percentage: number }[] {
  const results: { date: string; percentage: number }[] = [];
  const [leaseStart, leaseEnd] = leasePeriod;
  const leaseStartDate = new Date(leaseStart);
  const leaseEndDate = new Date(leaseEnd);

  escalations?.sort(
    (a, b) => new Date(a.dateRange).getTime() - new Date(b.dateRange).getTime()
  );

  escalations?.forEach((escalation, index) => {
    const escalationStart = new Date(escalation.dateRange);
    if (escalationStart < leaseStartDate || escalationStart > leaseEndDate)
      return;

    const isOriginalLastDay = isLastDayOfMonth(escalationStart);
    const nextEscalationStart =
      index + 1 < escalations.length
        ? new Date(escalations[index + 1].dateRange)
        : null;
    let currentDate = new Date(escalationStart);

    while (currentDate <= leaseEndDate) {
      if (nextEscalationStart && currentDate >= nextEscalationStart) {
        break;
      }

      results.push({
        date: formatDateToStr(currentDate),
        percentage: escalation.percentage,
      });

      const nextDate = calculateFrequencyEndDateE(
        currentDate,
        escalation.frequency,
        isOriginalLastDay
      );
      if (nextDate <= currentDate) {
        break;
      }
      currentDate = nextDate;
    }
  });

  return results;
}
export const calculateCurrentRent = (
  currentDate: Date,
  currentRent: number,
  escalations: { date: string; percentage: number }[],
  adhocEscalations: AdhocEscalation[],
  rentFreePeriods: RentFreePeriod[]
): number => {
  const formattedCurrentDate = formatDateToStr(currentDate);

  let updatedRent = currentRent;
  if (escalations && escalations.length > 0) {
    for (const escalation of escalations) {
      if (formattedCurrentDate >= escalation.date) {
        updatedRent *= 1 + escalation.percentage / 100;
      }
    }
  }

  if (adhocEscalations && adhocEscalations.length > 0) {
    for (const adhoc of adhocEscalations) {
      const [startDate, endDate] = adhoc.dateRange;
      if (
        formattedCurrentDate >= startDate &&
        formattedCurrentDate <= endDate
      ) {
        updatedRent = parseFloat(adhoc.amount);
      }
    }
  }

  if (rentFreePeriods && rentFreePeriods.length > 0) {
    for (const rentFree of rentFreePeriods) {
      const [startDate, endDate] = rentFree.dateRange;
      if (
        formattedCurrentDate >= startDate &&
        formattedCurrentDate <= endDate
      ) {
        const discount = parseFloat(rentFree?.percentage) / 100;
        return updatedRent * (1 - discount);
      }
    }
  }

  return updatedRent;
};

export function generateDailyRentArray(
  leaseData: LeaseDataUtils,
  escalations: Escalation[],
  adhocEscalations: AdhocEscalation[],
  rentFreePeriods: RentFreePeriod[]
): DailyRent[] {
  const { leasePeriod, leaseWorkingPeriod, rentPaymentFrequency, rentAmount } =
    leaseData;
  const [startDate, endDate] = leaseWorkingPeriod;
  const dailyRentArray: DailyRent[] = [];

  if (
    !leaseData ||
    !leasePeriod ||
    !rentPaymentFrequency ||
    rentAmount == null
  ) {
    return dailyRentArray;
  }

  //large period use for esclasion period
  const start1 = new Date(leasePeriod[0]);
  const end1 = new Date(leasePeriod[1]);
  const start2 = new Date(leaseWorkingPeriod[0]);
  const end2 = new Date(leaseWorkingPeriod[1]);
  const escalationPeriod: [string, string] = [
    start1 < start2 ? leasePeriod[0] : leaseWorkingPeriod[0],
    end1 > end2 ? leasePeriod[1] : leaseWorkingPeriod[1],
  ];

  const escalationDates =
    escalations?.[0]?.dateRange !== null
      ? generateEscalations(escalationPeriod, escalations)
      : [];

  // Sort escalations once here, to avoid sorting in the inner loop (calculateCurrentRent)
  // This guarantees exact same multiplication order as original logic
  escalationDates.sort((a, b) => a.date.localeCompare(b.date));

  let currentStartDate = parseISO(startDate);
  const leaseEndDate = parseISO(endDate);
  while (currentStartDate <= leaseEndDate) {
    const frequencyEndDate = calculateFrequencyEndDate(
      currentStartDate,
      rentPaymentFrequency
    );
    const actualEndDate =
      frequencyEndDate > leaseEndDate ? leaseEndDate : frequencyEndDate;

    const totalDaysInInterval =
      differenceInDays(frequencyEndDate, currentStartDate) + 1;
    const intervalDaysArray = eachDayOfInterval({
      start: currentStartDate,
      end: actualEndDate,
    });

    intervalDaysArray.forEach((day) => {
      const currentRent = calculateCurrentRent(
        day,
        rentAmount,
        escalationDates,
        adhocEscalations,
        rentFreePeriods
      );

      const dailyRentValue = currentRent / totalDaysInInterval;
      const localDate = formatDateToStr(day);
      dailyRentArray.push({
        date: localDate,
        rent: +dailyRentValue,
      });
    });

    currentStartDate = new Date(actualEndDate.getTime() + 86400000);
  }

  return dailyRentArray;
}
