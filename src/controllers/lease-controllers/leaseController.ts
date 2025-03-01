import { RequestHandler } from "express";
import dotenv from "dotenv";
import leaseModel from "../../models/lease.model";
import { Period } from "../../models/period.model";
dotenv.config();

export const LeaseController: RequestHandler = async (req, res) => {
  try {
    const leaseData = req.body;
    if (!Array.isArray(leaseData) || leaseData.length === 0) {
      return res.status(400).json({ error: "Invalid lease data provided" });
    }
    const savedLeases = await leaseModel.insertMany(leaseData);

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
export const GetLeaseController : RequestHandler = async (req, res) => {
  try {
    const leases = await leaseModel.find();
    return res.status(200).json({ leases });
  } catch (error) {
    console.error("Get Lease error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Lease Delete Controller
 */
export const DeleteLeaseController : RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedLease = await leaseModel.findByIdAndDelete(id);
    if (!deletedLease) return res.status(404).json({ message: "Lease not found" });
    return res.status(200).json({ message: "Lease deleted successfully", data: deletedLease });
  } catch (error) {
    console.error("Delete Lease error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};



/**
 * Create Period Controller
 */
export const PeriodController: RequestHandler = async (req, res) => {
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
export const GetPeriodController: RequestHandler = async (req, res) => {
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
export const DeletePeriodController: RequestHandler = async (req, res) => {
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
