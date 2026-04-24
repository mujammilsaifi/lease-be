import { Request, Response } from "express";
import LeaseAccountMapping from "../../models/leaseAccountMapping.model";
import { getUser } from "../../services/auth";

export const saveMapping = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    const requestUser = token ? await getUser(token) : null;
    
    const { userId: bodyUserId, mappings, disclosureSettings, oiMappings } = req.body;
    
    const userId = bodyUserId || requestUser?._id;

    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }

    const result = await LeaseAccountMapping.findOneAndUpdate(
      { userId },
      { mappings, disclosureSettings, oi_mappings: oiMappings },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMapping = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    const requestUser = token ? await getUser(token) : null;
    
    const { userId: queryUserId } = req.query;
    
    const userId = queryUserId || requestUser?._id;

    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }

    const data = await LeaseAccountMapping.findOne({ userId });

    if (!data) {
      return res.status(200).json({ mappings: [], disclosureSettings: [], oiMappings: [] });
    }

    res.status(200).json({ 
      mappings: data.mappings || [], 
      disclosureSettings: data.disclosureSettings || [],
      oiMappings: data.oi_mappings || [] 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

