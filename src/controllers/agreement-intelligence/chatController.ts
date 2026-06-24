import { Request, Response } from "express";
import { callGemini, cleanJsonResponse } from "./geminiService";

export const chatController = async (req: Request, res: Response) => {
  try {
    const { message, extractedData } = req.body;

    if (!message || !extractedData) {
      return res.status(400).json({ error: "message and extractedData are required" });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    const prompt = `
      You are an AI assistant helping a user extract and map data from a lease agreement.
      You have access to the original lease text and the currently parsed data.

      The user has sent the following message: "${message}"

      If the user is asking a question, answer it based on the lease text.
      If the user is instructing you to update, map, or correct a field (e.g. "map performance deposit to security deposit", "update rent to 5000"), you MUST return the updated fields in the 'updatedFields' array.

      Original Lease Text (Context):
      [The original lease text is not available in this stateless mode. Rely solely on the extracted data below.]

      Currently Extracted Data:
      ${JSON.stringify(extractedData, null, 2)}

      Respond with a JSON object strictly in this format:
      {
        "text": "Your natural language response to the user",
        "updatedFields": [
          { "fieldName": "Name of Field", "newValue": "New Value", "status": "CONFIRMED_BY_USER" }
        ]
      }
      Do not include markdown or anything else, just the JSON.
    `;

    const { text: rawResponse } = await callGemini(geminiApiKey, geminiModel, prompt, true);
    const parsedResponse = JSON.parse(cleanJsonResponse(rawResponse));

    return res.status(200).json(parsedResponse);
  } catch (error: any) {
    console.error("Error in chatController:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
};
