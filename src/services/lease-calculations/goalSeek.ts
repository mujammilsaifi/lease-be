// @ts-nocheck
import { calculationTransitionWithProspective } from "./calculationTransitionWithProspective";

// Interface for lease record
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
}

// Define the result type for the calculation function
interface CalculationResult {
  updatedPVofRent: any[];
  rentFrequencyData: any[];
  dailyRentArray: any[];
  optimizedRate: number;
}

export async function goalSeek(
  leaseRecord: LeaseRecord,
  targetLeaseLiability: number = 0
): Promise<CalculationResult> {
  console.log(leaseRecord);
  // Configuration
  const tolerance = 0.01; // Within 1 cent
  const STUCK_LIMIT = 10; // Exit if no improvement after 10 iterations
  const MIN_STEP = 0.0001; // Minimum step size
  const MAX_STEP = 0.1; // Maximum step size (10%)
  const MIN_RATE = 0.0001;
  const MAX_RATE = 80.0; // Allow up to 80% discount rate to achieve target

  // Get current discount rate
  const currentRate =
    leaseRecord.discountingRates[leaseRecord.discountingRates.length - 1].rate;
  let testRate = currentRate;
  let iteration = 0;
  let lastError = Infinity;
  let stuckCount = 0;

  // Track if we're hitting bounds
  let hitUpperBound = false;
  let hitLowerBound = false;

  while (true) {
    // Adaptive iteration - no fixed max iterations
    // Create modified lease record with test rate
    const modifiedLeaseRecord: LeaseRecord = {
      ...leaseRecord,
      discountingRates: [
        ...leaseRecord.discountingRates.slice(0, -1), // Keep all rates except the last
        { rate: testRate }, // Replace the last rate with test rate
      ],
    };

    // Calculate result with modified lease record
    const result = await calculationTransitionWithProspective(
      modifiedLeaseRecord
    );
    const currentLeaseLiability =
      result.updatedPVofRent[result.updatedPVofRent.length - 1][
        "Lease Liability"
      ];

    // Calculate current error
    const currentError = Math.abs(currentLeaseLiability - targetLeaseLiability);

    // Check if we've reached the target within tolerance
    if (currentError <= tolerance) {
      console.log(
        `Goal seek converged after ${
          iteration + 1
        } iterations. Final rate: ${testRate.toFixed(
          6
        )}, Final error: ${currentError.toFixed(6)}`
      );
      return { ...result, optimizedRate: testRate };
    }

    // Stagnation safeguard - check if error is not improving
    if (currentError >= lastError) {
      stuckCount++;
      if (stuckCount >= STUCK_LIMIT) {
        console.log(
          `Goal seek stagnated after ${
            iteration + 1
          } iterations. No improvement for ${STUCK_LIMIT} iterations. Final rate: ${testRate.toFixed(
            6
          )}, Final error: ${currentError.toFixed(6)}`
        );
        return { ...result, optimizedRate: testRate };
      }
    } else {
      stuckCount = 0; // Reset stuck counter if we're improving
    }

    lastError = currentError;

    // Calculate derivative (approximate) for next iteration
    const smallStep = Math.max(Math.abs(testRate) * 0.001, MIN_STEP); // Dynamic minimum step size
    const modifiedLeaseRecordForDerivative: LeaseRecord = {
      ...leaseRecord,
      discountingRates: [
        ...leaseRecord.discountingRates.slice(0, -1),
        { rate: testRate + smallStep },
      ],
    };

    const derivativeResult = await calculationTransitionWithProspective(
      modifiedLeaseRecordForDerivative
    );
    const derivativeLeaseLiability =
      derivativeResult.updatedPVofRent[
        derivativeResult.updatedPVofRent.length - 1
      ]["Lease Liability"];

    // Calculate derivative (slope)
    const derivative =
      (derivativeLeaseLiability - currentLeaseLiability) / smallStep;

    // Calculate error
    const error = currentLeaseLiability - targetLeaseLiability;

    // Check if we're hitting bounds and can't progress
    if (hitUpperBound && error < -tolerance) {
      console.log(
        `Hit upper bound (${MAX_RATE}) but still need higher rate. Target may be unreachable.`
      );
      return { ...result, optimizedRate: testRate };
    }
    if (isNaN(currentLeaseLiability) || isNaN(derivative) || isNaN(error)) {
      console.log("Goal seek failed to find a solution.");
      return { ...result, optimizedRate: testRate };
    }

    if (hitLowerBound && error > tolerance) {
      console.log(
        `Hit lower bound (${MIN_RATE}) but still need lower rate. Target may be unreachable.`
      );
      return { ...result, optimizedRate: testRate };
    }

    // Avoid division by zero or very small derivatives
    if (Math.abs(derivative) < 1e-10) {
      console.log(
        `Derivative too small (${derivative}), using fallback adjustment at iteration ${
          iteration + 1
        }`
      );

      // Fallback: dynamic proportional adjustment based on error magnitude
      const errorRatio =
        Math.abs(error) / Math.max(Math.abs(targetLeaseLiability), 1);
      const fallbackAdjustment = -error * Math.min(errorRatio * 0.001, 0.01); // Scale with error
      testRate += fallbackAdjustment;

      // Enhanced boundary protection
      if (testRate >= MAX_RATE) {
        testRate = MAX_RATE;
        hitUpperBound = true;
      } else if (testRate <= MIN_RATE) {
        testRate = MIN_RATE;
        hitLowerBound = true;
      }

      iteration++;
      continue;
    }

    // Newton-Raphson method: newRate = oldRate - f(x)/f'(x)
    let rateAdjustment = -error / derivative;

    // Dynamic step size - scales with error magnitude and target
    const errorRatio =
      Math.abs(error) / Math.max(Math.abs(targetLeaseLiability), 1);
    const dynamicMaxStep = Math.min(
      MAX_STEP,
      Math.max(MIN_STEP, errorRatio * 0.1)
    );
    const adjustmentLimit = Math.max(
      Math.abs(testRate) * dynamicMaxStep,
      MIN_STEP
    );

    if (Math.abs(rateAdjustment) > adjustmentLimit) {
      rateAdjustment = Math.sign(rateAdjustment) * adjustmentLimit;
    }

    // Store old rate to check if we're hitting bounds
    const oldRate = testRate;

    // Update test rate with enhanced boundary protection
    const newRate = testRate + rateAdjustment;

    // Enhanced boundary protection - prevent escaping valid range
    if (newRate >= MAX_RATE) {
      testRate = MAX_RATE;
      hitUpperBound = true;
    } else if (newRate <= MIN_RATE) {
      testRate = MIN_RATE;
      hitLowerBound = true;
    } else {
      testRate = newRate;
      // Reset boundary flags if we're back in valid range
      if (testRate < MAX_RATE) hitUpperBound = false;
      if (testRate > MIN_RATE) hitLowerBound = false;
    }

    // If we're hitting the same bound repeatedly, try binary search approach
    if (iteration > 15 && Math.abs(oldRate - testRate) < 1e-10) {
      console.log(
        `Stuck at boundary after ${
          iteration + 1
        } iterations. Trying binary search approach...`
      );

      // Use binary search between current bounds
      const lowRate = MIN_RATE;
      const highRate = MAX_RATE;

      const binarySearchResult = await binarySearchRate(
        leaseRecord,
        targetLeaseLiability,
        lowRate,
        highRate,
        tolerance
      );

      if (binarySearchResult) {
        return binarySearchResult;
      }
    }

    iteration++;
  }
}

// Binary search function for finding the optimal rate when Newton-Raphson fails
async function binarySearchRate(
  leaseRecord: LeaseRecord,
  targetLeaseLiability: number,
  lowRate: number,
  highRate: number,
  tolerance: number
): Promise<CalculationResult | null> {
  const BINARY_SEARCH_LIMIT = 50; // Allow more iterations for binary search
  const BINARY_TOLERANCE = 0.0001; // Finer tolerance for binary search
  let iteration = 0;

  console.log(
    `Starting binary search between rates ${lowRate.toFixed(
      6
    )} and ${highRate.toFixed(6)}`
  );

  while (
    iteration < BINARY_SEARCH_LIMIT &&
    highRate - lowRate > BINARY_TOLERANCE
  ) {
    const midRate = (lowRate + highRate) / 2;

    // Test the mid rate
    const modifiedLeaseRecord: LeaseRecord = {
      ...leaseRecord,
      discountingRates: [
        ...leaseRecord.discountingRates.slice(0, -1),
        { rate: midRate },
      ],
    };

    const result = await calculationTransitionWithProspective(
      modifiedLeaseRecord
    );
    const currentLeaseLiability =
      result.updatedPVofRent[result.updatedPVofRent.length - 1][
        "Lease Liability"
      ];

    console.log(
      `Binary search iteration ${iteration + 1}: Rate = ${midRate.toFixed(
        6
      )}, Lease Liability = ${currentLeaseLiability.toFixed(2)}`
    );

    // Check if we've reached the target
    if (Math.abs(currentLeaseLiability - targetLeaseLiability) <= tolerance) {
      console.log(
        `Binary search converged after ${
          iteration + 1
        } iterations. Final rate: ${midRate}`
      );
      return { ...result, optimizedRate: midRate };
    }

    // Adjust bounds based on error
    if (currentLeaseLiability > targetLeaseLiability) {
      // Lease liability is too high, need higher discount rate
      lowRate = midRate;
    } else {
      // Lease liability is too low, need lower discount rate
      highRate = midRate;
    }

    iteration++;
  }

  console.log(
    `Binary search did not converge. Returning result with rate ${
      (lowRate + highRate) / 2
    }`
  );

  // Return the result with the best rate found
  const bestRate = (lowRate + highRate) / 2;
  const finalLeaseRecord: LeaseRecord = {
    ...leaseRecord,
    discountingRates: [
      ...leaseRecord.discountingRates.slice(0, -1),
      { rate: bestRate },
    ],
  };

  const finalResult = await calculationTransitionWithProspective(
    finalLeaseRecord
  );
  return { ...finalResult, optimizedRate: bestRate };
}

// Main function that uses goal seek (assuming this is part of a larger function)
export async function optimizeDiscountRate(
  leaseRecord: LeaseRecord,
  transitionType?: string
): Promise<CalculationResult> {
  if (transitionType === "prospective") {
    // 1. Calculate the original result with the original discount rate
    const originalResult = await calculationTransitionWithProspective(
      leaseRecord
    );
    if (leaseRecord.transitionDiscountAdjustment === "no") {
      return {
        ...originalResult,
        optimizedRate:
          leaseRecord.discountingRates[leaseRecord.discountingRates.length - 1]
            .rate,
      };
    }
    const originalLastEntryLeaseLiability =
      originalResult.updatedPVofRent[originalResult.updatedPVofRent.length - 1][
        "Lease Liability"
      ];

    if (Math.abs(originalLastEntryLeaseLiability) <= 0.01) {
      console.log(
        "Original discount rate is already optimal. No goal seek needed."
      );
      return {
        ...originalResult,
        optimizedRate:
          leaseRecord.discountingRates[leaseRecord.discountingRates.length - 1]
            .rate,
      };
    }

    // Use goal seek to find the optimal discount rate
    const optimizedResult = await goalSeek(leaseRecord, 0); // Target lease liability of 0

    return optimizedResult;
  }

  // Return original calculation if not prospective
  const originalResult = await calculationTransitionWithProspective(
    leaseRecord
  );
  return {
    ...originalResult,
    optimizedRate:
      leaseRecord.discountingRates[leaseRecord.discountingRates.length - 1]
        .rate,
  };
}
