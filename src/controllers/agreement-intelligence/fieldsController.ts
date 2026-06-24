import { Request, Response } from "express";

export const fieldsController = async (req: Request, res: Response) => {
  try {
    const { agreementId, fieldUpdates } = req.body;

    if (!agreementId || !fieldUpdates) {
      return res.status(400).json({ error: "agreementId and fieldUpdates are required" });
    }

    // Since we are not persisting extracted fields to the DB immediately in this stateless version,
    // we simply acknowledge the update. In a stateful version, this would update the DB record.
    console.log(`Fields updated for ${agreementId}:`, fieldUpdates);

    return res.status(200).json({ success: true, message: "Fields updated successfully" });
  } catch (error: any) {
    console.error("Error in fieldsController:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
};
