// @ts-nocheck
import dayjs, { Dayjs } from "dayjs";
import utc from "dayjs/plugin/utc";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
dayjs.extend(utc);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
interface LeaseSummaryInput {
  openingLeaseObject?: any;
  additionLeaseObject?: any;
  lastRowData: any;
  leaseFilterData: any[];
  sumLeaseOfData: any;
  originalCalculation: any[];
  dateRange?: [Dayjs, Dayjs];
  PeriodOfReport: string;
  LessorName: string;
  natureOfLease: string;
  leaseWorkingPeriod: string;
  LeaseStatus: string;
  LatestInterestFromLease: number;
  originalSecurityDeposit: number;
  LeasePeriodInDays: number;
  firstVersionLease?: any;
  dateOfSDClosure?: string;
  otherLeaseInformations?: {
    extensionOption: boolean;
    terminationOption: boolean;
    purchaseOption: boolean;
  };
  userName?: string;
  iuStatus?: string;
  activeLease?: any;
}

export const generateLeaseSummary = ({
  openingLeaseObject,
  additionLeaseObject,
  lastRowData,
  leaseFilterData,
  sumLeaseOfData,
  originalCalculation,
  dateRange,
  PeriodOfReport,
  LessorName,
  natureOfLease,
  leaseWorkingPeriod,
  LeaseStatus,
  LatestInterestFromLease,
  originalSecurityDeposit,
  LeasePeriodInDays,
  firstVersionLease,
  dateOfSDClosure,
  otherLeaseInformations,
  userName,
  activeLease,
}: LeaseSummaryInput) => {
  const sumUpToTargetDate = (data: any[], targetDate: Dayjs, key: string) => {
    if (!targetDate) return 0;

    const targetTimestamp = targetDate.startOf("day").valueOf();

    return data.reduce((sum, item) => {
      // Use pre-computed timestamp if available for performance
      if (item._parsedDateTimestamp !== undefined) {
        if (item._parsedDateTimestamp <= targetTimestamp) {
          const value = Number(item[key]) || 0;
          return sum + value;
        }
        return sum;
      }

      // Fallback if not pre-parsed
      const fixedDateStr = item.Date?.replace("Sept", "Sep");
      const itemDate = dayjs(fixedDateStr, "DD-MMM-YYYY").startOf("day");

      if (itemDate.isSameOrBefore(targetDate.startOf("day"))) {
        const value = Number(item[key]) || 0;
        return sum + value;
      }
      return sum;
    }, 0);
  };

  const reportingStart = dateRange?.[0];
  const reportingEnd = dateRange?.[1];

  const isWithinReportingPeriod = (dateStr?: string) => {
    if (!dateStr || !reportingStart || !reportingEnd) return false;
    const date = dayjs(dateStr).startOf("day");
    const start = dayjs(reportingStart).startOf("day");
    const end = dayjs(reportingEnd).startOf("day");
    return (
      (date.isSame(start) || date.isAfter(start)) &&
      (date.isSame(end) || date.isBefore(end))
    );
  };

  const getValueWithYearAdjustment = (
    data,
    originalDate,
    key,
    addYears = 0,
  ) => {
    if (!data || data.length <= 0) return 0;
    if (!originalDate) return 0;

    try {
      let adjustedDate = dayjs(originalDate, "DD-MMM-YYYY")
        .add(addYears, "year")
        .format("DD-MMM-YYYY");

      // Simple & fast Sep → Sept fix
      if (adjustedDate.includes("Sep")) {
        adjustedDate = adjustedDate.replace(/\bSep\b/, "Sept");
      }

      const entry = data.find((item) => item.Date === adjustedDate);
      if (!entry) return 0;

      return entry[key] ?? 0;
    } catch (error) {
      console.warn("Error in getValueWithYearAdjustment:", error);
      return 0;
    }
  };

  function getValueAsOnDate(
    data: any[],
    targetDate: string | Dayjs,
    key: string,
  ): number {
    const formattedTarget = dayjs(targetDate).format("DD-MMM-YYYY");

    const row = data.find((record) => {
      // Use pre-computed formatted date if available
      if (record._parsedDateFormatted) {
        return record._parsedDateFormatted === formattedTarget;
      }

      // Normalize month names (Sept → Sep)
      let cleanedDateStr = record.Date;
      if (cleanedDateStr?.includes("Sept")) {
        cleanedDateStr = cleanedDateStr.replace("Sept", "Sep");
      }

      const recordDate = dayjs(cleanedDateStr, "DD-MMM-YYYY").format(
        "DD-MMM-YYYY",
      );

      return recordDate === formattedTarget;
    });

    return row ? Number(row[key]) || 0 : 0;
  }

  function ContractualSumBetweenDates(
    data: any[],
    startDate: Dayjs,
    endDate: Dayjs,
    key: string,
  ): number {
    if (!startDate || !endDate) return 0;

    const startTimestamp = dayjs(startDate).startOf("day").valueOf();
    const endTimestamp = dayjs(endDate).startOf("day").valueOf();

    return data.reduce((sum, item) => {
      if (item._parsedDateTimestamp !== undefined) {
        if (item._parsedDateTimestamp >= startTimestamp && item._parsedDateTimestamp <= endTimestamp) {
          const value = Number(item[key]) || 0;
          return sum + value;
        }
        return sum;
      }

      // Fallback
      const fixedDateStr = item.Date?.replace("Sept", "Sep");
      const itemDate = dayjs(fixedDateStr, "DD-MMM-YYYY").startOf("day");

      if (
        (itemDate.isSame(startDate.startOf("day")) || itemDate.isAfter(startDate.startOf("day"))) &&
        (itemDate.isSame(endDate.startOf("day")) || itemDate.isBefore(endDate.startOf("day")))
      ) {
        const value = Number(item[key]) || 0;
        return sum + value;
      }

      return sum;
    }, 0);
  }

  const isIUTransferred = LeaseStatus?.toLowerCase().includes("transferred");

  // Lease Liability calculations
  const OpeningLeaseLiability = openingLeaseObject
    ? openingLeaseObject?.["Lease Liability"]
    : 0;
  const AdditionLeaseLiability =
    additionLeaseObject && activeLease?.iuStatus !== "IU Received"
      ? additionLeaseObject?.["Lease Liability"] +
        additionLeaseObject?.["RentPayment"] // payment add in lease addition
      : 0;

  const Termination = lastRowData["Termination"] || 0;
  // flag to check termination
  const isTerminationActive =
    LeaseStatus?.toLowerCase().includes("terminated") ||
    LeaseStatus?.toLowerCase().includes("transferred");

  const terminationTransferLeaseLiability = isIUTransferred ? Termination : 0;

  let iuTransferredLeaseLiability = 0;
  if (
    isIUTransferred &&
    isWithinReportingPeriod(activeLease?.dateOfIUTransfer)
  ) {
    iuTransferredLeaseLiability =
      activeLease?.iuTransferData?.leaseLiability || 0;
  } else if (
    activeLease?.iuStatus === "IU Received" &&
    isWithinReportingPeriod(activeLease?.dateOfIUReceived)
  ) {
    iuTransferredLeaseLiability = -(
      activeLease?.iuTransferData?.leaseLiability || 0
    );
  }

  // flag to check closed status (from API)
  const isClosedStatus =
    LeaseStatus?.toLowerCase().includes("closed") || isIUTransferred;

  const ModificationInLeaseLiability =
    sumLeaseOfData["Modification of Lease Liability"] || 0;
  const InterestOnLeaseLiability =
    sumLeaseOfData["Interest on lease liability"] || 0;
  const RentPaid = -sumLeaseOfData["RentPayment"] || 0;

  const ClosingLeaseLiability =
    isIUTransferred || isClosedStatus || isTerminationActive
      ? 0
      : lastRowData["Lease Liability"];

  const closingDate = dateRange?.[1];
  const NonCurrentLeaseLiability =
    isTerminationActive || isIUTransferred
      ? 0
      : closingDate
        ? getValueWithYearAdjustment(
            originalCalculation,
            closingDate,
            "Lease Liability",
            1,
          )
        : 0;

  const CurrentLeaseLiability =
    parseFloat(ClosingLeaseLiability) -
    (parseFloat(NonCurrentLeaseLiability) || 0);
  const RentPaidTillReportingPeriod = closingDate
    ? firstVersionLease?.rentPaidBeginningTillCutOffDate
      ? -sumUpToTargetDate(originalCalculation, closingDate, "RentPayment") -
        firstVersionLease?.rentPaidBeginningTillCutOffDate
      : -sumUpToTargetDate(originalCalculation, closingDate, "RentPayment")
    : 0;
  const InterestOnLeaseLiabilityTillReportingPeriod = closingDate
    ? sumUpToTargetDate(
        originalCalculation,
        closingDate,
        "Interest on lease liability",
      ) + (firstVersionLease?.interestExpenseBeginningTillCutOffDate || 0)
    : 0;

  // Lease Liability Check
  const CheckLLSum =
    (Number(OpeningLeaseLiability) || 0) +
    (Number(AdditionLeaseLiability) || 0) +
    (isIUTransferred
      ? Number(terminationTransferLeaseLiability) || 0
      : Number(Termination) || 0) +
    (activeLease?.iuStatus === "IU Received"
      ? iuTransferredLeaseLiability
      : 0) +
    (Number(ModificationInLeaseLiability) || 0) +
    (Number(InterestOnLeaseLiability) || 0) +
    (Number(RentPaid) || 0);
  const CheckLL = CheckLLSum - (Number(ClosingLeaseLiability) || 0);

  // ROU Gross Block Movement
  const startDate: Dayjs | null | undefined = dateRange?.[0];

  const targetDate: Dayjs | null = startDate
    ? startDate.subtract(1, "day")
    : null;

  const OpeningROUGrossBlock = openingLeaseObject
    ? firstVersionLease?.agreementBeginningROU
      ? firstVersionLease?.agreementBeginningROU +
        (firstVersionLease?.modificationAdjustmentInROUWithProspective || 0) +
        (targetDate
          ? sumUpToTargetDate(
              originalCalculation,
              targetDate,
              "Modification of ROU",
            )
          : 0)
      : originalCalculation?.[0]?.["ROU"] +
        (targetDate
          ? sumUpToTargetDate(
              originalCalculation,
              targetDate,
              "Modification of ROU",
            )
          : 0)
    : 0;
  const AdditionROU =
    additionLeaseObject && activeLease?.iuStatus !== "IU Received"
      ? Number(originalCalculation?.[0]?.["ROU"] || 0)
      : 0;
  const ModificationInROU = sumLeaseOfData["Modification of ROU"] || 0;

  // Calculate base closing ROU Gross Block (before any disposal adjustments)
  const BaseClosingROUGrossBlock =
    (Number(OpeningROUGrossBlock) || 0) +
    (Number(AdditionROU) || 0) +
    (Number(ModificationInROU) || 0);

  // Disposal for ROU Gross Block
  // For termination: negative of (Opening + Addition + Modification)
  // For closed: negative of calculated closing (which is the same value)
  const isActuallyTransferred = isIUTransferred;
  const Disposal =
    isTerminationActive || isClosedStatus ? -BaseClosingROUGrossBlock : 0;

  const disposalTransferROU = isActuallyTransferred
    ? BaseClosingROUGrossBlock
    : 0;

  let iuTransferredROUGrossBlock = 0;
  if (
    isActuallyTransferred &&
    isWithinReportingPeriod(activeLease?.dateOfIUTransfer)
  ) {
    iuTransferredROUGrossBlock =
      activeLease?.iuTransferData?.rouGrossBlock || 0;
  } else if (
    activeLease?.iuStatus === "IU Received" &&
    isWithinReportingPeriod(activeLease?.dateOfIUReceived)
  ) {
    iuTransferredROUGrossBlock = -(
      activeLease?.iuTransferData?.rouGrossBlock || 0
    );
  }

  // Final Closing ROU Gross Block (0 if terminated or closed)
  const ClosingROUGrossBlock =
    isTerminationActive || isClosedStatus
      ? 0
      : BaseClosingROUGrossBlock +
        (activeLease?.iuStatus === "IU Received"
          ? iuTransferredROUGrossBlock
          : 0);

  // ROU Accumulated Depreciation Movement
  const OpeningROUAccumlatedDepreciation = targetDate
    ? firstVersionLease?.depreciationExpenseTillCutOffDate
      ? firstVersionLease?.depreciationExpenseTillCutOffDate +
        sumUpToTargetDate(originalCalculation, targetDate, "Depreciation")
      : sumUpToTargetDate(originalCalculation, targetDate, "Depreciation")
    : 0;
  const DepreciationOfthePeriod = sumLeaseOfData["Depreciation"];

  // Calculate base closing ROU Accumulated Depreciation (before disposal adjustments)
  const BaseClosingROUAccumlatedDepreciation =
    (Number(OpeningROUAccumlatedDepreciation) || 0) +
    (Number(DepreciationOfthePeriod) || 0);

  // Disposal Accumulated Depreciation
  // For termination: negative of (Opening + Depreciation for period)
  // For closed: negative of calculated closing (same value)
  const DisposalAccumlatedDepreciation =
    isTerminationActive || isClosedStatus
      ? -BaseClosingROUAccumlatedDepreciation
      : 0;

  let iuTransferredROUAccumulatedDepreciation = 0;
  if (
    isActuallyTransferred &&
    isWithinReportingPeriod(activeLease?.dateOfIUTransfer)
  ) {
    iuTransferredROUAccumulatedDepreciation =
      activeLease?.iuTransferData?.rouAccumulatedDepreciation || 0;
  } else if (
    activeLease?.iuStatus === "IU Received" &&
    isWithinReportingPeriod(activeLease?.dateOfIUReceived)
  ) {
    iuTransferredROUAccumulatedDepreciation = -(
      activeLease?.iuTransferData?.rouAccumulatedDepreciation || 0
    );
  }

  // Final Closing ROU Accumulated Depreciation (0 if terminated or closed)
  const ClosingROUAccumlatedDepreciation =
    isTerminationActive || isClosedStatus
      ? 0
      : BaseClosingROUAccumlatedDepreciation +
        (activeLease?.iuStatus === "IU Received"
          ? iuTransferredROUAccumulatedDepreciation
          : 0);

  // ROU Written Down Value

  const OpeningWDV = targetDate
    ? getValueAsOnDate(originalCalculation, targetDate, "ROU")
    : 0;

  // const closing = dayjs(targetDate).add(1, "year");  COMMENTED

  const ClosingWDV =
    isTerminationActive || isClosedStatus
      ? lastRowData?.["ROU"]
      : getValueAsOnDate(originalCalculation, dayjs(closingDate), "ROU");

  // Check ROU (should be zero)
  const CheckROU_1 =
    Number(OpeningROUGrossBlock) -
    Number(OpeningROUAccumlatedDepreciation) -
    Number(OpeningWDV);

  const CheckROU_2_Sum =
    (Number(OpeningROUGrossBlock) || 0) +
    (Number(AdditionROU) || 0) +
    (Number(ModificationInROU) || 0) +
    (isIUTransferred
      ? Number(iuTransferredROUGrossBlock) || 0
      : activeLease?.iuStatus === "IU Received"
        ? Math.abs(iuTransferredROUGrossBlock)
        : Number(Disposal) || 0);

  const CheckROU_2_AD_Sum =
    (Number(OpeningROUAccumlatedDepreciation) || 0) +
    (Number(DepreciationOfthePeriod) || 0) +
    (isIUTransferred
      ? Number(iuTransferredROUAccumulatedDepreciation) || 0
      : activeLease?.iuStatus === "IU Received"
        ? Math.abs(iuTransferredROUAccumulatedDepreciation)
        : Number(DisposalAccumlatedDepreciation) || 0);

  const CheckROU_2 =
    CheckROU_2_Sum - CheckROU_2_AD_Sum - (Number(ClosingWDV) || 0);

  // Prepaid Rent Movement
  const OpeningPrepaidRentGrossBlock = openingLeaseObject
    ? firstVersionLease?.agreementBeginningPrepaidRent
      ? firstVersionLease?.agreementBeginningPrepaidRent
      : originalCalculation?.[0]?.["Pre-paid Rent"] || 0
    : 0;
  const AdditionPrepaidRent =
    additionLeaseObject && activeLease?.iuStatus !== "IU Received"
      ? originalCalculation?.[0]?.["Pre-paid Rent"]
      : 0;

  // Calculate base closing Prepaid Rent Gross Block (before disposal adjustments)
  const BaseClosingPrepaidRentGrossBlock =
    (Number(OpeningPrepaidRentGrossBlock) || 0) +
    (Number(AdditionPrepaidRent) || 0);

  // Disposal for Prepaid Rent
  // For termination: negative of (Opening + Addition)
  // For closed: negative of calculated closing (same value)
  const disposalInPR =
    isTerminationActive || isClosedStatus
      ? -BaseClosingPrepaidRentGrossBlock
      : 0;

  const disposalTransferPR = isIUTransferred
    ? BaseClosingPrepaidRentGrossBlock || 0
    : 0;

  let iuTransferredPRGrossBlock = 0;
  if (
    isActuallyTransferred &&
    isWithinReportingPeriod(activeLease?.dateOfIUTransfer)
  ) {
    iuTransferredPRGrossBlock = activeLease?.iuTransferData?.prepaidRent || 0;
  } else if (
    activeLease?.iuStatus === "IU Received" &&
    isWithinReportingPeriod(activeLease?.dateOfIUReceived)
  ) {
    iuTransferredPRGrossBlock = -(
      activeLease?.iuTransferData?.prepaidRent || 0
    );
  }

  // Final Closing Prepaid Rent Gross Block (0 if terminated or closed)
  const ClosingPrepaidRentGrossBlock =
    isTerminationActive || isClosedStatus
      ? 0
      : BaseClosingPrepaidRentGrossBlock +
        (activeLease?.iuStatus === "IU Received"
          ? iuTransferredPRGrossBlock
          : 0);

  const OpeningAccumlatedDepreciationOfPrepaidRent = targetDate
    ? firstVersionLease?.depreciationExpenseOnPRTillCutOffDate
      ? firstVersionLease?.depreciationExpenseOnPRTillCutOffDate +
        sumUpToTargetDate(
          originalCalculation,
          targetDate,
          "Dep on Prepaid Rent",
        )
      : sumUpToTargetDate(
          originalCalculation,
          targetDate,
          "Dep on Prepaid Rent",
        )
    : 0;
  const DepreciationOnPR = sumLeaseOfData["Dep on Prepaid Rent"];

  // Calculate base closing Accumulated Depreciation of Prepaid Rent (before disposal adjustments)
  const BaseClosingAccumlatedDepreciationOfPrepaidRent =
    (Number(OpeningAccumlatedDepreciationOfPrepaidRent) || 0) +
    (Number(DepreciationOnPR) || 0);

  // Disposal Accumulated Depreciation of Prepaid Rent
  // For termination: negative of (Opening + Depreciation for period)
  // For closed: negative of calculated closing (same value)
  const DisposalAccumlatedDepreciationPR =
    isTerminationActive || isClosedStatus
      ? -BaseClosingAccumlatedDepreciationOfPrepaidRent
      : 0;

  let iuTransferredPRAccumulatedDepreciation = 0;
  if (
    isActuallyTransferred &&
    isWithinReportingPeriod(activeLease?.dateOfIUTransfer)
  ) {
    iuTransferredPRAccumulatedDepreciation =
      activeLease?.iuTransferData?.prepaidRentAD || 0;
  } else if (
    activeLease?.iuStatus === "IU Received" &&
    isWithinReportingPeriod(activeLease?.dateOfIUReceived)
  ) {
    iuTransferredPRAccumulatedDepreciation = -(
      activeLease?.iuTransferData?.prepaidRentAD || 0
    );
  }

  // Final Closing Accumulated Depreciation of Prepaid Rent (0 if terminated or closed)
  const ClosingAccumlatedDepreciationOfPrepaidRent =
    isTerminationActive || isClosedStatus
      ? 0
      : BaseClosingAccumlatedDepreciationOfPrepaidRent +
        (activeLease?.iuStatus === "IU Received"
          ? iuTransferredPRAccumulatedDepreciation
          : 0);

  // Prepaid Rent Written Down value
  const OpeningWDV_PR = targetDate
    ? getValueAsOnDate(originalCalculation, targetDate, "Pre-paid Rent")
    : 0;
  const ClosingWDV_PR = closingDate
    ? getValueAsOnDate(originalCalculation, closingDate, "Pre-paid Rent")
    : 0;

  // Check (should be zero)
  const CheckPR_1 =
    OpeningPrepaidRentGrossBlock -
    OpeningAccumlatedDepreciationOfPrepaidRent -
    (OpeningWDV_PR || 0);

  const CheckPR_2_Sum =
    (Number(OpeningPrepaidRentGrossBlock) || 0) +
    (Number(AdditionPrepaidRent) || 0) +
    (isIUTransferred
      ? Number(iuTransferredPRGrossBlock) || 0
      : activeLease?.iuStatus === "IU Received"
        ? Math.abs(iuTransferredPRGrossBlock)
        : Number(disposalInPR) || 0);

  const CheckPR_2_AD_Sum =
    (Number(OpeningAccumlatedDepreciationOfPrepaidRent) || 0) +
    (Number(DepreciationOnPR) || 0) +
    (isIUTransferred
      ? Number(iuTransferredPRAccumulatedDepreciation) || 0
      : activeLease?.iuStatus === "IU Received"
        ? Math.abs(iuTransferredPRAccumulatedDepreciation)
        : Number(DisposalAccumlatedDepreciationPR) || 0);

  const CheckPR_2 =
    CheckPR_2_Sum - CheckPR_2_AD_Sum - (Number(ClosingWDV_PR) || 0);

  // Security Deposit Movement
  const UndiscountedSecurityDepositOnLease = originalSecurityDeposit;
  let OpeningSecurityDeposit = openingLeaseObject
    ? openingLeaseObject?.["Security Deposit"]
    : 0;
  const AdditionSecurityDeposit =
    additionLeaseObject && activeLease?.iuStatus !== "IU Received"
      ? additionLeaseObject?.["Security Deposit"]
      : 0;
  const UnwindingInterestOnSD =
    sumLeaseOfData["Interest Income on security deposit"];
  const ClosingSecurityDeposit = lastRowData["Security Deposit"];

  const UnwindingOfInterestTillReportingPeriod = closingDate
    ? firstVersionLease?.interestIncomeOnSDfromAgreementBeginningTillCutoffDate
      ? firstVersionLease?.interestIncomeOnSDfromAgreementBeginningTillCutoffDate +
        sumUpToTargetDate(
          originalCalculation,
          closingDate,
          "Interest Income on security deposit",
        )
      : sumUpToTargetDate(
          originalCalculation,
          closingDate,
          "Interest Income on security deposit",
        )
    : 0;

  // Calculate Paid Security Deposit (negative of closing SD when terminated)
  let PaidSecurityDeposit = 0;
  const isSDClosedInPeriod =
    dateOfSDClosure && closingDate
      ? closingDate.isSameOrAfter(dayjs(dateOfSDClosure), "day")
      : false;

  if (isTerminationActive || isClosedStatus || isSDClosedInPeriod) {
    if (
      isIUTransferred &&
      lastRowData["securityDepositTransfer"] !== undefined &&
      lastRowData["securityDepositTransfer"] !== null
    ) {
      PaidSecurityDeposit = 0; // It will be shown in securityDepositTransfer instead
    } else {
      PaidSecurityDeposit = -(Number(ClosingSecurityDeposit) || 0);
    }
  }
  // when reproting period is after the date of SD closure
  if (isSDClosedInPeriod && startDate && startDate.isAfter(dateOfSDClosure)) {
    PaidSecurityDeposit = 0;
    OpeningSecurityDeposit = 0;
  }

  // Final Closing Security Deposit (set to 0 when terminated)
  const FinalClosingSecurityDeposit =
    isTerminationActive || isClosedStatus || isSDClosedInPeriod
      ? 0
      : ClosingSecurityDeposit;

  // Check SD (should be zero)
  const CheckSDSum =
    (Number(OpeningSecurityDeposit) || 0) +
    (Number(AdditionSecurityDeposit) || 0) +
    (Number(UnwindingInterestOnSD) || 0) +
    (Number(PaidSecurityDeposit) || 0) +
    (activeLease?.iuStatus === "IU Received"
      ? Math.abs(activeLease?.iuTransferData?.securityDeposit || 0)
      : activeLease?.iuTransferData?.securityDeposit || 0);
  const CheckSD = CheckSDSum - (Number(FinalClosingSecurityDeposit) || 0);

  let securityDepositTransfer = 0;
  if (
    isIUTransferred &&
    isWithinReportingPeriod(activeLease?.dateOfIUTransfer)
  ) {
    securityDepositTransfer = activeLease?.iuTransferData?.securityDeposit || 0;
  } else if (
    activeLease?.iuStatus === "IU Received" &&
    isWithinReportingPeriod(activeLease?.dateOfIUReceived)
  ) {
    securityDepositTransfer = -(
      activeLease?.iuTransferData?.securityDeposit || 0
    );
  }

  // Gain / (Loss) on Modification
  const ProfitLossonModification = leaseFilterData
    ?.filter((entry) => entry["Profit (Loss) in Modification"] !== undefined)
    .reduce(
      (sum, entry) => sum + Number(entry["Profit (Loss) in Modification"]),
      0,
    );
  const ProfitLossonTermination = leaseFilterData
    ?.filter((entry) => entry["Profit (Loss) in Termination"] !== undefined)
    .reduce(
      (sum, entry) => sum + Number(entry["Profit (Loss) in Termination"]),
      0,
    );

  let InterUnitReceivablePayable = 0;
  if (
    isIUTransferred &&
    isWithinReportingPeriod(activeLease?.dateOfIUTransfer)
  ) {
    InterUnitReceivablePayable =
      activeLease?.iuTransferData?.interUnitReceivablePayable || 0;
  } else if (
    activeLease?.iuStatus === "IU Received" &&
    isWithinReportingPeriod(activeLease?.dateOfIUReceived)
  ) {
    InterUnitReceivablePayable = -(
      activeLease?.iuTransferData?.interUnitReceivablePayable || 0
    );
  }

  // Contractual maturities of lease liabilities on an undiscounted basis

  // 1. Rent within 1 year from reporting date
  const oneYearStart = dateRange?.[1]?.add(1, "day"); // 01-06-YYYY
  const oneYearEnd = dateRange?.[1]?.add(1, "year"); // 31-05-(YYYY+1)
  const RentPaidWithin1yearFromReportingDate =
    oneYearStart && oneYearEnd
      ? ContractualSumBetweenDates(
          originalCalculation,
          oneYearStart,
          oneYearEnd,
          "RentPayment",
        )
      : 0;

  // 2. Rent from year 2 to year 5 (separate yearly buckets)
  // Year 2 (1–2 years)
  const year2Start = oneYearEnd?.add(1, "day");
  const year2End = oneYearEnd?.add(1, "year");

  // Year 3 (2–3 years)
  const year3Start = year2End?.add(1, "day");
  const year3End = year2End?.add(1, "year");

  // Year 4 (3–4 years)
  const year4Start = year3End?.add(1, "day");
  const year4End = year3End?.add(1, "year");

  // Year 5 (4–5 years)
  const year5Start = year4End?.add(1, "day");
  const year5End = year4End?.add(1, "year");

  const year2Value =
    year2Start && year2End
      ? ContractualSumBetweenDates(
          originalCalculation,
          year2Start,
          year2End,
          "RentPayment",
        )
      : 0;
  const year3Value =
    year3Start && year3End
      ? ContractualSumBetweenDates(
          originalCalculation,
          year3Start,
          year3End,
          "RentPayment",
        )
      : 0;
  const year4Value =
    year4Start && year4End
      ? ContractualSumBetweenDates(
          originalCalculation,
          year4Start,
          year4End,
          "RentPayment",
        )
      : 0;
  const year5Value =
    year5Start && year5End
      ? ContractualSumBetweenDates(
          originalCalculation,
          year5Start,
          year5End,
          "RentPayment",
        )
      : 0;

  // 3. Rent after 5 years, starting after year 5 end
  const afterFiveStart = year5End?.add(1, "day");
  const afterFiveEnd = dayjs(
    originalCalculation?.[originalCalculation.length - 1]?.["Date"],
    "DD-MMM-YYYY",
  ); // Lease actual end date

  const RentPaidWithinAfter5yearFromReportingDate =
    afterFiveStart && afterFiveEnd
      ? ContractualSumBetweenDates(
          originalCalculation,
          afterFiveStart,
          afterFiveEnd,
          "RentPayment",
        )
      : 0;

  const EffectiveInterestRateForLeaseLiabilities = LatestInterestFromLease;

  const LeasePeriodInYears = LeasePeriodInDays / 365;

  const leaseEndDateStr = leaseWorkingPeriod.includes(" to ")
    ? leaseWorkingPeriod.split(" to ")[1]
    : leaseWorkingPeriod;
  const reportingDate = dateRange?.[1];
  const leaseEndDate = dayjs(leaseEndDateStr, "DD-MMM-YYYY");
  let remainingLeasePeriodYears = 0;

  if (reportingDate && leaseEndDate.isValid()) {
    const diff = leaseEndDate.diff(reportingDate, "year", true);
    remainingLeasePeriodYears = diff > 0 ? parseFloat(diff.toFixed(2)) : 0;
  }

  return {
    LeaseInfo: {
      PeriodOfReport,
      LessorName,
      natureOfLease,
      leaseWorkingPeriod,
      LeaseStatus,
      userName,
    },
    leaseLiability: {
      opening: OpeningLeaseLiability,
      addition: AdditionLeaseLiability,
      iuTransferred: iuTransferredLeaseLiability,
      termination: isIUTransferred ? 0 : Termination || 0,
      modification: ModificationInLeaseLiability,
      interest: InterestOnLeaseLiability,
      rentPaid: RentPaid,
      closing: ClosingLeaseLiability,
      current: CurrentLeaseLiability,
      nonCurrent: NonCurrentLeaseLiability,
      interestTillDate: InterestOnLeaseLiabilityTillReportingPeriod,
      rentPaidTillDate: RentPaidTillReportingPeriod,
      terminationTransferLeaseLiability: terminationTransferLeaseLiability,
    },
    checkLL: {
      check: CheckLL,
    },
    ROUGrossBlockMovement: {
      openingGrossBlock: OpeningROUGrossBlock,
      addition: AdditionROU,
      iuTransferred: iuTransferredROUGrossBlock,
      modification: ModificationInROU,
      disposal: isIUTransferred ? 0 : Disposal,
      closingGrossBlock: ClosingROUGrossBlock,
      disposalTransferROU: disposalTransferROU,
    },
    ROUAccumlatedDepreciationMovement: {
      openingAccumulatedDepreciation: OpeningROUAccumlatedDepreciation,
      iuTransferred: iuTransferredROUAccumulatedDepreciation,
      depreciationForPeriod: DepreciationOfthePeriod,
      disposalAccumulatedDepreciation: isIUTransferred
        ? 0
        : DisposalAccumlatedDepreciation,
      closingAccumulatedDepreciation: ClosingROUAccumlatedDepreciation,
    },
    ROUWrittenDownValue: {
      openingWDV: OpeningWDV,
      closingWDV: ClosingWDV,
    },
    ROUWrittenDownValueCheck: {
      CheckROU_1: CheckROU_1,
      CheckROU_2: CheckROU_2,
    },
    PrepaidRentMovement: {
      openingGrossBlock: OpeningPrepaidRentGrossBlock,
      addition: AdditionPrepaidRent,
      iuTransferred: iuTransferredPRGrossBlock,
      disposal: isIUTransferred ? 0 : disposalInPR,
      closingGrossBlock: ClosingPrepaidRentGrossBlock,
      openingAccumulatedDepreciation:
        OpeningAccumlatedDepreciationOfPrepaidRent,
      iuTransferredAD: iuTransferredPRAccumulatedDepreciation,
      depreciationForPeriod: DepreciationOnPR,
      disposalAccumulatedDepreciation: isIUTransferred
        ? 0
        : DisposalAccumlatedDepreciationPR,
      closingAccumulatedDepreciation:
        ClosingAccumlatedDepreciationOfPrepaidRent,
      disposalTransferPR: disposalTransferPR,
    },
    PrepaidRentWrittenDownvalue: {
      openingWDV: OpeningWDV_PR,
      closingWDV: ClosingWDV_PR,
    },
    CheckPR: {
      check1: CheckPR_1,
      check2: CheckPR_2,
    },
    securityDeposit: {
      UndiscountedSecurityDepositOnLease: UndiscountedSecurityDepositOnLease,
      OpeningSecurityDeposit: OpeningSecurityDeposit,
      addition: AdditionSecurityDeposit,
      securityDepositTransfer: securityDepositTransfer,
      UnwindingInterestOnSD: UnwindingInterestOnSD,
      paid: PaidSecurityDeposit,
      ClosingSecurityDeposit: FinalClosingSecurityDeposit,
      UnwindingOfInterestTillReportingPeriod:
        UnwindingOfInterestTillReportingPeriod,
    },
    checkSD: {
      check: CheckSD,
    },
    profitLoss: {
      ProfitLossonModification: ProfitLossonModification,
      ProfitLossonTermination: isIUTransferred ? 0 : ProfitLossonTermination,
      interUnitReceivablePayable: InterUnitReceivablePayable,
    },
    ContractualMaturities: {
      within1Year: RentPaidWithin1yearFromReportingDate,
      year2: year2Value,
      year3: year3Value,
      year4: year4Value,
      year5: year5Value,
      after5Years: RentPaidWithinAfter5yearFromReportingDate,
    },
    others: {
      effectiveInterestRate: isIUTransferred
        ? 0
        : EffectiveInterestRateForLeaseLiabilities,
      leasePeriodYears: isIUTransferred ? 0 : LeasePeriodInYears,
      remainingLeasePeriodYears: isIUTransferred
        ? 0
        : remainingLeasePeriodYears,
    },
    otherLeaseInformations: otherLeaseInformations,
  };
};
