import { RequestHandler } from "express";
import dotenv from "dotenv";
import leaseModel from "../../models/lease.model";
import { Period } from "../../models/period.model";
dotenv.config();

export const leaseController: RequestHandler = async (req, res) => {
  try {
    const leaseData = req.body;

    if (!Array.isArray(leaseData) || leaseData.length === 0) {
      return res.status(400).json({ error: "Invalid lease data provided" });
    }

    // Add versioning fields
    const leasesWithVersioning = leaseData.map(lease => ({
      ...lease,
      versionNumber: 1, // Set initial version number
    }));

    const savedLeases = await leaseModel.insertMany(leasesWithVersioning);

    // Update originalLeaseId to match _id after creation
    await Promise.all(
      savedLeases.map(lease =>
        leaseModel.findByIdAndUpdate(lease._id, { originalLeaseId: lease._id })
      )
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
  try {
    const { id } = req.params;
    const modifyData = req.body;
    const originalData = await leaseModel.findById(id).lean();
    if (!originalData) {
      return res.status(404).json({ error: "Lease data not found" });
    }
    
    if (!modifyData || typeof modifyData !== "object") {
      return res.status(400).json({ error: "Invalid lease data provided" });
    }
    await leaseModel.findByIdAndUpdate(id, { status: "modified" }, { new: true });
    const newAgreementCode = `${originalData?.agreementCode}-v${(originalData?.versionNumber || 1) + 1}`;
    const newLeaseData = {
      ...originalData,
      ...modifyData,
      _id: undefined, // Remove old ID
      agreementCode: newAgreementCode,
      originalLeaseId: originalData?.originalLeaseId || originalData._id, // Track first lease
      previousVersionId: originalData._id, // Link to previous version
      versionNumber: (originalData?.versionNumber || 1) + 1, // Increment version
      status: "active",
    };

    const savedLease = await leaseModel.create(newLeaseData);
    return res.status(201).json({
      message: "Lease modification added successfully",
      data: savedLease,
    });

  } catch (error: any) {
    console.error("Lease modification error:", error);
    return res.status(500).json({
      error: "An error occurred",
      details: error.message || "Unknown error",
    });
  }
};

/**
 * Lease Update Controller
 */
export const updateLeaseController : RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const updatedLease = await leaseModel.findByIdAndUpdate(id, updateData, { new: true });
    if (!updatedLease) return res.status(404).json({ message: "Lease not found" });
    return res.status(200).json({ message: "Lease updated successfully", data: updatedLease });
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
    const leases = await leaseModel.find().sort({ _id: -1 }).lean();
    const leaseMap = new Map();
    leases.forEach(lease => {
      const key = lease.originalLeaseId?.toString() || lease._id.toString();
      if (!leaseMap.has(key)) {
        leaseMap.set(key, { activeLease: null, previousVersions: [] });
      }
      if (lease.status === "active" || lease.status === "close") {
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
export const getLeaseFormovementController : RequestHandler = async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    const leases = await leaseModel.find({});
    const filteredLeases = leases.filter((lease) => {
      if (!lease.period) return false;     
      const leasePeriodDate = new Date(lease.period.split("-").reverse().join("-"));       
      return leasePeriodDate >= start && leasePeriodDate <= end;
    });

    res.status(200).json({ leases: filteredLeases });
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: 'Error fetching lease data', error });
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
    if (!leaseToDelete) return res.status(404).json({ message: "Lease not found" });

    // If this is a versioned lease (not original), find and reactivate the previous version
    if (leaseToDelete.previousVersionId) {
      const previousVersion = await leaseModel.findById(leaseToDelete.previousVersionId);
      if (previousVersion) {
        // Update the previous version to be active again
        previousVersion.status = "active";
        await previousVersion.save();
      }
    }

    // Now delete the requested lease
    const deletedLease = await leaseModel.findByIdAndDelete(id);
    
    return res.status(200).json({ 
      message: "Lease deleted successfully", 
      data: deletedLease,
      previousVersionReactivated: !!leaseToDelete.previousVersionId
    });
    
  } catch (error) {
    console.error("Delete Lease error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};



/**
 * Create Period Controller
 */
export const periodController: RequestHandler = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.body;
      if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start date and end date are required' });
    }

    const newPeriod = new Period({ startDate, endDate, status });
    await newPeriod.save();

    res.status(201).json({ message: 'Period created successfully', data: newPeriod });
  } catch (error) {
    console.error('Create Period Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

/**
 * Update Period Controller
 */
export const updatePeriodController: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, status } = req.body;

    const updatedPeriod = await Period.findByIdAndUpdate(
      id,
      { startDate, endDate, status },
      { new: true }
    );

    if (!updatedPeriod) {
      return res.status(404).json({ message: 'Period not found' });
    }

    res.status(200).json({ message: 'Period updated successfully', data: updatedPeriod });
  } catch (error) {
    console.error('Update Period Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

/**
 * Get All Periods Controller
 */
export const getPeriodController: RequestHandler = async (req, res) => {
  try {
    const periods = await Period.find().sort({ createdAt: -1 });
    res.status(200).json({ message: 'Periods fetched successfully', data: periods });
  } catch (error) {
    console.error('Get Periods Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

/**
 * Delete Period Controller
 */
export const deletePeriodController: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedPeriod = await Period.findByIdAndDelete(id);

    if (!deletedPeriod) {
      return res.status(404).json({ message: 'Period not found' });
    }

    res.status(200).json({ message: 'Period deleted successfully' });
  } catch (error) {
    console.error('Delete Period Error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
