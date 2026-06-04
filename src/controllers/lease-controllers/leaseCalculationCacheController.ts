import { Request, Response } from "express";
import LeaseCalculationCache from "../../models/leaseCalculationCache.model";

export const fetchBulkCaches = async (req: Request, res: Response) => {
  try {
    const { leaseVersionIds, presentationPeriod, includeDetails } = req.body;
    if (!Array.isArray(leaseVersionIds) || !presentationPeriod) {
      return res.status(400).json({ success: false, message: "leaseVersionIds array and presentationPeriod are required" });
    }

    const projection = includeDetails === false ? { detailsData: 0 } : {};

    const caches = await LeaseCalculationCache.find(
      {
        leaseVersionId: { $in: leaseVersionIds },
        presentationPeriod,
      },
      projection
    ).lean();

    const cacheMap = caches.reduce((acc, cache) => {
      acc[cache.leaseVersionId.toString()] = {
        detailsData: cache.detailsData,
        summaryData: cache.summaryData,
        originalLeaseId: cache.originalLeaseId,
      };
      return acc;
    }, {} as Record<string, any>);

    return res.status(200).json({ success: true, caches: cacheMap });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const saveBulkCaches = async (req: Request, res: Response) => {
  try {
    const { presentationPeriod, caches } = req.body;
    if (!Array.isArray(caches) || !presentationPeriod) {
      return res.status(400).json({ success: false, message: "caches array and presentationPeriod are required" });
    }

    const bulkOps = caches.map((cache) => ({
      updateOne: {
        filter: {
          leaseVersionId: cache.leaseVersionId,
          presentationPeriod,
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

    await LeaseCalculationCache.bulkWrite(bulkOps);
    return res.status(200).json({ success: true, message: "Bulk caches saved successfully" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
