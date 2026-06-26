import { GoogleGenAI } from "@google/genai";

export interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
}

export interface IntentResult {
  categories: string[];
  standaloneQuery: string;
  explanation: string;
}

// Classifies query intent and rewrites the query using conversation history to keep it self-contained
export async function classifyIntent(
  query: string,
  history: ChatMessage[],
  apiKey: string
): Promise<IntentResult> {
  const ai = new GoogleGenAI({ apiKey });
  
  // Format history as a conversation transcript
  const formattedHistory = history
    .filter((msg) => msg.id !== "welcome") // skip welcome message
    .map((msg) => `${msg.sender === "user" ? "User" : "AI"}: ${msg.text}`)
    .join("\n");

  const systemInstructions = `
    You are an expert intent classifier and query refiner for a lease accounting search engine.
    Analyze the user's latest query and the previous conversation history (if any).
    
    Your task is twofold:
    1. Classify the latest query into one or more of these exact categories:
       - LEASE_IDENTIFICATION (determining if an agreement contains a lease, identified asset, substitution rights, control)
       - LEASE_TERM (determining lease duration, options, renewal, termination, short term leases, rent-free periods)
       - COMMENCEMENT_DATE (commencement date, possession date, effective date rules)
       - DISCOUNT_RATE (discount rate, interest rate, incremental borrowing rate/IBR)
       - LEASE_LIABILITY (calculating lease liability, present value, payments, amortisation schedule, calculation formulas)
       - LEASE_MODIFICATION (modifying, ending, transferring, changing leases)
       - EXTRACTION_RULES (rules on how fields are extracted from lease documents)
       - VALIDATION (data validation, locking/working period defaults, consistency rules)
       - API_BEHAVIOUR (endpoints, payloads, system responses, SSE, chat formats)
       - COMMON_MISTAKES (common lease accounting errors, possession vs rent-free)
       - REAL_EXAMPLES (examples of parsed lease fields or calculations)
       
    2. Write a single, consolidated, search-optimized "standaloneQuery" in natural English.
       - If the latest query refers to previous conversation context (e.g. "Why is that?", "Calculate liability for this", "What about the renewal?", "Is it a lease?"), rewrite it to be fully self-contained so that a semantic database search will work.
       - If there is no history or the latest query is self-contained, the standaloneQuery can be identical to the query.
       
    Return your response strictly as a JSON object matching this schema, without any markdown backticks, explanations, or formatting:
    {
      "categories": ["CATEGORY_1", "CATEGORY_2"],
      "standaloneQuery": "self-contained search query string",
      "explanation": "brief reasoning for this classification"
    }
  `;

  const prompt = `
    ${formattedHistory ? `Conversation History:\n${formattedHistory}\n\n` : ""}
    Latest User Query: "${query}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstructions,
        responseMimeType: "application/json",
        temperature: 0,
      },
    });

    const text = response.text?.trim() || "";
    // Clean JSON markdown blocks if any
    const cleanJsonText = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    const result = JSON.parse(cleanJsonText) as IntentResult;
    
    if (!Array.isArray(result.categories)) {
      result.categories = ["LEASE_IDENTIFICATION"];
    }
    if (!result.standaloneQuery) {
      result.standaloneQuery = query;
    }
    
    console.log(`[Intent Classifier] Classified: ${result.categories.join(", ")} | Standalone Query: "${result.standaloneQuery}"`);
    return result;
  } catch (error) {
    console.error("[Intent Classifier] Classification failed, using fallback:", error);
    return {
      categories: ["LEASE_IDENTIFICATION"],
      standaloneQuery: query,
      explanation: "Fallback due to classification error"
    };
  }
}
