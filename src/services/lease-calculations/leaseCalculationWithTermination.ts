// @ts-nocheck
import { processLeaseTermination } from "./LeaseTermination";
import { processLeaseCalculationsModification } from "./processLeaseCalculationsModification";
import { processLeaseCalculations } from "./processLeaseCalculations";

export const leaseCalculationWithTermination = async (
  leaseRecord: any,
): Promise<any[]> => {
  try {
    const { status, leaseTerminationDate, iuStatus, dateOfIUTransfer } =
      leaseRecord.activeLease;
    let updatedPVofRent: any[] = [];

    if (leaseRecord?.previousVersions?.length > 0) {
      const result = await processLeaseCalculationsModification(leaseRecord);
      updatedPVofRent = result?.updatedPVofRent ?? [];
    } else {
      const result = await processLeaseCalculations(leaseRecord?.activeLease);
      updatedPVofRent = result?.updatedPVofRent ?? [];
    }

    if (status === "terminated") {
      const result = await processLeaseCalculations(leaseRecord?.activeLease);
      const tempCalPVrentFrequencyData = result.rentFrequencyData ?? [];
      const dailyRentArray = result?.dailyRentArray;
      const rentPaymentType = leaseRecord?.activeLease?.rentPaymentType;
      updatedPVofRent = await processLeaseTermination(
        leaseTerminationDate,
        updatedPVofRent,
        tempCalPVrentFrequencyData,
        rentPaymentType,
        dailyRentArray,
      );
    } else if (status?.toLowerCase() === "transferred") {
      const result = await processLeaseCalculations(leaseRecord?.activeLease);
      const tempCalPVrentFrequencyData = result.rentFrequencyData ?? [];
      const dailyRentArray = result?.dailyRentArray;
      const rentPaymentType = leaseRecord?.activeLease?.rentPaymentType;

      // Ensure we have a date for the transfer
      const transferDate = dateOfIUTransfer;

      updatedPVofRent = await processLeaseTermination(
        transferDate,
        updatedPVofRent,
        tempCalPVrentFrequencyData,
        rentPaymentType,
        dailyRentArray,
        true, // isTransfer
      );
    }
    return updatedPVofRent;
  } catch (error) {
    console.error("Error leaseCalculationWithTermination:", error);
    throw new Error("leaseCalculationWithTermination");
  }
};
