import { Request, Response } from "express";
import { callGemini, cleanJsonResponse } from "./geminiService";
import { processRAGQuery } from "../../services/knowledge";

export const chatController = async (req: Request, res: Response) => {
  try {
    const { message, extractedData, rawText, history } = req.body;

    if (!message || !extractedData) {
      return res.status(400).json({ error: "message and extractedData are required" });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    // 1. Process intent classification, retrieval, hybrid search scoring, and prompt building
    const brainResult = await processRAGQuery(
      message,
      history || [],
      rawText || "",
      extractedData,
      geminiApiKey
    );

    // 2. Call Gemini model with the synthesized retrieval prompt
    const { text: rawResponse } = await callGemini(geminiApiKey, geminiModel, brainResult.prompt, true);
    const parsedResponse = JSON.parse(cleanJsonResponse(rawResponse));

    // 3. Return response with embedded RAG debugging parameters
    return res.status(200).json({
      ...parsedResponse,
      _ragDebug: {
        intent: brainResult.intent,
        reasoning: brainResult.reasoning,
        context: brainResult.context,
      },
    });
  } catch (error: any) {
    console.error("Error in chatController:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
};

