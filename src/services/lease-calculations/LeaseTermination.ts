// @ts-nocheck
export const processLeaseTermination = async (
  leaseTerminationDate,
  updatedPVofRent,
  rentFrequencyData,
  rentPaymentType,
  dailyRentArray,
  isTransfer = false,
) => {
  const lastSecurityDeposit =
    updatedPVofRent.length > 0
      ? updatedPVofRent[updatedPVofRent.length - 1]["Security Deposit"] || 0
      : 0;

  const matchedPeriod = findRentFrequencyForDate(
    rentFrequencyData,
    leaseTerminationDate,
  );

  const updatedCarry = adjustRentForTermination(
    updatedPVofRent,
    leaseTerminationDate,
    matchedPeriod,
    rentPaymentType,
    dailyRentArray,
  );

  updatedPVofRent = updateLeaseLiabilityForMatchedPeriod(
    updatedCarry,
    matchedPeriod,
  );

  // Initialize financial calculations
  if (updatedPVofRent.length > 0) {
    updatedPVofRent[0]["Termination"] = null;
    updatedPVofRent[0]["Disposal"] = null;
    updatedPVofRent[0]["Disposal_PR"] = null;
    updatedPVofRent[0]["Profit (Loss) in Termination"] = null;
    updatedPVofRent[0]["securityDepositTransfer"] = null;
  }

  const leaseCloseDate = new Date(leaseTerminationDate);
  updatedPVofRent = updatedPVofRent.filter((entry) => {
    const entryDate = new Date(entry["Date"]);
    entryDate.setHours(0, 0, 0, 0);
    return entryDate <= leaseCloseDate;
  });

  for (let i = 1; i < updatedPVofRent.length; i++) {
    const entryDate = new Date(updatedPVofRent?.[i]?.["Date"]);
    const currentEntry = updatedPVofRent[i];
    const previousEntry = updatedPVofRent[i - 1];
    const interestOnLeaseLiability =
      previousEntry["Interest on lease liability"];

    if (isSameDate(entryDate, leaseCloseDate)) {
      const rentPayment = currentEntry["RentPayment"] || 0;
      const termination = -(
        previousEntry["Lease Liability"] +
        interestOnLeaseLiability -
        rentPayment
      );

      updatedPVofRent[i]["Termination"] = termination;
      const DepreciationCal =
        previousEntry["ROU"] - currentEntry["Depreciation"];
      const PrPaidRentCal =
        previousEntry["Pre-paid Rent"] - currentEntry["Dep on Prepaid Rent"];
      const disposal = -DepreciationCal;
      const disposal_PR = -PrPaidRentCal;
      updatedPVofRent[i]["Disposal_PR"] = disposal_PR; // disposal in prepaid rent
      updatedPVofRent[i]["Disposal"] = disposal;

      if (isTransfer) {
        // For transfer cases, use the current calculated security deposit balance
        const securityDepositValue =
          updatedPVofRent[i]["Security Deposit"] || 0;
        const securityDepositTransfer = -securityDepositValue;
        updatedPVofRent[i]["securityDepositTransfer"] = securityDepositTransfer;
        updatedPVofRent[i]["Security Deposit"] = 0;

        // New formula for Inter Unit (receivable) / Payable: (Assets Disposal) - (Liability Termination)
        // Note: disposal (ROU), disposal_PR (PR), securityDepositTransfer, and termination are negative write-offs
        updatedPVofRent[i]["Profit (Loss) in Termination"] =
          disposal + disposal_PR + securityDepositTransfer - termination;
      } else {
        // Existing termination logic
        updatedPVofRent[i]["Profit (Loss) in Termination"] =
          disposal + disposal_PR - termination;
        updatedPVofRent[i]["Interest Income on security deposit"] =
          lastSecurityDeposit - previousEntry["Security Deposit"];
        updatedPVofRent[i]["Security Deposit"] = lastSecurityDeposit;
      }

      updatedPVofRent[i]["Lease Liability"] = 0;
      updatedPVofRent[i]["ROU"] = 0;
      updatedPVofRent[i]["Pre-paid Rent"] = 0;
      break;
    }
  }
  return updatedPVofRent;
};

const isSameDate = (date1, date2) =>
  date1.getFullYear() === date2.getFullYear() &&
  date1.getMonth() === date2.getMonth() &&
  date1.getDate() === date2.getDate();

const findRentFrequencyForDate = (rentFrequencyData, terminationDate) => {
  const targetDate = new Date(terminationDate);
  targetDate.setHours(0, 0, 0, 0);

  return rentFrequencyData.find((period) => {
    const start = new Date(period.startDate);
    const end = new Date(period.endDate);
    const paymentDate = new Date(period.paymentDate);

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    paymentDate.setHours(0, 0, 0, 0);
    const maxPeriodEnd = new Date(
      Math.max(end.getTime(), paymentDate.getTime()),
    );

    return targetDate >= start && targetDate <= maxPeriodEnd;
  });
};
function calculateTerminationRent(
  { paymentDate, startDate, endDate },
  terminationDateStr,
  dailyRentArray,
) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const payment = new Date(paymentDate);
  const termination = new Date(terminationDateStr);
  let proRatedRent = 0;

  dailyRentArray.forEach((day) => {
    const dayDate = new Date(day.date);
    if (
      dayDate.getTime() >= start.getTime() &&
      dayDate.getTime() <= termination.getTime()
    ) {
      proRatedRent += day.rent;
    }
  });

  if (termination < start || termination > end) {
    return {
      action: "termination_outside_lease",
      proRatedRent: 0,
    };
  }

  if (termination.toDateString() === end.toDateString()) {
    return {
      action: "do_nothing",
      proRatedRent: 0,
    };
  }

  if (termination < payment) {
    return {
      action: "remove_advance_and_pro_rate",
      proRatedRent,
    };
  }

  if (termination >= payment) {
    return {
      action: "pro_rate_after_payment",
      proRatedRent,
    };
  }

  return {
    action: "unhandled",
    proRatedRent: 0,
  };
}

function calculateTerminationRentArrer(
  { paymentDate, startDate, endDate },
  terminationDateStr,
  dailyRentArray,
) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const termination = new Date(terminationDateStr);
  const paymentDay = new Date(paymentDate).getDate();
  const terminationDay = termination.getDate();

  // 1. Calculate rent owed up to termination date
  let rentOwed = 0;
  dailyRentArray.forEach((day) => {
    const dayDate = new Date(day.date);
    if (dayDate >= start && dayDate <= termination) {
      rentOwed += day.rent;
    }
  });

  if (terminationDay > paymentDay) {
    return {
      action: "remove_advance_and_pro_rate",
      proRatedRent: rentOwed,
    };
  }

  if (terminationDay <= paymentDay) {
    return {
      action: "pro_rate_after_payment",
      proRatedRent: rentOwed,
    };
  }

  return {
    action: "unhandled",
    proRatedRent: 0,
    dailyRent: 0,
  };
}

function adjustRentForTermination(
  carryArray,
  terminationDateStr,
  rentInfo,
  rentPaymentType,
  dailyRentArray,
) {
  const { paymentDate } = rentInfo;
  const paymentDateObj = new Date(paymentDate);
  const terminationDate = new Date(terminationDateStr);
  let decision;
  if (rentPaymentType === "Advance Payment") {
    decision = calculateTerminationRent(
      rentInfo,
      terminationDateStr,
      dailyRentArray,
    );
  } else {
    decision = calculateTerminationRentArrer(
      rentInfo,
      terminationDateStr,
      dailyRentArray,
    );
  }

  // Find payment date index
  const paymentIndex = carryArray.findIndex((item) => {
    const d = new Date(item.Date);
    return (
      d.getFullYear() === paymentDateObj.getFullYear() &&
      d.getMonth() === paymentDateObj.getMonth() &&
      d.getDate() === paymentDateObj.getDate()
    );
  });
  // Zero out payment on payment date if applicable
  if (decision.action === "do_nothing" || decision.action === "unhandled") {
    return carryArray;
  }

  // Zero out payment on payment date if applicable
  if (
    decision.action === "remove_advance_and_pro_rate" ||
    decision.action === "pro_rate_after_payment"
  ) {
    if (paymentIndex !== -1) {
      carryArray[paymentIndex].RentPayment = 0;
    }
  }

  // Insert pro-rated rent on termination date if applicable
  if (
    decision.action === "remove_advance_and_pro_rate" ||
    decision.action === "pro_rate_after_payment"
  ) {
    const terminationIndex = carryArray.findIndex((item) => {
      const d = new Date(item.Date);
      return (
        d.getFullYear() === terminationDate.getFullYear() &&
        d.getMonth() === terminationDate.getMonth() &&
        d.getDate() === terminationDate.getDate()
      );
    });

    if (terminationIndex !== -1) {
      carryArray[terminationIndex].RentPayment = decision.proRatedRent;
    }
  }

  return carryArray;
}

function updateLeaseLiabilityForMatchedPeriod(array, matchedPeriod) {
  if (!array || array.length === 0) return array;

  const formatDate = (date) => {
    const day = date.getDate().toString().padStart(2, "0");
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const startDate = new Date(matchedPeriod.startDate);
  const nextDay = new Date(startDate);
  nextDay.setDate(startDate.getDate() + 1);
  const targetDate = formatDate(nextDay);

  const startIndex = array.findIndex(
    (item) => item.Date.replace("Sept", "Sep") === targetDate,
  );
  if (startIndex === -1) return array;

  for (let i = startIndex; i < array.length; i++) {
    const prevLiability = parseFloat(array[i - 1]["Lease Liability"]) || 0;
    const currentInterest =
      parseFloat(array[i]["Interest on lease liability"]) || 0;
    const rentPayment = parseFloat(array[i]["RentPayment"]) || 0;

    array[i]["Lease Liability"] = prevLiability + currentInterest - rentPayment;
  }

  return array;
}
