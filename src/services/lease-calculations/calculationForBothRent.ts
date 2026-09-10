// @ts-nocheck
import {
  addDays,
  addMonths,
  differenceInDays,
  endOfMonth,
  getDaysInMonth,
  startOfMonth,
} from "date-fns";
import {
  calculateFrequencyEndDate,
  formatDateToStr,
} from "./CalculateDailyRent";

interface MonthlyRent {
  paymentDate: string;
  startDate: string;
  endDate: string;
  totalRent: number;
  subRentTotal: number;
}
interface DailyRent {
  date: string;
  rent: number;
}
export const calculateMonthlyRentAdvance = (
  data: DailyRent[],
  frequency: string,
  rentPaymentDay: number = 7,
  leaseWorkingPeriod: [string, string],
): MonthlyRent[] => {
  const monthlyRents: MonthlyRent[] = [];
  const startSubDate = new Date(leaseWorkingPeriod[0]);
  const endSubDate = new Date(leaseWorkingPeriod[1]);
  const isEndOfPeriod = rentPaymentDay === -1;

  let startDate = new Date(leaseWorkingPeriod[0]);
  let endDate = calculateFrequencyEndDate(startDate, frequency);
  let monthlyTotal = 0;
  let monthlySubTotal = 0;
  let paymentDate: Date | null = null;

  // Determine the first payment date
  if (isEndOfPeriod) {
    paymentDate = new Date(endDate);
  } else {
    const firstPaymentDate = new Date(startDate);
    const daysInMonth = getDaysInMonth(firstPaymentDate);
    const adjustedPaymentDay = Math.min(rentPaymentDay, daysInMonth);
    firstPaymentDate.setDate(adjustedPaymentDay);
    if (firstPaymentDate < startDate) {
      firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
    }
    paymentDate = firstPaymentDate;
  }

  for (let i = 0; i < data.length; i++) {
    const currentDate = new Date(data[i].date);
    monthlyTotal += data[i].rent;
    if (startSubDate <= currentDate && currentDate <= endSubDate) {
      monthlySubTotal += data[i].rent;
    }

    if (currentDate >= endDate) {
      monthlyRents.push({
        paymentDate: formatDateToStr(paymentDate),
        startDate: formatDateToStr(startDate),
        endDate: formatDateToStr(endDate),
        totalRent: monthlyTotal,
        subRentTotal: monthlySubTotal,
      });
      // Move to the next period
      startDate = new Date(endDate.getTime() + 86400000);
      endDate = calculateFrequencyEndDate(startDate, frequency);

      if (isEndOfPeriod) {
        paymentDate = new Date(endDate);
      } else {
        paymentDate = new Date(startDate);
        if (getDaysInMonth(paymentDate) >= rentPaymentDay) {
          const daysInMonth = getDaysInMonth(paymentDate);
          const adjustedPaymentDay = Math.min(rentPaymentDay, daysInMonth);
          paymentDate.setDate(adjustedPaymentDay);
        } else {
          paymentDate.setDate(getDaysInMonth(paymentDate));
        }
        if (paymentDate < startDate) {
          paymentDate.setMonth(paymentDate.getMonth() + 1);
        }
      }
      monthlyTotal = 0;
      monthlySubTotal = 0;
    }
  }

  if (monthlyTotal > 0) {
    if (isEndOfPeriod) {
      let paymentDate = new Date(endDate);
      if (paymentDate.getTime() >= new Date(endSubDate).getTime()) {
        paymentDate = new Date(endSubDate);
      }
      monthlyRents.push({
        paymentDate: formatDateToStr(paymentDate),
        startDate: formatDateToStr(startDate),
        endDate: formatDateToStr(endDate),
        totalRent: monthlyTotal,
        subRentTotal: monthlySubTotal,
      });
    } else {
      let paymentDate = new Date(endDate);
      const rentPayDate = paymentDate.setDate(rentPaymentDay);
      if (paymentDate.getTime() >= new Date(rentPayDate).getTime()) {
        paymentDate = new Date(rentPayDate);
      }
      if (paymentDate.getTime() >= new Date(endSubDate).getTime()) {
        paymentDate = new Date(endSubDate);
      }
      monthlyRents.push({
        paymentDate: formatDateToStr(paymentDate),
        startDate: formatDateToStr(startDate),
        endDate: formatDateToStr(endDate),
        totalRent: monthlyTotal,
        subRentTotal: monthlySubTotal,
      });
    }
  }

  return monthlyRents;
};

export const calculateMonthlyRentRegular = (
  data: DailyRent[],
  frequency: string,
  rentPaymentDay: number = 7,
  leaseWorkingPeriod: [string, string],
): MonthlyRent[] => {
  const monthlyRents: MonthlyRent[] = [];
  const startSubDate = new Date(leaseWorkingPeriod[0]);
  const endSubDate = new Date(leaseWorkingPeriod[1]);
  const isEndOfPeriod = rentPaymentDay === -1;

  let startDate = new Date(leaseWorkingPeriod[0]);
  let endDate = calculateFrequencyEndDate(startDate, frequency);
  let monthlyTotal = 0;
  let monthlySubTotal = 0;

  for (let i = 0; i < data.length; i++) {
    const currentDate = new Date(data[i].date);
    monthlyTotal += data[i].rent;
    if (startSubDate <= currentDate && currentDate <= endSubDate) {
      monthlySubTotal += data[i].rent;
    }

    if (currentDate > endDate) {
      let paymentDate: Date;
      if (isEndOfPeriod) {
        // Use end of period as payment date
        paymentDate = new Date(endDate);
      } else {
        paymentDate = new Date(endDate);
        if (getDaysInMonth(paymentDate) >= rentPaymentDay) {
          const daysInMonth = getDaysInMonth(paymentDate);
          const adjustedPaymentDay = Math.min(rentPaymentDay, daysInMonth);
          paymentDate.setDate(adjustedPaymentDay);
        } else {
          paymentDate.setDate(getDaysInMonth(paymentDate));
        }
        if (paymentDate.getTime() <= new Date(endDate).getTime()) {
          paymentDate = addMonth(paymentDate);
          const daysInMonth = getDaysInMonth(paymentDate);
          const adjustedPaymentDay = Math.min(rentPaymentDay, daysInMonth);
          paymentDate.setDate(adjustedPaymentDay);
          if (paymentDate.getTime() >= new Date(endSubDate).getTime()) {
            paymentDate = new Date(endSubDate);
          }
        }
      }

      if (
        currentDate.getTime() === new Date(endSubDate).getTime() ||
        paymentDate.getTime() >= new Date(endSubDate).getTime()
      ) {
        paymentDate = new Date(endSubDate);
      }

      monthlyRents.push({
        paymentDate: formatDateToStr(paymentDate),
        startDate: formatDateToStr(startDate),
        endDate: formatDateToStr(endDate),
        totalRent: monthlyTotal,
        subRentTotal: monthlySubTotal,
      });

      startDate = new Date(endDate.getTime() + 86400000);
      endDate = calculateFrequencyEndDate(startDate, frequency);
      monthlyTotal = 0;
      monthlySubTotal = 0;
    }
  }
  if (monthlyTotal > 0) {
    let paymentDate = new Date(endDate);
    if (paymentDate.getTime() >= new Date(endSubDate).getTime()) {
      paymentDate = new Date(endSubDate);
    }
    monthlyRents.push({
      paymentDate: formatDateToStr(paymentDate),
      startDate: formatDateToStr(startDate),
      endDate: formatDateToStr(endDate),
      totalRent: monthlyTotal,
      subRentTotal: monthlySubTotal,
    });
  }
  return monthlyRents;
};

const addMonth = (date: Date): Date => {
  const startOfCurrentMonth = startOfMonth(date);
  const startOfNextMonth = startOfMonth(addMonths(date, 1));
  const daysDifference = differenceInDays(date, startOfCurrentMonth);
  const newDate = addDays(startOfNextMonth, daysDifference);
  const endOfNextMonth = endOfMonth(startOfNextMonth);
  return newDate > endOfNextMonth ? endOfNextMonth : newDate;
};
