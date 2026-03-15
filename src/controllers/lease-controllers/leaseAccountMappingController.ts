import { Request, Response } from "express";
import LeaseAccountMapping from "../../models/leaseAccountMapping.model";

export const saveMapping = async (req: Request, res: Response) => {
  try {
    const { userId, mappings, disclosureSettings } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }

    const result = await LeaseAccountMapping.findOneAndUpdate(
      { userId },
      { mappings, disclosureSettings },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMapping = async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }

    const data = await LeaseAccountMapping.findOne({ userId });

    if (!data) {
      return res.status(200).json({ mappings: [], disclosureSettings: [] });
    }

    res.status(200).json({ 
      mappings: data.mappings || [], 
      disclosureSettings: data.disclosureSettings || [] 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
