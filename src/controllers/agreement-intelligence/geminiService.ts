import { GoogleGenAI } from "@google/genai";

// Circuit Breaker & Health Tracking State
interface ModelHealth {
  consecutiveFailures: number;
  circuitOpenUntil: number; // timestamp in ms
}

const modelHealthMap = new Map<string, ModelHealth>();

// Default model cascade hierarchy for automatic fallback
const DEFAULT_MODEL_CASCADE = [
  "gemini-2.5-flash",
  "gemini-3.5-flash",
  "gemini-3.7-flash",
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
];

function isTransientError(error: any): boolean {
  if (!error) return false;
  const msg = String(error.message || error.stack || error).toLowerCase();
  const status = error.status || error.statusCode || error.code;

  if ([500, 502, 503, 504, 429].includes(status)) return true;
  if (
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("demand") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("resource_exhausted") ||
    msg.includes("fetch failed") ||
    msg.includes("internal server error") ||
    msg.includes("high load") ||
    msg.includes("temporary")
  ) {
    return true;
  }
  return false;
}

function getModelCascade(requestedModel: string): string[] {
  const cascade = [requestedModel];
  for (const m of DEFAULT_MODEL_CASCADE) {
    if (!cascade.includes(m)) {
      cascade.push(m);
    }
  }
  return cascade;
}

function isCircuitOpen(model: string): boolean {
  const health = modelHealthMap.get(model);
  if (!health) return false;
  if (Date.now() < health.circuitOpenUntil) {
    return true;
  }
  return false;
}

function recordSuccess(model: string) {
  modelHealthMap.set(model, { consecutiveFailures: 0, circuitOpenUntil: 0 });
}

function recordFailure(model: string) {
  const health = modelHealthMap.get(model) || { consecutiveFailures: 0, circuitOpenUntil: 0 };
  health.consecutiveFailures += 1;
  if (health.consecutiveFailures >= 3) {
    health.circuitOpenUntil = Date.now() + 3 * 60 * 1000; // 3 minutes cooldown
    console.warn(
      `[Gemini AI Gateway] Circuit breaker TRIPPED for model '${model}' until ${new Date(health.circuitOpenUntil).toLocaleTimeString()}`,
    );
  }
  modelHealthMap.set(model, health);
}

const delayMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function callGemini(
  geminiApiKey: string,
  geminiModel: string,
  content: string,
  formatJson = false,
  systemInstruction?: string,
): Promise<{ text: string; costInr: number }> {
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const cascade = getModelCascade(geminiModel);

  // Filter models that are in a circuit breaker cooldown state, unless all are open
  let candidateModels = cascade.filter((m) => !isCircuitOpen(m));
  if (candidateModels.length === 0) {
    console.warn("[Gemini AI Gateway] All models in circuit open state. Forcing attempt on primary model.");
    candidateModels = cascade;
  }

  let lastError: any = null;

  for (const currentModel of candidateModels) {
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const request: any = {
          model: currentModel,
          contents: content,
          config: {
            temperature: 0,
          },
        };

        if (formatJson) {
          request.config.responseMimeType = "application/json";
        }
        if (systemInstruction) {
          request.config.systemInstruction = systemInstruction;
        }

        const response = await ai.models.generateContent(request);
        const responseText = response.text || "";

        if (!responseText.trim()) {
          throw new Error(`Empty response received from Gemini model '${currentModel}'.`);
        }

        // Calculate token usage & cost estimate
        const usage = response.usageMetadata;
        let finalCostInr = 0;
        if (usage) {
          const inputTokens = usage.promptTokenCount || 0;
          const outputTokens = usage.candidatesTokenCount || 0;
          const costUsd = (inputTokens / 1000000) * 0.075 + (outputTokens / 1000000) * 0.3;
          finalCostInr = costUsd * 95; // 1 USD = 95 INR

          console.log(
            `[Gemini Cost Estimate] Model: ${currentModel} | ` +
              `Input Tokens: ${inputTokens} | ` +
              `Output Tokens: ${outputTokens} | ` +
              `Est. Cost: ₹${finalCostInr.toFixed(4)}`,
          );
        }

        recordSuccess(currentModel);
        return { text: responseText.trim(), costInr: finalCostInr };
      } catch (err: any) {
        lastError = err;
        const transient = isTransientError(err);

        console.warn(
          `[Gemini AI Gateway Warning] Model '${currentModel}' (Attempt ${attempt}/${MAX_RETRIES}) failed: ${err.message || err}`,
        );

        if (transient && attempt < MAX_RETRIES) {
          // Exponential backoff: 1.5s, 3s, 5s
          const backoffTime = attempt === 1 ? 1500 : attempt === 2 ? 3000 : 5000;
          console.log(`[Gemini AI Gateway] Transient overload error detected. Retrying model '${currentModel}' in ${backoffTime}ms...`);
          await delayMs(backoffTime);
        } else {
          recordFailure(currentModel);
          break; // Move to next model in cascade
        }
      }
    }

    console.warn(`[Gemini AI Gateway] Model '${currentModel}' exhausted retries. Auto-switching to next model in cascade...`);
  }

  console.error("[Gemini AI Gateway Critical Error] All model attempts and retries failed.", lastError);
  throw lastError || new Error("All Gemini model attempts failed.");
}

export function sanitizeJsonString(str: string): string {
  let inString = false;
  let escaped = false;
  let result = "";

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char === '"' && !escaped) {
      inString = !inString;
      result += char;
    } else if (inString) {
      if (char === '\\' && !escaped) {
        escaped = true;
        result += char;
      } else {
        if (escaped) {
          escaped = false;
          result += char;
        } else if (char === '\n') {
          result += '\\n';
        } else if (char === '\r') {
          result += '\\r';
        } else if (char === '\t') {
          result += '\\t';
        } else if (char.charCodeAt(0) < 32) {
          result += '\\u' + ('0000' + char.charCodeAt(0).toString(16)).slice(-4);
        } else {
          result += char;
        }
      }
    } else {
      result += char;
      if (escaped) {
        escaped = false;
      }
    }
  }
  return result;
}

export function cleanJsonResponse(responseText: string): string {
  let cleanedText = responseText.trim();
  if (cleanedText.startsWith("```json")) {
    cleanedText = cleanedText.substring(7);
  } else if (cleanedText.startsWith("```")) {
    cleanedText = cleanedText.substring(3);
  }
  if (cleanedText.endsWith("```")) {
    cleanedText = cleanedText.substring(0, cleanedText.length - 3);
  }
  return sanitizeJsonString(cleanedText.trim());
}
