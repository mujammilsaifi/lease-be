// @ts-nocheck
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import utc from "dayjs/plugin/utc";
import leaseModel from "../../models/lease.model";
import LeaseCalculationCache from "../../models/leaseCalculationCache.model";
import { leaseCalculationWithTermination } from "./leaseCalculationWithTermination";
import { generateLeaseSummary } from "./leaseSummary";

dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(utc);

export const FindCurrentVersionLease = (leaseGroup: any, endDate: any) => {
  if (!leaseGroup) return null;
  const { activeLease, previousVersions = [] } = leaseGroup;
  if (!activeLease) return null;

  const allVersions = [...previousVersions, activeLease].sort(
    (a, b) => a.versionNumber - b.versionNumber
  );

  const firstInvalidVersionIndex = allVersions.findIndex((version) => {
    if (version.versionNumber !== 1 && version.leaseModificationDate) {
      const modificationDate = dayjs(version.leaseModificationDate);
      if (modificationDate.isAfter(endDate)) {
        return true;
      }
    }
    return false;
  });

  const validVersions =
    firstInvalidVersionIndex === -1
      ? allVersions
      : allVersions.slice(0, firstInvalidVersionIndex);

  if (validVersions.length === 0) return null;
  const latestValidVersion = { ...validVersions[validVersions.length - 1] };

  // Handle future IU Received leases: if received in the future, the receiver does not own it yet in this period
  if (
    latestValidVersion.iuStatus === "IU Received" &&
    latestValidVersion.dateOfIUReceived
  ) {
    const receivedDate = dayjs(latestValidVersion.dateOfIUReceived);
    if (receivedDate.isAfter(endDate)) {
      return null;
    }
  }

  // Handle future Transferred leases: if transfer is in the future, treat it as not transferred yet in this period
  if (
    (latestValidVersion.status === "transferred" ||
      latestValidVersion.iuStatus === "IU Transferred") &&
    latestValidVersion.dateOfIUTransfer
  ) {
    const transferDate = dayjs(latestValidVersion.dateOfIUTransfer);
    if (transferDate.isAfter(endDate)) {
      delete latestValidVersion.dateOfIUTransfer;
      delete latestValidVersion.iuTransferData;
      latestValidVersion.iuStatus = undefined;

      // Retain previous effective status
      if (latestValidVersion.leaseTerminationDate) {
        const closureDate = dayjs(latestValidVersion.leaseTerminationDate);
        if (closureDate.isSameOrBefore(endDate)) {
          latestValidVersion.status = "terminated";
        } else {
          latestValidVersion.status = "active";
        }
      } else {
        latestValidVersion.status = "active";
      }
    }
  }

  if (latestValidVersion.leaseTerminationDate) {
    const closureDate = dayjs(latestValidVersion.leaseTerminationDate);
    if (closureDate.isAfter(endDate)) {
      delete latestValidVersion.leaseTerminationDate;
      latestValidVersion.status = "active";
    }
  }

  const previousValidVersions = validVersions.slice(0, -1);
  return {
    activeLease: latestValidVersion,
    previousVersions: previousValidVersions,
  };
};

export function calculateLeasePeriodInDays(leaseInfo: any): number {
  let version1Lease;
  if (leaseInfo.activeLease.versionNumber === 1) {
    version1Lease = leaseInfo.activeLease;
  } else {
    version1Lease = leaseInfo.previousVersions.find(
      (lease: any) => lease.versionNumber === 1
    );
    if (!version1Lease) return 0;
  }

  const startDateStr = version1Lease?.leaseWorkingPeriod?.[0];
  let endDateStr: string;
  if (leaseInfo.activeLease.status === "terminated") {
    if (!leaseInfo.activeLease.leaseTerminationDate) return 0;
    endDateStr = leaseInfo.activeLease.leaseTerminationDate;
  } else {
    endDateStr = leaseInfo.activeLease.leaseWorkingPeriod[1];
  }

  if (!startDateStr || !endDateStr) return 0;

  const startParts = startDateStr.split("-").map(Number);
  const endParts = endDateStr.split("-").map(Number);
  const startDate = new Date(
    Date.UTC(startParts[0], startParts[1] - 1, startParts[2])
  );
  const endDate = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));

  const diffMs = endDate.getTime() - startDate.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

export const sumLeaseMetrics = (data: any[]): Record<string, number> => {
  const keysToSum = [
    "RentPayment",
    "Interest on lease liability",
    "Depreciation",
    "Interest Income on security deposit",
    "Dep on Prepaid Rent",
    "Modification of ROU",
    "Modification of Lease Liability",
    "ROU",
  ] as const;

  return keysToSum.reduce(
    (acc, key) => {
      acc[key] = data.reduce(
        (sum, entry) => sum + (Number(entry[key]) || 0),
        0
      );
      return acc;
    },
    {} as Record<string, number>
  );
};

export const minifyCacheData = (details: any[]) => {
  if (!Array.isArray(details)) return [];
  return details.map((row) => {
    const {
      _parsedDate,
      _parsedDateTimestamp,
      _parsedDateFormatted,
      ...cleanRow
    } = row;

    for (const key in cleanRow) {
      if (cleanRow[key] === null || cleanRow[key] === undefined) {
        delete cleanRow[key];
      }
    }

    return cleanRow;
  });
};

export const restoreCacheData = (details: any[]) => {
  if (!Array.isArray(details)) return [];
  return details.map((row) => {
    const fixedDateStr = row.Date?.replace("Sept", "Sep");
    const parsedDate = dayjs(fixedDateStr, "DD-MMM-YYYY").startOf("day");
    return {
      ...row,
      _parsedDate: parsedDate,
      _parsedDateTimestamp: parsedDate.valueOf(),
      _parsedDateFormatted: parsedDate.format("DD-MMM-YYYY"),
    };
  });
};

/**
 * Builds the MongoDB query according to user role and parameters, matching leaseController.ts
 */
const buildLeaseQuery = (requestUser: any, queryParams: any) => {
  const query: any = {};
  const ADMIN_ROLES = new Set(["MASTER", "ADMIN", "SUB_ADMIN"]);
  const isAdmin = ADMIN_ROLES.has(requestUser?.role || "");

  const { userId, adminId, leaseGroup } = queryParams || {};

  const isValidId = (id: any) =>
    typeof id === "string" && id.trim() !== "" && id !== "undefined" && id !== "null";

  const getArrayFromQuery = (val: any) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      return val
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v !== "" && v !== "undefined" && v !== "null");
    }
    return [val];
  };

  if (isAdmin && requestUser?._id) {
    if (isValidId(userId)) {
      const userIds = getArrayFromQuery(userId);
      query.userId = userIds.length === 1 ? userIds[0] : { $in: userIds };
      query.adminId = requestUser._id;
    } else {
      query.$or = [{ adminId: requestUser._id }, { userId: requestUser._id }];
    }
  } else if (requestUser?._id) {
    query.userId = requestUser._id;
  } else if (isValidId(adminId)) {
    query.$or = [{ adminId: adminId }, { userId: adminId }];
  } else if (isValidId(userId)) {
    const userIds = getArrayFromQuery(userId);
    query.userId = userIds.length === 1 ? userIds[0] : { $in: userIds };
  } else {
    return null;
  }

  if (typeof leaseGroup === "string" && leaseGroup.trim() !== "") {
    query.leaseGroup = leaseGroup;
  }

  return query;
};

/**
 * Loads and calculates all lease summaries for a given presentation period and user context.
 */
export const getAllLeaseSummariesForPeriod = async (
  requestUser: any,
  startDateStr: string,
  endDateStr: string,
  filterUserId?: string
) => {
  const startDate = dayjs(startDateStr).startOf("day");
  const endDate = dayjs(endDateStr).endOf("day");
  const periodKey = startDate.format("YYYY-MM-DD") + "_" + endDate.format("YYYY-MM-DD");

  const queryParams = filterUserId ? { userId: filterUserId } : {};
  const query = buildLeaseQuery(requestUser, queryParams);

  if (!query) {
    throw new Error("Invalid query parameters or unauthorized user");
  }

  const allLeases = await leaseModel.find(query).sort({ _id: -1 }).lean();

  const leaseGroups = new Map<string, any[]>();
  allLeases.forEach((lease: any) => {
    const key = lease.originalLeaseId?.toString() || lease._id.toString();
    if (!leaseGroups.has(key)) leaseGroups.set(key, []);
    leaseGroups.get(key)!.push(lease);
  });

  const leaseMovementList: any[] = [];
  for (const [key, group] of leaseGroups.entries()) {
    group.sort((a, b) => b.versionNumber - a.versionNumber);

    const latestVersion = group[0];
    const versionOne = group.find((l) => l.versionNumber === 1);

    const queryStartDate = new Date(startDateStr);
    const queryEndDate = new Date(endDateStr);
    const versionOneStartDate = new Date(versionOne?.leaseWorkingPeriod?.[0]);

    if (versionOne?.cutOffDate) {
      const cutOffDate = new Date(versionOne.cutOffDate);
      if (queryStartDate <= cutOffDate) {
        continue;
      }
    }

    if (!(versionOneStartDate < queryEndDate)) {
      continue;
    }

    let activeLease = group.find(
      (lease) =>
        lease.status === "active" ||
        lease.status === "terminated" ||
        lease.status === "closed" ||
        lease.status === "transferred"
    );

    if (!activeLease) activeLease = latestVersion;

    const previousVersions = group.filter(
      (lease) => lease._id.toString() !== activeLease!._id.toString()
    );

    leaseMovementList.push({
      activeLease,
      previousVersions,
    });
  }

  // Pre-fetch caches for active versions
  const activeVersions = leaseMovementList
    .map((groupLease: any) => FindCurrentVersionLease(groupLease, endDate)?.activeLease)
    .filter(Boolean);

  const leaseVersionIds = activeVersions.map((l: any) => l._id);
  const caches = await LeaseCalculationCache.find({
    leaseVersionId: { $in: leaseVersionIds },
    presentationPeriod: periodKey,
  }).lean();

  const cacheMap = caches.reduce((acc: any, cache: any) => {
    acc[cache.leaseVersionId.toString()] = {
      detailsData: cache.detailsData,
      summaryData: cache.summaryData,
      originalLeaseId: cache.originalLeaseId,
    };
    return acc;
  }, {} as Record<string, any>);

  const summaries: any[] = [];
  const cacheMissesToSave: any[] = [];

  for (const groupLease of leaseMovementList) {
    const lease = FindCurrentVersionLease(groupLease, endDate);
    const activeLease = lease?.activeLease;
    if (!activeLease) continue;

    const versionIdStr = activeLease._id.toString();
    let calculations: any[];
    let summary: any = null;
    let cacheHit = false;

    if (cacheMap[versionIdStr] && cacheMap[versionIdStr].detailsData) {
      calculations = restoreCacheData(cacheMap[versionIdStr].detailsData);
      summary = cacheMap[versionIdStr].summaryData;
      cacheHit = true;
    } else {
      calculations = await leaseCalculationWithTermination(lease);
    }

    const filteredCalc = calculations.filter((row: any) => {
      const d = dayjs(row.Date?.replace("Sept", "Sep"), "DD-MMM-YYYY");
      return d.isValid() && d.isBetween(startDate, endDate, "day", "[]");
    });

    const Status = activeLease?.status;
    const EndDate = activeLease?.leaseWorkingPeriod?.[1];
    const terminationDate = activeLease?.leaseTerminationDate;
    const leaseClosureDate = activeLease?.leaseClosureDate;

    let effectiveStatusForSkip = Status;
    if (Status === "terminated" && terminationDate) {
      if (dayjs(terminationDate).isAfter(endDate, "day")) {
        effectiveStatusForSkip = "active";
      }
    }
    if (Status === "closed") {
      const ed = EndDate ? dayjs(EndDate) : null;
      const cd = leaseClosureDate ? dayjs(leaseClosureDate) : null;
      if (ed && ed.isAfter(endDate, "day")) {
        effectiveStatusForSkip = "active";
      } else if (cd && cd.isAfter(endDate, "day")) {
        effectiveStatusForSkip = "completed";
      }
    }

    if (effectiveStatusForSkip === "terminated" && filteredCalc.length === 0) {
      continue;
    }
    if (
      Status === "closed" &&
      leaseClosureDate &&
      startDate.isAfter(dayjs(leaseClosureDate), "day")
    ) {
      continue;
    }

    const firstVersion =
      activeLease.versionNumber === 1
        ? activeLease
        : lease.previousVersions?.find((v: any) => v.versionNumber === 1);
    const leaseWorkingPeriod = `${dayjs(firstVersion?.leaseWorkingPeriod[0]).format("DD-MMM-YYYY")} to ${dayjs(
      activeLease.leaseTerminationDate || activeLease.leaseWorkingPeriod[1]
    ).format("DD-MMM-YYYY")}`;

    const hasCutOffDate =
      !!activeLease.cutOffDate ||
      lease.previousVersions?.some((v: any) => !!v.cutOffDate);

    const isCompleted =
      (effectiveStatusForSkip === "active" ||
        effectiveStatusForSkip === "completed" ||
        effectiveStatusForSkip === "closed") &&
      EndDate &&
      dayjs(EndDate).isSameOrBefore(endDate, "day");

    const fullStatusStr = (() => {
      let effectiveStatus = Status;
      if (Status === "terminated" && terminationDate) {
        if (dayjs(terminationDate).isAfter(endDate, "day")) {
          effectiveStatus = "active";
        }
      }
      if (Status === "closed") {
        const ed = EndDate ? dayjs(EndDate) : null;
        const cd = leaseClosureDate ? dayjs(leaseClosureDate) : null;
        if (ed && ed.isAfter(endDate, "day")) {
          effectiveStatus = "active";
        } else if (cd && cd.isAfter(endDate, "day")) {
          effectiveStatus = "completed";
        } else {
          effectiveStatus = "closed";
        }
      }
      const isCompletedForStatus =
        effectiveStatus === "active" &&
        EndDate &&
        dayjs(EndDate).isSameOrBefore(endDate, "day");
      const isSDClosed =
        activeLease.dateOfSDClosure &&
        dayjs(activeLease.dateOfSDClosure).isSameOrBefore(endDate, "day");
      let statusStr = "";
      if (effectiveStatus === "terminated") {
        statusStr = "Terminated";
      } else if (effectiveStatus === "Transferred") {
        statusStr = "Transferred";
      } else if (effectiveStatus === "completed" || isCompletedForStatus) {
        statusStr = "Completed";
      } else if (effectiveStatus === "closed") {
        statusStr = "Closed";
      } else {
        statusStr = "Active";
      }
      if (lease.previousVersions?.length > 0) {
        statusStr += ` (Modified-${lease.previousVersions.length})`;
      }
      if (isSDClosed) {
        statusStr += " (SD_Closure)";
      }
      if (activeLease.iuStatus) {
        statusStr += ` (${activeLease.iuStatus})`;
      }
      if (hasCutOffDate) {
        statusStr += " (Transition)";
      }
      return statusStr;
    })();

    if (cacheHit && summary) {
      summaries.push(summary);
    } else {
      const LeasePeriodInDays = calculateLeasePeriodInDays(lease);
      const previousItem = [...calculations]
        .map((item) => ({
          ...item,
          parsedDate: dayjs(
            item.Date?.replace("Sept", "Sep"),
            "DD-MMM-YYYY",
            true
          ),
        }))
        .filter(
          (item) =>
            item.parsedDate.isValid() && item.parsedDate.isBefore(startDate)
        )
        .sort((a, b) => b.parsedDate.valueOf() - a.parsedDate.valueOf())?.[0];

      const additionLeaseObject = previousItem ? null : filteredCalc?.[0];
      const openingLeaseObject = previousItem;
      let lastRowData = filteredCalc?.[filteredCalc?.length - 1] || {};
      const sumLeaseOfData = sumLeaseMetrics(filteredCalc);

      if (isCompleted && filteredCalc.length === 0) {
        lastRowData = openingLeaseObject;
      }

      summary = await generateLeaseSummary({
        openingLeaseObject,
        additionLeaseObject,
        lastRowData,
        leaseFilterData: filteredCalc,
        sumLeaseOfData,
        originalCalculation: calculations,
        dateRange: [startDate, endDate],
        PeriodOfReport: `${startDate.format("DD-MMM-YYYY")} to ${endDate.format("DD-MMM-YYYY")}`,
        LessorName: activeLease.lessorName,
        natureOfLease: activeLease.natureOfLease,
        leaseWorkingPeriod,
        LeaseStatus: fullStatusStr,
        LatestInterestFromLease: activeLease.discountingRates?.[0]?.rate,
        originalSecurityDeposit: activeLease.securityDeposit,
        LeasePeriodInDays,
        firstVersionLease: hasCutOffDate ? firstVersion : null,
        dateOfSDClosure: activeLease.dateOfSDClosure,
        otherLeaseInformations: activeLease.otherLeaseInformations || {
          extensionOption: false,
          terminationOption: false,
          purchaseOption: false,
        },
        userName:
          activeLease.userName ||
          groupLease.userName ||
          activeLease.userId ||
          groupLease.userId ||
          "Unknown",
        iuStatus: activeLease.iuStatus,
        activeLease: activeLease,
      });

      summaries.push(summary);

      const cleanDetails = minifyCacheData(calculations);
      cacheMissesToSave.push({
        leaseVersionId: activeLease._id,
        originalLeaseId: activeLease.originalLeaseId || activeLease._id,
        presentationPeriod: periodKey,
        detailsData: cleanDetails,
        summaryData: summary,
      });
    }
  }

  // Save any misses in background
  if (cacheMissesToSave.length > 0) {
    const bulkOps = cacheMissesToSave.map((cache) => ({
      updateOne: {
        filter: {
          leaseVersionId: cache.leaseVersionId,
          presentationPeriod: periodKey,
        },
        update: {
          $set: {
            originalLeaseId: cache.originalLeaseId,
            detailsData: cache.detailsData,
            summaryData: cache.summaryData,
          },
        },
        upsert: true,
      },
    }));
    LeaseCalculationCache.bulkWrite(bulkOps).catch((err) => {
      console.error("Failed to save caches in background:", err);
    });
  }

  return {
    allLeaseSummaries: summaries,
    totalLeasesProcessed: leaseMovementList.length,
    cacheHits: summaries.length - cacheMissesToSave.length,
    cacheMisses: cacheMissesToSave.length,
  };
};
