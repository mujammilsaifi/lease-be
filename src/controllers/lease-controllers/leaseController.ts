import { RequestHandler } from "express";
import dotenv from "dotenv";
import leaseModel from "../../models/lease.model";
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