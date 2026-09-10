import { Request, Response } from "express";
import dayjs from "dayjs";
import { getUser } from "../../services/auth";
import LeaseAccountMapping from "../../models/leaseAccountMapping.model";
import { getAllLeaseSummariesForPeriod } from "../../services/lease-calculations/leaseSummaryService";
import { generateScheduleIIIDisclosure } from "../../services/lease-calculations/scheduleIIIDisclosureService";
import { generateInformationDisclosure } from "../../services/lease-calculations/informationDisclosureService";

const extractPresentationPeriod = (req: Request) => {
  const from =
    req.body?.presentationPeriod?.from ||
    req.body?.presentationPeriod?.startDate ||
    req.body?.startDate ||
    req.query?.startDate ||
    req.query?.from ||
    req.query?.["presentationPeriod[from]"] ||
    req.query?.["presentationPeriod[startDate]"];

  const to =
    req.body?.presentationPeriod?.to ||
    req.body?.presentationPeriod?.endDate ||
    req.body?.endDate ||
    req.query?.endDate ||
    req.query?.to ||
    req.query?.["presentationPeriod[to]"] ||
    req.query?.["presentationPeriod[endDate]"];

  if (!from || !to) return null;

  const start = dayjs(from as string);
  const end = dayjs(to as string);

  if (!start.isValid() || !end.isValid()) return null;

  return {
    from: start.format("YYYY-MM-DD"),
    to: end.format("YYYY-MM-DD"),
    formatted: `${start.format("DD-MMM-YYYY")} to ${end.format("DD-MMM-YYYY")}`,
  };
};

/**
 * Controller for Schedule III Disclosure Entities
 * Accepts Presentation Period and calculates identical accounting entries as frontend
 */
export const getScheduleIIIDisclosureController = async (
  req: Request,
  res: Response
) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const requestUser = await getUser(token);
    if (!requestUser) {
      return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }

    const period = extractPresentationPeriod(req);
    if (!period) {
      return res.status(400).json({
        success: false,
        message: "presentationPeriod with valid 'from' and 'to' dates is required",
      });
    }

    const ADMIN_ROLES = new Set(["MASTER", "ADMIN", "SUB_ADMIN"]);
    const isAdmin = ADMIN_ROLES.has(requestUser?.role || "");
    const requestedUserId = (req.body?.userId || req.query?.userId) as string | undefined;
    const filterUserId = isAdmin ? requestedUserId : undefined;

    // 1. Process and aggregate all lease summaries for the period
    const summaryResult = await getAllLeaseSummariesForPeriod(
      requestUser,
      period.from,
      period.to,
      filterUserId
    );

    // 2. Fetch user's account mappings and disclosure settings
    const targetUserIdForMapping = filterUserId || requestUser._id;
    const mappingDoc = await LeaseAccountMapping.findOne({ userId: targetUserIdForMapping }).lean();
    const mappings = mappingDoc?.mappings || [];
    const disclosureSettings = mappingDoc?.disclosureSettings || [];

    // 3. Transform summaries into Schedule III disclosure entries
    const disclosureResult = generateScheduleIIIDisclosure(
      summaryResult.allLeaseSummaries,
      mappings,
      disclosureSettings
    );

    return res.status(200).json({
      success: true,
      data: {
        presentationPeriod: period,
        entries: disclosureResult.entries,
        exportData: disclosureResult.exportData,
      },
      metadata: {
        totalLeasesProcessed: summaryResult.totalLeasesProcessed,
        cacheHits: summaryResult.cacheHits,
        cacheMisses: summaryResult.cacheMisses,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error in getScheduleIIIDisclosureController:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate Schedule III Disclosure",
    });
  }
};

/**
 * Controller for Information Disclosure (Notes Disclosure)
 * Accepts Presentation Period and calculates identical 5 disclosure sections as frontend
 */
export const getInformationDisclosureController = async (
  req: Request,
  res: Response
) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const requestUser = await getUser(token);
    if (!requestUser) {
      return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }

    const period = extractPresentationPeriod(req);
    if (!period) {
      return res.status(400).json({
        success: false,
        message: "presentationPeriod with valid 'from' and 'to' dates is required",
      });
    }

    const ADMIN_ROLES = new Set(["MASTER", "ADMIN", "SUB_ADMIN"]);
    const isAdmin = ADMIN_ROLES.has(requestUser?.role || "");
    const requestedUserId = (req.body?.userId || req.query?.userId) as string | undefined;
    const filterUserId = isAdmin ? requestedUserId : undefined;

    // 1. Process and aggregate all lease summaries for the period
    const summaryResult = await getAllLeaseSummariesForPeriod(
      requestUser,
      period.from,
      period.to,
      filterUserId
    );

    // 2. Fetch user's OI mappings
    const targetUserIdForMapping = filterUserId || requestUser._id;
    const mappingDoc = await LeaseAccountMapping.findOne({ userId: targetUserIdForMapping }).lean();
    const oiMappings = mappingDoc?.oi_mappings || [];

    // 3. Transform summaries into Information Disclosure sections
    const infoResult = generateInformationDisclosure(
      summaryResult.allLeaseSummaries,
      oiMappings
    );

    return res.status(200).json({
      success: true,
      data: {
        presentationPeriod: period,
        contractualData: infoResult.contractualData,
        optionsData: infoResult.optionsData,
        averagePeriodData: infoResult.averagePeriodData,
        averageRemainingPeriodData: infoResult.averageRemainingPeriodData,
        interestRateData: infoResult.interestRateData,
      },
      metadata: {
        totalLeasesProcessed: summaryResult.totalLeasesProcessed,
        cacheHits: summaryResult.cacheHits,
        cacheMisses: summaryResult.cacheMisses,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error in getInformationDisclosureController:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate Information Disclosure",
    });
  }
};
