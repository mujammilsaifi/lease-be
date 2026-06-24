import { GoogleGenAI } from "@google/genai";

export async function callGemini(
  geminiApiKey: string,
  geminiModel: string,
  content: string,
  formatJson = false,
): Promise<{ text: string; costInr: number }> {
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const request: any = {
    model: geminiModel,
    contents: content,
    config: {
      temperature: 0,
    },
  };

  if (formatJson) {
    request.config.responseMimeType = "application/json";
  }

  const response = await ai.models.generateContent(request);
  const responseText = response.text || "";

  // Log token usage and estimated cost
  const usage = response.usageMetadata;
  let finalCostInr = 0;
  if (usage) {
    const inputTokens = usage.promptTokenCount || 0;
    const outputTokens = usage.candidatesTokenCount || 0;

    const costUsd =
      (inputTokens / 1000000) * 0.075 + (outputTokens / 1000000) * 0.3;
    const costInr = costUsd * 95; // 1 USD = 95 INR
    finalCostInr = costInr;

    console.log(
      `[Gemini Cost Estimate] Model: ${geminiModel} | ` +
        `Input Tokens: ${inputTokens} | ` +
        `Output Tokens: ${outputTokens} | ` +
        `Est. Cost: ₹${costInr.toFixed(4)}`,
    );
  }

  if (!responseText.trim()) {
    throw new Error("Empty response received from Gemini model.");
  }

  return { text: responseText.trim(), costInr: finalCostInr };
}

export function cleanJsonResponse(responseText: string): string {
  let cleanedText = responseText.trim();
  if (cleanedText.startsWith("\`\`\`json")) {
    cleanedText = cleanedText.substring(7);
  } else if (cleanedText.startsWith("\`\`\`")) {
    cleanedText = cleanedText.substring(3);
  }
  if (cleanedText.endsWith("\`\`\`")) {
    cleanedText = cleanedText.substring(0, cleanedText.length - 3);
  }
  return cleanedText.trim();
}
