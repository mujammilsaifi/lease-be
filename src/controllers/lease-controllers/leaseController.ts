import { RequestHandler } from "express";
import dotenv from "dotenv";
import leaseModel from "../../models/lease.model";
import AuditLog from "../../models/auditLog.model";
import LeaseCalculationCache from "../../models/leaseCalculationCache.model";
import { getChanges } from "../../utils/diff";
import mongoose from "mongoose";
import { getUser } from "../../services/auth";
dotenv.config();

const ADMIN_ROLES = new Set(["MASTER", "ADMIN", "SUB_ADMIN"]);

/**
 * Helper to build the lease query based on user role and fallbacks
 */
const buildLeaseQuery = (requestUser: any, queryParams: any) => {
  const { userId, adminId, leaseGroup } = queryParams;
  const query: any = {};
  const isAdmin = ADMIN_ROLES.has(requestUser?.role || "");

  const isValidId = (id: any) => {
    if (!id) return false;
    if (Array.isArray(id)) return id.length > 0;
    return (
      typeof id === "string" &&
      id.trim() !== "" &&
      id !== "undefined" &&
      id !== "null"
    );
  };

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
 * Helper to get the correct adminId for a request user
 */
const getAdminId = (requestUser: any) => {
  return ADMIN_ROLES.has(requestUser?.role || "")
    ? requestUser?._id
    : requestUser?.adminId || null;
};

/**
 * Helper to fetch user names from the external Admin API
 */
const attachUserNamesToLeases = async (
  leases: any[],
  token: string | undefined,
) => {
  if (!leases || leases.length === 0) return leases;

  const uniqueUserIds = [
    ...new Set(leases.map((l) => l.userId?.toString()).filter(Boolean)),
  ];
  if (uniqueUserIds.length === 0) return leases;

  try {
    const apiUrl = "https://schedule-iii-dev.finsensor.ai/api/v1/ex/user/users";

    const headers: any = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers,
    });

    if (response.ok) {
      const data = (await response.json()) as any;
      if (data && Array.isArray(data.data)) {
        // Convert the array of users to a map for O(1) lookup
        const usersMap = data.data.reduce((acc: any, user: any) => {
          acc[user._id.toString()] = user;
          return acc;
        }, {});

        leases.forEach((lease) => {
          const uId = lease.userId?.toString();
          const user = usersMap[uId];
          if (uId && user) {
            lease.userName = user.fullName;
          }
        });
      }
    }
  } catch (error) {
    console.error("Error fetching batch user details:", error);
  }
  return leases;
};

export const leaseController: RequestHandler = async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    const requestUser = token ? await getUser(token) : null;

    if (!requestUser?._id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const leaseData = req.body;
    if (!Array.isArray(leaseData) || leaseData.length === 0) {
      return res.status(400).json({ error: "Invalid lease data provided" });
    }

    const adminId = getAdminId(requestUser);

    // Parallel check for existing leases with same user and lessor name
    const existingLeaseChecks = await Promise.all(
      leaseData.map((lease) =>
        leaseModel.findOne({
          userId: requestUser._id,
          iuStatus: { $exists: false }, // Only check duplicates for non-transfer leases
          $expr: {
            $regexMatch: {
              input: { $trim: { input: "$lessorName" } },
              regex: `^${lease.lessorName.trim()}$`,
              options: "i",
            },
          },
        }),
      ),
    );

    const foundDuplicate = existingLeaseChecks.find((l) => l !== null);
    if (foundDuplicate) {
      return res.status(400).json({
        error: `Lease with lessor name "${foundDuplicate.lessorName}" already exists for this user.`,
      });
    }

    // Add versioning fields and inject userId/adminId from JWT (never trust body)
    const leasesWithVersioning = leaseData.map((lease) => ({
      ...lease,
      userId: requestUser._id,
      adminId: adminId || undefined,
      locationId: requestUser.locationId || lease.locationId || undefined,
      userName: requestUser.fullName || requestUser.name || lease.userName,
      location: requestUser.location || requestUser.Location || lease.location,
      leaseGroup:
        requestUser.leaseGroup || requestUser.group || lease.leaseGroup,
      versionNumber: 1,
    }));

    const savedLeases = await leaseModel.insertMany(leasesWithVersioning);

    // Update originalLeaseId to match _id after creation
    await Promise.all(
      savedLeases.map(async (lease) => {
        await leaseModel.findByIdAndUpdate(lease._id, {
          originalLeaseId: lease._id,
        });
        // Log creation
        await AuditLog.create({
          entityType: "Lease",
          entityId: lease._id,
          entityName: lease.lessorName,
          action: "CREATED",
          performedBy: requestUser._id,
          changes: {},
          timestamp: new Date(),
        });
      }),
    );

    return res.status(201).json({
      message: "Leases created successfully",
      data: savedLeases,
    });
  } catch (error: any) {
    console.error("Lease creation error:", error);
    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Validation Error",
        details: Object.values(error.errors).map((err: any) => err.message),
      });
    }
    if (error.code === 11000) {
      return res.status(409).json({
        error: "Duplicate entry detected",
        details: error.keyValue,
      });
    }
    return res.status(500).json({
      error: "An error occurred",
      details: error.message || "Unknown error",
    });
  }
};

export const leaseModificationController: RequestHandler = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const modifyData = req.body;
    const originalData = await leaseModel.findById(id).lean().session(session);

    if (!originalData) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Lease data not found" });
    }

    if (!modifyData || typeof modifyData !== "object") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "Invalid lease data provided" });
    }

    // Validate Modification Date against ROU adjustments
    if (originalData.rouAdjustments && originalData.rouAdjustments.length > 0) {
      const latestAdjDate = originalData.rouAdjustments.reduce(
        (latest, adj) => {
          if (!adj.adjustmentDate) return latest;
          const adjTime = new Date(adj.adjustmentDate).getTime();
          return adjTime > latest ? adjTime : latest;
        },
        0,
      );

      if (latestAdjDate > 0 && modifyData.leaseModificationDate) {
        const modTime = new Date(modifyData.leaseModificationDate).getTime();
        if (modTime < latestAdjDate) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            error:
              "Modification date cannot be earlier than the latest ROU adjustment date.",
          });
        }
      }
    }

    await leaseModel.findByIdAndUpdate(id, { status: "modified" }, { session });
    await LeaseCalculationCache.deleteMany({ leaseVersionId: id }).session(
      session,
    );

    const newLeaseData = {
      ...modifyData,
      userId: originalData.userId,
      adminId: originalData.adminId || undefined,
      locationId: modifyData.locationId || originalData.locationId || undefined,
      rouAdjustments: Array.isArray(modifyData.rouAdjustments)
        ? modifyData.rouAdjustments.filter((adj: any) => {
            if (!adj.adjustmentDate || !modifyData.leaseModificationDate)
              return true;
            return (
              new Date(adj.adjustmentDate).getTime() >=
              new Date(modifyData.leaseModificationDate).getTime()
            );
          })
        : undefined,
      leasePeriod:
        modifyData.leasePeriod && modifyData.leasePeriod.length === 2
          ? modifyData.leasePeriod
          : originalData.leasePeriod,
      lockingPeriod:
        modifyData.lockingPeriod && modifyData.lockingPeriod.length === 2
          ? modifyData.lockingPeriod
          : originalData.lockingPeriod,
      period:
        modifyData.period && modifyData.period.trim() !== ""
          ? modifyData.period
          : originalData.period && originalData.period.trim() !== ""
            ? originalData.period
            : new Date().toISOString().split("T")[0], // Triple backup to avoid validation error
      _id: undefined,
      originalLeaseId: originalData.originalLeaseId || originalData._id,
      previousVersionId: originalData._id,
      versionNumber: (originalData.versionNumber || 1) + 1,
      status: "active",

      // Preserve Transfer details during modification
      iuStatus: modifyData.iuStatus || originalData.iuStatus || undefined,
      dateOfIUTransfer:
        modifyData.dateOfIUTransfer ||
        originalData.dateOfIUTransfer ||
        undefined,
      dateOfIUReceived:
        modifyData.dateOfIUReceived ||
        originalData.dateOfIUReceived ||
        undefined,
      iuTransferData:
        modifyData.iuTransferData || originalData.iuTransferData || undefined,
      transferredToUserId:
        modifyData.transferredToUserId ||
        originalData.transferredToUserId ||
        undefined,
      transferredFromUserId:
        modifyData.transferredFromUserId ||
        originalData.transferredFromUserId ||
        undefined,
    };

    const savedLease = await leaseModel.create([newLeaseData], { session });

    await session.commitTransaction();
    session.endSession();

    // Calculate changes and log (after commit so audit failure never blocks the save)
    try {
      const changes = getChanges(originalData, savedLease[0].toObject());
      if (Object.keys(changes).length > 0) {
        await AuditLog.create({
          entityType: "Lease",
          entityId: savedLease[0].originalLeaseId,
          entityName: savedLease[0].lessorName,
          action: "MODIFIED",
          performedBy: originalData.userId || "System",
          changes,
          timestamp: new Date(),
        });
      }
    } catch (auditErr) {
      console.error("Audit log error (non-blocking):", auditErr);
    }

    return res.status(201).json({
      message: "Lease modification added successfully",
      data: savedLease[0],
    });
  } catch (error: any) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    console.error("Lease modification error:", error);
    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Validation Error",
        details: Object.values(error.errors).map((err: any) => err.message),
      });
    }
    if (error.code === 11000) {
      return res.status(409).json({
        error: "Duplicate entry detected",
        details: error.keyValue,
      });
    }
    return res.status(500).json({
      error: "An error occurred",
      details: error.message || "Unknown error",
    });
  }
};

/**
 * Lease Update Controller
 */
export const updateLeaseController: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    const token = req.headers.authorization?.split("Bearer ")[1];
    const requestUser = token ? await getUser(token) : null;

    // Step 1: Find existing lease
    const existingLease = await leaseModel.findById(id);
    if (!existingLease) {
      return res.status(404).json({ message: "Lease not found" });
    }

    // Validate subsequent ROU adjustments against modification date
    if (existingLease.leaseModificationDate && updateData.rouAdjustments) {
      const modTime = new Date(existingLease.leaseModificationDate).getTime();
      const invalidAdj = updateData.rouAdjustments.find((adj: any) => {
        if (!adj.adjustmentDate) return false;
        return new Date(adj.adjustmentDate).getTime() < modTime;
      });
      if (invalidAdj) {
        return res.status(400).json({
          error:
            "ROU adjustment date cannot be earlier than the lease modification date.",
        });
      }
    }

    // Check if lessorName is being updated and if it would cause a duplicate
    if (
      updateData.lessorName &&
      updateData.lessorName !== existingLease.lessorName
    ) {
      const duplicateLease = await leaseModel.findOne({
        userId: existingLease.userId,
        iuStatus: { $exists: false }, // Only check duplicates for non-transfer leases
        lessorName: {
          $regex: new RegExp(`^${updateData.lessorName.trim()}$`, "i"),
        },
        _id: { $ne: existingLease._id }, // Exclude current lease from the check
      });

      if (duplicateLease) {
        return res.status(400).json({
          error: `A lease with lessor name "${updateData.lessorName}" already exists for this user. Please use a different lessor name.`,
        });
      }
    }

    const adminId = getAdminId(requestUser);
    const updateQuery: any = { $set: updateData };

    // Map newUserId to transferredToUserId if frontend sent it
    if (updateData.newUserId !== undefined) {
      if (updateData.newUserId) {
        updateQuery.$set.transferredToUserId = updateData.newUserId;
      }
      delete updateQuery.$set.newUserId;
    }

    // Preserve transfer information if it exists in the database but is missing or empty in the update payload
    const transferFields = [
      "iuStatus",
      "dateOfIUTransfer",
      "dateOfIUReceived",
      "iuTransferData",
      "transferredToUserId",
      "transferredFromUserId",
    ];
    // Cast lease document to a record for safe dynamic key access
    const existingLeaseRecord = existingLease as unknown as Record<string, any>;
    for (const field of transferFields) {
      if (
        existingLeaseRecord[field] &&
        (!updateQuery.$set[field] || updateQuery.$set[field] === "")
      ) {
        updateQuery.$set[field] = existingLeaseRecord[field];
      }
    }

    // Fill missing IDs from context if they aren't in the lease yet
    if (!existingLease.adminId && adminId) {
      updateQuery.$set.adminId = adminId;
    }
    if (!existingLease.locationId) {
      const locId = requestUser?.locationId || updateData.locationId;
      if (locId) updateQuery.$set.locationId = locId;
    }

    // Step 2: If transitioning from termination to active
    if (
      existingLease.status === "terminated" &&
      updateData.status === "active"
    ) {
      // Remove conflicting keys from $set if they exist
      delete updateQuery.$set.leaseTerminationDate;
      delete updateQuery.$set.remarks;

      // Add to $unset to clear them
      updateQuery.$unset = {
        leaseTerminationDate: "",
        remarks: "",
      };
    }

    // Step 3: If transitioning from closed to active
    if (existingLease.status === "closed" && updateData.status === "active") {
      // Remove conflicting keys from $set if they exist
      delete updateQuery.$set.leaseClosureDate;

      // Add to $unset to clear only leaseClosureDate (remarks are kept)
      updateQuery.$unset = {
        leaseClosureDate: "",
      };
    }

    // Step 3: Perform update
    const updatedLease = await leaseModel.findByIdAndUpdate(id, updateQuery, {
      new: true,
    });

    // Delete the cache associated with this lease version since it has changed
    await LeaseCalculationCache.deleteMany({ leaseVersionId: id });

    if (updatedLease) {
      // Calculate changes and log (non-blocking — audit failure must not affect the response)
      try {
        const changes = getChanges(
          existingLease.toObject(),
          updatedLease.toObject(),
        );
        if (Object.keys(changes).length > 0) {
          await AuditLog.create({
            entityType: "Lease",
            entityId: updatedLease.originalLeaseId || updatedLease._id,
            entityName: updatedLease.lessorName,
            action: "UPDATED",
            performedBy: updatedLease.userId || "System",
            changes,
            timestamp: new Date(),
          });
        }
      } catch (auditErr) {
        console.error("Audit log error (non-blocking):", auditErr);
      }
    }

    return res.status(200).json({
      message: "Lease updated successfully",
      data: updatedLease,
    });
  } catch (error) {
    console.error("Update Lease error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Lease Get Controller
 */
export const getLeaseController: RequestHandler = async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    const requestUser = token ? await getUser(token) : null;

    const query = buildLeaseQuery(requestUser, req.query);

    if (!query) {
      return res.status(400).json({ message: "userId or adminId is required" });
    }

    const leases = await leaseModel.find(query).sort({ _id: -1 }).lean();
    await attachUserNamesToLeases(leases, token); // Attach names from Admin Project

    const leaseMap = new Map();
    leases.forEach((lease) => {
      const key = lease.originalLeaseId?.toString() || lease._id.toString();
      if (!leaseMap.has(key)) {
        leaseMap.set(key, { activeLease: null, previousVersions: [] });
      }
      if (
        lease.status === "active" ||
        lease.status === "terminated" ||
        lease.status === "closed" ||
        lease.status === "transferred"
      ) {
        leaseMap.get(key).activeLease = lease;
      } else {
        leaseMap.get(key).previousVersions.push(lease);
      }
    });
    const result = Array.from(leaseMap.values());
    return res.status(200).json({ leases: result });
  } catch (error) {
    console.error("Get Lease error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
// This controller is specifically designed to fetch leases for movement
export const getLeaseFormovementController: RequestHandler = async (
  req,
  res,
) => {
  const { startDate, endDate } = req.query;

  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    const requestUser = token ? await getUser(token) : null;

    const query = buildLeaseQuery(requestUser, req.query);

    if (!query) {
      return res.status(400).json({ message: "userId or adminId is required" });
    }
    const allLeases = await leaseModel.find(query).sort({ _id: -1 }).lean();
    await attachUserNamesToLeases(allLeases, token); // Attach names from Admin Project

    const leaseGroups = new Map<string, any[]>();

    allLeases.forEach((lease) => {
      const key = lease.originalLeaseId?.toString() || lease._id.toString();
      if (!leaseGroups.has(key)) leaseGroups.set(key, []);
      leaseGroups.get(key)!.push(lease);
    });

    const result = [];

    for (const [key, group] of leaseGroups.entries()) {
      group.sort((a, b) => b.versionNumber - a.versionNumber);

      const latestVersion = group[0];
      const versionOne = group.find((l) => l.versionNumber === 1);

      const queryStartDate = new Date(startDate as string);
      const queryEndDate = new Date(endDate as string);

      const versionOneStartDate = new Date(versionOne?.leaseWorkingPeriod?.[0]);

      // 🔴 Cut-off check
      if (versionOne?.cutOffDate) {
        const cutOffDate = new Date(versionOne.cutOffDate);

        if (queryStartDate <= cutOffDate) {
          continue;
        }
      }

      // 🔴 Start-date check
      if (!(versionOneStartDate < queryEndDate)) {
        continue;
      }

      let activeLease = group.find(
        (lease) =>
          lease.status === "active" ||
          lease.status === "terminated" ||
          lease.status === "closed" ||
          lease.status === "transferred",
      );

      if (!activeLease) activeLease = latestVersion;

      const previousVersions = group.filter(
        (lease) => lease._id.toString() !== activeLease!._id.toString(),
      );

      result.push({
        activeLease,
        previousVersions,
      });
    }

    res.status(200).json({ leases: result });
  } catch (error) {
    console.error("Error fetching lease data:", error);
    res.status(500).json({ message: "Error fetching lease data", error });
  }
};

/**
 * Lease Delete Controller
 */
export const deleteLeaseController: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    // First find the lease we're about to delete
    const leaseToDelete = await leaseModel.findById(id);
    if (!leaseToDelete)
      return res.status(404).json({ message: "Lease not found" });

    let previousVersionReactivated = false;
    let previousVersion = null;

    if (leaseToDelete.previousVersionId) {
      previousVersion = await leaseModel.findById(
        leaseToDelete.previousVersionId,
      );
    }

    // Delete the requested lease FIRST to avoid duplicate index error
    const deletedLease = await leaseModel.findByIdAndDelete(id);

    // Delete the cache associated with this lease version
    await LeaseCalculationCache.deleteMany({ leaseVersionId: id });

    // Log deletion
    if (leaseToDelete) {
      await AuditLog.create({
        entityType: "Lease",
        entityId: leaseToDelete.originalLeaseId || leaseToDelete._id,
        entityName: leaseToDelete.lessorName,
        action: "DELETED",
        performedBy: leaseToDelete.userId || "System",
        changes: {},
        timestamp: new Date(),
      });
    }

    // If this is a versioned lease (not original), reactivate the previous version
    if (previousVersion) {
      // Update the previous version to be active again
      previousVersion.status = "active";
      await previousVersion.save();
      previousVersionReactivated = true;
    }

    return res.status(200).json({
      message: "Lease deleted successfully",
      data: deletedLease,
      previousVersionReactivated,
    });
  } catch (error) {
    console.error("Delete Lease error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Get Lease Logs Controller
 */
export const getLeaseLogsController: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    // Find all logs for the lease (by originalLeaseId)
    const logs = await AuditLog.find({ entityId: id }).sort({ timestamp: -1 });
    res.status(200).json({ logs });
  } catch (error) {
    console.error("Get Audit Logs error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
/**
 * Get All Lease Logs Controller
 */
export const getAllLeaseLogsController: RequestHandler = async (req, res) => {
  try {
    const { userId } = req.query;
    const filter: any = {};
    if (userId) filter.performedBy = userId;
    const logs = await AuditLog.find(filter).sort({ timestamp: -1 }).limit(100);
    res.status(200).json({ logs });
  } catch (error) {
    console.error("Get All Audit Logs error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
/**
 * Lease Transfer Controller (IU Transfer)
 */
export const leaseTransferController: RequestHandler = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params; // Active Lease ID of the sender
    const { newUserId, dateOfIUTransfer, dateOfIUReceived } = req.body;
    const receiverId = newUserId;

    if (!receiverId || !dateOfIUTransfer || !dateOfIUReceived) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        error: "newUserId, dateOfIUTransfer and dateOfIUReceived are required",
      });
    }

    const activeLease = await leaseModel.findById(id).session(session);
    if (!activeLease) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Active lease not found" });
    }
    if (activeLease.userId?.toString() === receiverId?.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ error: "Sender and receiver cannot be the same user" });
    }

    const senderUserId = activeLease.userId;
    const rootOriginalLeaseId = activeLease.originalLeaseId || activeLease._id;

    // 1. Identify all versions of this lease from the sender's side
    const senderVersions = await leaseModel
      .find({
        originalLeaseId: rootOriginalLeaseId,
      })
      .sort({ versionNumber: 1 })
      .session(session);

    // 2. Freeze sender's lease as a historical transferred record (similar to termination)
    activeLease.status = "transferred";
    activeLease.iuStatus = "IU Transferred";
    activeLease.transferredToUserId = receiverId;
    activeLease.dateOfIUTransfer = dateOfIUTransfer;
    activeLease.iuTransferData = req.body.iuTransferData;
    // Transferred leases should not inherit a termination date from the transfer event.
    activeLease.leaseTerminationDate = undefined;
    await activeLease.save({ session });
    await LeaseCalculationCache.deleteMany({ leaseVersionId: id }).session(
      session,
    );

    // 3. Clone all versions for receiver with exact lease data and same status/version chain
    const receiverIdMapping = new Map();
    let newOriginalLeaseId: any = null;

    for (const version of senderVersions) {
      const versionObj: any = version.toObject();
      const oldId = versionObj._id.toString();

      delete versionObj._id;
      delete versionObj.createdAt;
      delete versionObj.updatedAt;
      delete versionObj.__v;

      // Minimal transfer metadata only; keep lease payload/status exactly same
      versionObj.userId = receiverId;
      versionObj.iuStatus = "IU Received";
      versionObj.transferredFromUserId = senderUserId;
      versionObj.dateOfIUReceived = dateOfIUReceived;
      versionObj.iuTransferData = req.body.iuTransferData;
      delete versionObj.dateOfIUTransfer;
      delete versionObj.transferredToUserId;

      // Handle version linking
      if (versionObj.previousVersionId) {
        versionObj.previousVersionId = receiverIdMapping.get(
          versionObj.previousVersionId.toString(),
        );
      }

      const clonedVersion = new leaseModel(versionObj);
      const savedClone = await clonedVersion.save({ session });

      receiverIdMapping.set(oldId, savedClone._id);

      // Set new originalLeaseId based on the first version created for the receiver
      if (!newOriginalLeaseId) {
        newOriginalLeaseId = savedClone._id;
      }

      // Update originalLeaseId for all versions in the new chain
      await leaseModel.findByIdAndUpdate(
        savedClone._id,
        {
          originalLeaseId: newOriginalLeaseId,
        },
        { session },
      );
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "Entire lease history transferred successfully",
    });
  } catch (error: any) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    console.error("Lease history transfer error:", error);
    return res
      .status(500)
      .json({ error: "Transfer failed", details: error.message });
  }
};

/**
 * Get All Users Controller (Fetches from external Admin API)
 */
// admin token
export const getAllUsersController: RequestHandler = async (req, res) => {
  try {
    const adminToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OThiMTczNTEyMWJmYzE0ZGEwYjA5YzkiLCJlbWFpbCI6ImRlbW9ybmJwcGx1c0BnbWFpbC5jb20iLCJyb2xlIjoiQURNSU4iLCJhZG1pbklkIjpudWxsLCJmdWxsTmFtZSI6IkRlbW8gUk5CUCBQbHVzIExpbWl0ZWQiLCJzdWJSb2xlIjoiIiwidXNlckxpbWl0Ijo0LCJpc1NjaGVkdWxlT25seSI6dHJ1ZSwiaXNScHRPbmx5Ijp0cnVlLCJpc0xlYXNlT25seSI6dHJ1ZSwid2hpY2giOiIiLCJsb2NhdGlvbklkIjpudWxsLCJMb2NhdGlvbiI6IiIsImlhdCI6MTc4MTYyNDkxNCwiZXhwIjoxNzgxNzExMzE0fQ.288bDy1ll8aBsNso9GNeVy8-GLzh-iSeANztIWOR6ik";
    const apiUrl = "https://schedule-iii-dev.finsensor.ai/api/v1/ex/user/users";

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
    });

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: "Failed to fetch users from Admin API" });
    }

    const data = (await response.json()) as any;
    // Map the external user data to a simpler format for the frontend
    const users = (data.data || []).map((user: any) => ({
      id: user._id,
      name: user.fullName || user.name,
      location: user.Location || user.location,
      locationId: user.locationId,
      leaseGroup: user.group || user.leaseGroup,
    }));

    return res.status(200).json({ users });
  } catch (error: any) {
    console.error("Error fetching all users:", error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
};

/**
 * Request Undo Transfer Controller (Sender side)
 */
export const requestUndoTransferController: RequestHandler = async (
  req,
  res,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params; // Active Lease ID of the sender (the transferred lease)

    const senderLease = await leaseModel.findById(id).session(session);
    if (!senderLease) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Lease not found" });
    }

    if (senderLease.status !== "transferred") {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ error: "Only transferred leases can request undo" });
    }

    const receiverUserId = senderLease.transferredToUserId;
    if (!receiverUserId) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ error: "Receiver info not found on the transferred lease" });
    }

    // Find receiver's corresponding active lease
    const receiverActiveLease = await leaseModel
      .findOne({
        userId: receiverUserId,
        transferredFromUserId: senderLease.userId,
        lessorName: senderLease.lessorName,
        status: { $in: ["active", "terminated", "closed", "transferred"] },
      })
      .session(session);

    if (!receiverActiveLease) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ error: "Active lease on the receiver side not found" });
    }

    // Update status to pending on both sender's lease and receiver's active lease
    senderLease.transferUndoStatus = "pending";
    receiverActiveLease.transferUndoStatus = "pending";

    await senderLease.save({ session });
    await receiverActiveLease.save({ session });

    // Clear caches
    await LeaseCalculationCache.deleteMany({ leaseVersionId: id }).session(
      session,
    );
    await LeaseCalculationCache.deleteMany({
      leaseVersionId: receiverActiveLease._id,
    }).session(session);

    // Audit log
    await AuditLog.create({
      entityType: "Lease",
      entityId: senderLease.originalLeaseId || senderLease._id,
      entityName: senderLease.lessorName,
      action: "REQUEST_UNDO_TRANSFER",
      performedBy: senderLease.userId || "System",
      changes: { transferUndoStatus: "pending" },
      timestamp: new Date(),
    });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message:
        "Undo request sent successfully. Waiting for receiver's approval.",
    });
  } catch (error: any) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    console.error("Request undo transfer error:", error);
    return res
      .status(500)
      .json({ error: "Request failed", details: error.message });
  }
};

/**
 * Cancel Undo Transfer Controller (Sender side)
 */
export const cancelUndoTransferController: RequestHandler = async (
  req,
  res,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    const senderLease = await leaseModel.findById(id).session(session);
    if (!senderLease) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Lease not found" });
    }

    if (senderLease.transferUndoStatus !== "pending") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "No pending undo request found" });
    }

    const receiverUserId = senderLease.transferredToUserId;
    if (!receiverUserId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "Receiver info not found" });
    }

    const receiverActiveLease = await leaseModel
      .findOne({
        userId: receiverUserId,
        transferredFromUserId: senderLease.userId,
        lessorName: senderLease.lessorName,
        status: { $in: ["active", "terminated", "closed", "transferred"] },
      })
      .session(session);

    // Unset transferUndoStatus on sender lease
    await leaseModel.findByIdAndUpdate(
      senderLease._id,
      { $unset: { transferUndoStatus: "" } },
      { session },
    );

    // Unset transferUndoStatus on receiver active lease if exists
    if (receiverActiveLease) {
      await leaseModel.findByIdAndUpdate(
        receiverActiveLease._id,
        { $unset: { transferUndoStatus: "" } },
        { session },
      );
      await LeaseCalculationCache.deleteMany({
        leaseVersionId: receiverActiveLease._id,
      }).session(session);
    }

    await LeaseCalculationCache.deleteMany({ leaseVersionId: id }).session(
      session,
    );

    await AuditLog.create({
      entityType: "Lease",
      entityId: senderLease.originalLeaseId || senderLease._id,
      entityName: senderLease.lessorName,
      action: "CANCEL_UNDO_TRANSFER",
      performedBy: senderLease.userId || "System",
      changes: { transferUndoStatus: "cancelled" },
      timestamp: new Date(),
    });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "Undo request cancelled successfully.",
    });
  } catch (error: any) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    console.error("Cancel undo transfer error:", error);
    return res
      .status(500)
      .json({ error: "Cancel failed", details: error.message });
  }
};

/**
 * Approve Undo Transfer Controller (Receiver side)
 */
export const approveUndoTransferController: RequestHandler = async (
  req,
  res,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params; // Active Lease ID of the receiver

    const receiverLease = await leaseModel.findById(id).session(session);
    if (!receiverLease) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Lease not found" });
    }

    if (receiverLease.transferUndoStatus !== "pending") {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ error: "No pending undo request found for this lease" });
    }

    const senderUserId = receiverLease.transferredFromUserId;
    if (!senderUserId) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ error: "Sender info not found on the transferred lease" });
    }

    // Find sender's corresponding transferred lease
    const senderLease = await leaseModel
      .findOne({
        userId: senderUserId,
        transferredToUserId: receiverLease.userId,
        lessorName: receiverLease.lessorName,
        status: "transferred",
      })
      .session(session);

    if (!senderLease) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ error: "Sender's transferred lease not found" });
    }

    // 1. Delete all versions of the cloned lease on the receiver's side
    const receiverQuery = {
      userId: receiverLease.userId,
      transferredFromUserId: senderUserId,
      lessorName: receiverLease.lessorName,
    };

    const receiverLeasesToDelete = await leaseModel
      .find(receiverQuery)
      .select("_id")
      .session(session);
    const receiverLeaseIds = receiverLeasesToDelete.map((l) => l._id);

    await leaseModel.deleteMany(receiverQuery).session(session);

    if (receiverLeaseIds.length > 0) {
      await LeaseCalculationCache.deleteMany({
        leaseVersionId: { $in: receiverLeaseIds },
      }).session(session);
    }

    // 2. Restore sender's lease status and clear transfer details
    await leaseModel.findByIdAndUpdate(
      senderLease._id,
      {
        $set: { status: "active" },
        $unset: {
          iuStatus: "",
          dateOfIUTransfer: "",
          transferredToUserId: "",
          iuTransferData: "",
          transferUndoStatus: "",
        },
      },
      { session },
    );

    await LeaseCalculationCache.deleteMany({
      leaseVersionId: senderLease._id,
    }).session(session);

    await AuditLog.create({
      entityType: "Lease",
      entityId: senderLease.originalLeaseId || senderLease._id,
      entityName: senderLease.lessorName,
      action: "APPROVE_UNDO_TRANSFER",
      performedBy: receiverLease.userId || "System",
      changes: { status: { from: "transferred", to: "active" } },
      timestamp: new Date(),
    });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message:
        "Undo request approved. The lease has been returned to the sender.",
    });
  } catch (error: any) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    console.error("Approve undo transfer error:", error);
    return res
      .status(500)
      .json({ error: "Approval failed", details: error.message });
  }
};

/**
 * Reject Undo Transfer Controller (Receiver side)
 */
export const rejectUndoTransferController: RequestHandler = async (
  req,
  res,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params; // Active Lease ID of the receiver

    const receiverLease = await leaseModel.findById(id).session(session);
    if (!receiverLease) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Lease not found" });
    }

    if (receiverLease.transferUndoStatus !== "pending") {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ error: "No pending undo request found for this lease" });
    }

    const senderUserId = receiverLease.transferredFromUserId;
    if (!senderUserId) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ error: "Sender info not found on the transferred lease" });
    }

    const senderLease = await leaseModel
      .findOne({
        userId: senderUserId,
        transferredToUserId: receiverLease.userId,
        lessorName: receiverLease.lessorName,
        status: "transferred",
      })
      .session(session);

    // Unset transferUndoStatus on receiver lease
    await leaseModel.findByIdAndUpdate(
      receiverLease._id,
      { $unset: { transferUndoStatus: "" } },
      { session },
    );

    // Unset transferUndoStatus on sender lease
    if (senderLease) {
      await leaseModel.findByIdAndUpdate(
        senderLease._id,
        { $unset: { transferUndoStatus: "" } },
        { session },
      );
      await LeaseCalculationCache.deleteMany({
        leaseVersionId: senderLease._id,
      }).session(session);
    }

    await LeaseCalculationCache.deleteMany({ leaseVersionId: id }).session(
      session,
    );

    await AuditLog.create({
      entityType: "Lease",
      entityId: receiverLease.originalLeaseId || receiverLease._id,
      entityName: receiverLease.lessorName,
      action: "REJECT_UNDO_TRANSFER",
      performedBy: receiverLease.userId || "System",
      changes: { transferUndoStatus: "rejected" },
      timestamp: new Date(),
    });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      message: "Undo request rejected.",
    });
  } catch (error: any) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    console.error("Reject undo transfer error:", error);
    return res
      .status(500)
      .json({ error: "Rejection failed", details: error.message });
  }
};
