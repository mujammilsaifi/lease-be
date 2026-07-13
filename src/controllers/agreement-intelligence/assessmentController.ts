import { Request, Response } from "express";
import LeaseAssessment, { ILeaseAssessmentQuestion } from "../../models/leaseAssessment.model";
import { getRequiredFilesForIntents } from "../../services/knowledge/companyRuleEngine";
import { retrieveScoredChunks } from "../../services/knowledge/retrievalEngine";
import { rerankCandidates } from "../../services/knowledge/reranker";
import { assembleContext } from "../../services/knowledge/contextAssembler";
import { callGemini, cleanJsonResponse } from "./geminiService";
import { performFinancialExtractionDirect } from "../lease-controllers/pdfExtractionController";

// Local helper to compute IND AS 116 recommendation as a deterministic fallback
export function computeRecommendation(questions: ILeaseAssessmentQuestion[]): {
  recommendation: "Lease" | "Service Contract" | "Exempt Lease";
  recommendationNarrative: string;
} {
  const qMap = new Map<string, string | null>();
  questions.forEach((q) => qMap.set(q.questionId, q.answer));

  const q1 = qMap.get("Q1");
  const q2 = qMap.get("Q2");
  const q3 = qMap.get("Q3");
  const q4 = qMap.get("Q4");
  const q6 = qMap.get("Q6");
  const q7 = qMap.get("Q7");

  if (q1 === "No" || q3 === "No" || q4 === "No" || q2 === "Yes") {
    return {
      recommendation: "Service Contract",
      recommendationNarrative:
        "The agreement is classified as a Service Contract. One or more mandatory criteria for lease identification under Ind AS 116 are not met: either there is no identified asset, the supplier holds substantive substitution rights, or the customer does not have control over directing the use or obtaining economic benefits.",
    };
  }

  if (q6 === "Yes") {
    return {
      recommendation: "Exempt Lease",
      recommendationNarrative:
        "The agreement contains a lease, but it qualifies for the Low-Value Exemption under Ind AS 116 (underlying value < ₹3,00,000). The entity can opt out of capitalization.",
    };
  }

  if (q7 === "Yes") {
    return {
      recommendation: "Exempt Lease",
      recommendationNarrative:
        "The agreement contains a lease, but it qualifies for the Short-Term Exemption under Ind AS 116 (lease term of 12 months or less). The entity can opt out of capitalization.",
    };
  }

  if (q1 === "Yes" && q2 === "No" && q3 === "Yes" && q4 === "Yes") {
    return {
      recommendation: "Lease",
      recommendationNarrative:
        "The agreement satisfies all lease identification criteria under Ind AS 116: there is an identified asset, no substantive substitution rights, and the customer obtains substantially all economic benefits and directs the asset's use. Fixed or in-substance fixed lease payments are present.",
    };
  }

  return {
    recommendation: "Service Contract",
    recommendationNarrative:
      "Based on current answers, the agreement does not satisfy all criteria required for capitalization. Recommended classification is Service Contract.",
  };
}

// AI-driven recommendation and narrative computation using RAG guidelines
export async function reevaluateRecommendationWithAI(
  questions: ILeaseAssessmentQuestion[],
  geminiApiKey: string,
  geminiModel: string
): Promise<{
  recommendation: "Lease" | "Service Contract" | "Exempt Lease";
  recommendationNarrative: string;
}> {
  try {
    const categories = ["LEASE_IDENTIFICATION", "LEASE_TERM", "VALIDATION"];
    const requiredFiles = getRequiredFilesForIntents(categories);
    const scoredChunks = await retrieveScoredChunks(
      "Evaluate qualitative criteria to categorize as Lease or Service Contract under Ind AS 116",
      categories,
      requiredFiles,
      geminiApiKey
    );
    const { selected: rerankedChunks } = rerankCandidates(scoredChunks, requiredFiles);
    const ragContext = assembleContext(rerankedChunks, []);

    const prompt = `
      You are an expert lease accounting auditor under Ind AS 116.
      Based on the following answers to the 9 qualitative lease criteria questions, determine the overall recommendation and write a narrative explanation under Ind AS 116 rules.

      CRITICAL COMPLIANCE RULES (RAG Context):
      ${ragContext}

      CRITICAL ACCOUNTING INTERPRETATION GUIDELINES FOR Q2 (SUBSTITUTION RIGHTS):
      - A supplier relocation right (e.g., Clause 5 allowing the lessor to relocate the lessee/tenant to another retail space or office suite in a shopping centre/building) is NOT a substantive substitution right (meaning Q2 should be "No") if:
        1. The lessor/supplier bears all relocation costs.
        2. The substitute space must be substantially similar.
        3. It is not likely that a major new tenant or higher-rate opportunity will arise at contract inception to make relocation economically beneficial for the supplier.
        Protective or strategic optimization relocation rights are NOT substantive. You must classify such rights as Q2 = "No", which means an identified asset (Q1 = "Yes") exists.

      Current Questions and Answers:
      ${JSON.stringify(
        questions.map((q) => ({
          questionId: q.questionId,
          title: q.title,
          answer: q.answer,
          explanation: q.explanation,
        })),
        null,
        2
      )}

      Identify:
      1. recommended classification: must be exactly "Lease", "Service Contract", or "Exempt Lease".
         - "Lease": If identified asset exists, no substantive substitution rights, customer directs use, and gets economic benefits.
         - "Exempt Lease": If lease criteria are met, but Low Value or Short Term exemption applies under company policies.
         - "Service Contract": If any core lease identification criteria (asset, control, benefits) fails.
      2. narrative explanation of why this classification was recommended, citing any rules from the context.

      Return your response strictly as a JSON object matching this schema, without any markdown formatting or extra text:
      {
        "recommendation": "Lease" | "Service Contract" | "Exempt Lease",
        "recommendationNarrative": "A brief explanation of why this recommendation was reached based on the answers..."
      }
    `;

    const { text } = await callGemini(geminiApiKey, geminiModel, prompt, true);
    const result = JSON.parse(cleanJsonResponse(text));
    return {
      recommendation: result.recommendation || "Service Contract",
      recommendationNarrative: result.recommendationNarrative || "Re-evaluated recommendation narrative.",
    };
  } catch (err) {
    console.warn("[Assessment Engine] AI re-evaluation failed, falling back to rule engine:", err);
    return computeRecommendation(questions);
  }
}

// 1. Core function to start/evaluate assessment on text
export async function startLeaseAssessment(
  fileName: string,
  rawText: string,
  geminiApiKey: string,
  geminiModel: string
) {
  // A. RAG guideline retrieval for lease identification & term
  const categories = ["LEASE_IDENTIFICATION", "LEASE_TERM", "VALIDATION"];
  const requiredFiles = getRequiredFilesForIntents(categories);
  const scoredChunks = await retrieveScoredChunks(
    "Check if agreement is a lease under Ind AS 116, identified asset, term and short term rules",
    categories,
    requiredFiles,
    geminiApiKey
  );
  const { selected: rerankedChunks } = rerankCandidates(scoredChunks, requiredFiles);
  const ragContext = assembleContext(rerankedChunks, []);

  // B. Call Gemini with RAG guidelines & Raw text
  const assessmentPrompt = `
    You are an expert lease accounting auditor under Ind AS 116.
    Analyze the provided agreement text against the 9 standard criteria for lease assessment under Ind AS 116.
    
    CRITICAL COMPLIANCE RULES (RAG):
    ${ragContext}

    Evaluate each of the following 9 questions Q1 to Q9:
    Q1 (Identified Asset): Is there an explicitly or implicitly specified asset?
    Q2 (Substitution Rights): Does the supplier have a substantive right to substitute the asset? (Yes means supplier can substitute at will, which negates a lease).
    Q3 (Economic Benefits): Does the customer have the right to obtain substantially all economic benefits from use?
    Q4 (Right to Direct Use): Does the customer have the right to direct how and for what purpose the asset is used?
    Q5 (Separate Components): Does the contract contain multiple lease or non-lease components?
    Q6 (Low Value Exemption): Is the asset value below the low-value threshold (under company rules: < ₹3,00,000 or $5,000)?
    Q7 (Short-Term Exemption): Is the lease term 12 months or less?
    Q8 (Lease Term): What is the calculated lease term duration?
    Q9 (Lease Payments): Are there fixed, in-substance fixed, or variable payments?

    CRITICAL ACCOUNTING INTERPRETATION GUIDELINES FOR Q2 (SUBSTITUTION RIGHTS):
    - A supplier relocation right (e.g., Clause 5 allowing the lessor to relocate the lessee/tenant to another retail space or office suite in a shopping centre/building) is NOT a substantive substitution right (meaning Q2 should be "No") if:
      1. The lessor/supplier bears all relocation costs.
      2. The substitute space must be substantially similar.
      3. It is not likely that a major new tenant or higher-rate opportunity will arise at contract inception to make relocation economically beneficial for the supplier.
      Protective or strategic optimization relocation rights are NOT substantive. You must classify such rights as Q2 = "No", which means an identified asset (Q1 = "Yes") exists.

    For each question Q1 to Q9:
    1. Determine if the criterion is met. Use Yes, No, or a short string answer (e.g. for Q8 '24 Months', for Q9 'Fixed Payments').
    2. Provide a clear, brief explanation (one sentence max) of your decision based on the text.
    3. Calculate a strict numeric confidence score as a float between 0.0 and 1.0 (do NOT output string percentages like "90%"):
       - If the indicator is explicitly stated or clearly inferable with high certainty, set confidence high (e.g. 0.90 to 1.00).
       - If the text is completely silent, or highly ambiguous, set confidence low (0.0 to 0.69).
    4. Formulate a brief, clear Yes/No prompt text for management confirmation only if your confidence score is low (< 0.70).

    LEASE DOCUMENT TEXT TO ANALYZE:
    ${rawText}

    Return your response strictly as a JSON object matching this schema, without any markdown fences, comments, or extra text:
    {
      "questions": [
        {
          "questionId": "Q1",
          "title": "Identified Asset",
          "answer": "Yes" | "No" | "24 Months" | "Fixed Payments" | null,
          "confidence": 0.95,
          "explanation": "Dedicated Solar Power Station specified in Section 1.2.",
          "promptText": "Does the agreement specify an identified asset?",
          "options": ["Yes", "No"]
        }
      ],
      "recommendation": "Lease" | "Service Contract" | "Exempt Lease",
      "recommendationNarrative": "A brief overall explanation of why this classification was recommended based on Ind AS 116 rules."
    }
  `;

  console.log(`[Assessment Engine] Running assessment for ${fileName}...`);
  const { text: rawResponse } = await callGemini(geminiApiKey, geminiModel, assessmentPrompt, true);
  console.log("DEBUG: Raw assessment response from Gemini:", rawResponse);
  const parsedResponse = JSON.parse(cleanJsonResponse(rawResponse));

  const questions: ILeaseAssessmentQuestion[] = parsedResponse.questions.map((q: any) => {
    const isLowConfidence = q.confidence < 0.70;
    return {
      questionId: q.questionId,
      title: q.title,
      status: isLowConfidence ? "pending" : "automated",
      answer: isLowConfidence ? null : q.answer,
      confidence: q.confidence,
      explanation: q.explanation || "",
      promptText: q.promptText || `Please confirm the parameter for ${q.title}.`,
      options: q.options || ["Yes", "No"],
    } as ILeaseAssessmentQuestion;
  });

  // Log detailed assessment statistics to the server console
  const automated = questions.filter((q) => q.status === "automated");
  const pending = questions.filter((q) => q.status === "pending");

  console.log(`[Assessment Engine] Qualitative Ind AS 116 Evaluation Complete:`);
  console.log(`  - Total Indicators: ${questions.length}`);
  console.log(`  - Resolved Automatically (${automated.length}):`);
  automated.forEach((q) => {
    console.log(`    * [${q.questionId}] ${q.title} -> Answer: ${q.answer} (Confidence: ${Math.round(q.confidence * 100)}%)`);
  });
  console.log(`  - Pending Confirmation (${pending.length}):`);
  pending.forEach((q) => {
    console.log(`    * [${q.questionId}] ${q.title} -> Prompt: "${q.promptText}" (Confidence: ${Math.round(q.confidence * 100)}%)`);
  });

  const agreementId = "AGR-" + Date.now();
  const recommendation = parsedResponse.recommendation || "Service Contract";
  const recommendationNarrative =
    parsedResponse.recommendationNarrative ||
    "AI assessment recommended classification.";

  // C. Save the LeaseAssessment session
  const assessmentSession = new LeaseAssessment({
    agreementId,
    fileName,
    rawText,
    questions,
    recommendation,
    overallConfidence: parsedResponse.overallConfidence || 0.9,
    recommendationNarrative,
    status: "in_progress",
    financialDataExtracted: false,
  });

  await assessmentSession.save();
  console.log(`[Assessment Engine] Saved assessment session for ${agreementId}`);

  return assessmentSession;
}

// 2. Controller for POST /api/v1/agreement-intelligence/assess
export const assessController = async (req: Request, res: Response) => {
  try {
    const { agreementId, rawText, fileName } = req.body;
    if (!agreementId || !rawText) {
      return res.status(400).json({ error: "agreementId and rawText are required" });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    let assessment = await LeaseAssessment.findOne({ agreementId });
    if (!assessment) {
      // Create new
      assessment = await startLeaseAssessment(fileName || "Agreement", rawText, geminiApiKey, geminiModel);
    }

    return res.status(200).json(assessment);
  } catch (error: any) {
    console.error("Error in assessController:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
};

// 3. Controller for POST /api/v1/agreement-intelligence/confirm
export const confirmController = async (req: Request, res: Response) => {
  try {
    const { agreementId, questionId, value } = req.body;
    if (!agreementId || !questionId || value === undefined) {
      return res.status(400).json({ error: "agreementId, questionId, and value are required" });
    }

    const assessment = await LeaseAssessment.findOne({ agreementId });
    if (!assessment) {
      return res.status(404).json({ error: "Lease assessment session not found" });
    }

    // Update the question
    const qIndex = assessment.questions.findIndex((q) => q.questionId === questionId);
    if (qIndex === -1) {
      return res.status(400).json({ error: `Question ${questionId} not found in assessment` });
    }

    assessment.questions[qIndex].answer = value;
    assessment.questions[qIndex].status = "confirmed";
    assessment.questions[qIndex].confidence = 1.0;

    const geminiApiKey = process.env.GEMINI_API_KEY as string;
    const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    // Dynamic AI re-evaluation based on confirmed answer and context
    const { recommendation, recommendationNarrative } = await reevaluateRecommendationWithAI(
      assessment.questions,
      geminiApiKey,
      geminiModel
    );

    assessment.recommendation = recommendation;
    assessment.recommendationNarrative = recommendationNarrative;

    await assessment.save();
    console.log(`[Assessment Engine] Updated question ${questionId} dynamically for ${agreementId}`);

    return res.status(200).json(assessment);
  } catch (error: any) {
    console.error("Error in confirmController:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
};

// 4. Controller for POST /api/v1/agreement-intelligence/approve
export const approveController = async (req: Request, res: Response) => {
  try {
    const { agreementId, status, overrideReason } = req.body;
    if (!agreementId || !status) {
      return res.status(400).json({ error: "agreementId and status are required" });
    }

    if (!["accepted_lease", "accepted_service", "overridden"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const assessment = await LeaseAssessment.findOne({ agreementId });
    if (!assessment) {
      return res.status(404).json({ error: "Lease assessment session not found" });
    }

    assessment.status = status;
    if (status === "overridden") {
      assessment.overrideReason = overrideReason || "User overridden";
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    if (status === "accepted_lease" || status === "overridden") {
      console.log(`[Assessment Engine] Running financial data extraction for ${agreementId}...`);
      const financialData = await performFinancialExtractionDirect(
        assessment.rawText,
        geminiApiKey,
        geminiModel
      );

      assessment.financialDataExtracted = true;
      await assessment.save();

      return res.status(200).json({
        status,
        financialData: {
          ...financialData,
          agreementId,
        },
      });
    } else {
      await assessment.save();
      const report = `
        <h3>Ind AS 116 Lease Assessment Report</h3>
        <p><strong>Agreement Name:</strong> ${assessment.fileName}</p>
        <p><strong>Assessment Session ID:</strong> ${assessment.agreementId}</p>
        <p><strong>Final Decision:</strong> Service Contract (Accepted by User)</p>
        <p><strong>AI Recommendation:</strong> ${assessment.recommendationNarrative}</p>
        <br/>
        <h4>Assessment Criteria Results:</h4>
        <table border="1" cellpadding="6" style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th>Question ID</th>
              <th>Criteria Description</th>
              <th>AI Decision</th>
              <th>Status</th>
              <th>Explanation</th>
            </tr>
          </thead>
          <tbody>
            ${assessment.questions
              .map(
                (q) => `
              <tr>
                <td><strong>${q.questionId}</strong></td>
                <td>${q.title}</td>
                <td>${q.answer}</td>
                <td>${q.status}</td>
                <td>${q.explanation}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `;

      return res.status(200).json({
        status,
        report,
      });
    }
  } catch (error: any) {
    console.error("Error in approveController:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
};
