import { Request, Response } from "express";
import LeaseAssessment, {
  ILeaseAssessmentQuestion,
} from "../../models/leaseAssessment.model";
import { getRequiredFilesForIntents } from "../../services/knowledge/companyRuleEngine";
import { retrieveScoredChunks } from "../../services/knowledge/retrievalEngine";
import { rerankCandidates } from "../../services/knowledge/reranker";
import { assembleContext } from "../../services/knowledge/contextAssembler";
import { callGemini, cleanJsonResponse } from "./geminiService";
import { performFinancialExtractionDirect } from "../lease-controllers/pdfExtractionController";

// Deterministic Backend logical matrix for Ind AS 116 recommendations
export function computeFinalClassification(
  questions: ILeaseAssessmentQuestion[],
): {
  recommendation: "Lease" | "Service Contract" | "Exempt Lease";
  recommendationNarrative: string;
} {
  const getAnswerForPrefix = (prefix: string, defaultVal: string): string => {
    const match = questions.find(
      (q) =>
        q.questionId === prefix ||
        q.questionId.startsWith(prefix + "_") ||
        q.questionId.startsWith(prefix + "-"),
    );
    return match ? (match.answer ?? defaultVal) : defaultVal;
  };

  const q1 = getAnswerForPrefix("Q1", "Yes");
  const q2 = getAnswerForPrefix("Q2", "No");
  const q3 = getAnswerForPrefix("Q3", "Yes");
  const q4 = getAnswerForPrefix("Q4", "Yes");
  const q6 = getAnswerForPrefix("Q6", "No");
  const q7 = getAnswerForPrefix("Q7", "No");
  const q9 = getAnswerForPrefix("Q9", "Yes");

  // 1. Variable-only payment check (Company Policy Override)
  if (
    q9 === "Variable Only" ||
    q9 === "Not Satisfied" ||
    q9 === "No" ||
    q9 === "Variable Payments"
  ) {
    return {
      recommendation: "Service Contract",
      recommendationNarrative: [
        "### Executive Summary",
        "We have conducted an independent qualitative assessment of the contract under Ind AS 116 guidelines to evaluate the accounting treatment. The contract governs usage-based operations where the payments are entirely variable and contingent upon the actual output or utilization, without any guaranteed minimum payments or unavoidable fixed fees. Under Ind AS 116, lease payments must be fixed or in-substance fixed to qualify for capitalization. Because there are no unavoidable payments, a lease liability cannot be mathematically calculated, and consequently, a Right-of-Use (ROU) asset cannot be recognized. This arrangement is classified as a service contract, and all payments should be recognized as operating expenses in the statement of profit and loss as they are incurred. This aligns with standard audit practices for variable-only arrangements, ensuring compliant reporting for the CFO.",
        "",
        "**Conclusion:** The arrangement **does not contain a lease** under Ind AS 116.",
        "",
        "**Reason:** The agreement specifies variable-only payments based on usage or output with no minimum guaranteed or in-substance fixed lease payments.",
        "",
        "**Final Opinion:** Recognition of a Right-of-Use Asset and Lease Liability is **not required**.",
      ].join("\n"),
    };
  }

  // 2. Core Lease Identification Criteria Check
  if (q1 === "No" || q3 === "No" || q4 === "No" || q2 === "Yes") {
    let reason =
      "One or more mandatory qualitative criteria for lease identification under Ind AS 116 are not met.";
    if (q2 === "Yes" || q1 === "No") {
      reason =
        "Although the agreement specifies a particular unit or space, the Lessor retains a substantive right to substitute the asset throughout the contract term. Accordingly, the Lessee does not obtain the right to use an identified asset.";
    } else if (q3 === "No") {
      reason =
        "The Lessee does not obtain substantially all economic benefits from use of the identified asset.";
    } else if (q4 === "No") {
      reason =
        "The Lessee does not hold control over directing the use of the identified asset.";
    }

    return {
      recommendation: "Service Contract",
      recommendationNarrative: [
        "### Executive Summary",
        "We have completed a qualitative audit of the agreement under the Ind AS 116 framework to identify whether it contains a lease. Based on our evaluation, one or more core criteria for lease identification are not satisfied. Specifically, the customer does not have the exclusive right to direct the use of the asset, does not obtain substantially all of the economic benefits, or the lessor retains substantive substitution rights to replace the asset throughout the term. Because these qualitative criteria are mandatory, the arrangement cannot be classified as a lease for accounting purposes. Instead, it must be accounted for as a service contract, meaning no right-of-use asset or lease liability should be recognized on the balance sheet. All contract costs must be recognized as operating expenses when incurred.",
        "",
        "**Conclusion:** The arrangement **does not contain a lease** under Ind AS 116.",
        "",
        "**Reason:** " + reason,
        "",
        "**Final Opinion:** Recognition of a Right-of-Use Asset and Lease Liability is **not required**.",
      ].join("\n"),
    };
  }

  // 3. Low-Value Exemption Check
  if (q6 === "Yes") {
    return {
      recommendation: "Exempt Lease",
      recommendationNarrative: [
        "### Executive Summary",
        "We have evaluated the uploaded contract under the Ind AS 116 lease accounting standard. The contract contains a lease, but it qualifies for the Low-Value Asset exemption because the underlying value of the asset when new is below the established threshold of ₹3,00,000 / $5,000. Under Ind AS 116, lessees can elect not to recognize right-of-use assets and lease liabilities for low-value leases. Choosing this exemption allows the lessee to recognize the lease payments as an expense on a straight-line basis over the lease term, simplifying the accounting process and reducing balance sheet complexity. This is highly recommended for administrative and office equipment assets that meet the threshold, as it avoids unnecessary capitalization and auditing overhead.",
        "",
        "**Conclusion:** The arrangement **contains an exempt lease** under Ind AS 116.",
        "",
        "**Reason:** The lease qualifies for the Low-Value Exemption (underlying value < ₹3,00,000 / $5,000).",
        "",
        "**Final Opinion:** Capitalization of a Right-of-Use Asset and Lease Liability is **optional/not required**.",
      ].join("\n"),
    };
  }

  // 4. Short-Term Exemption Check
  if (q7 === "Yes") {
    return {
      recommendation: "Exempt Lease",
      recommendationNarrative: [
        "### Executive Summary",
        "We have conducted a professional review of the lease agreement under Ind AS 116 criteria. The contract contains a lease, but it qualifies for the Short-Term Lease exemption because the lease term is 12 months or less from the commencement date, and there is no purchase option. Ind AS 116 permits lessees to exempt short-term leases from standard capitalization rules. Consequently, the lessee is not required to recognize a right-of-use asset or a corresponding lease liability on the balance sheet. Instead, the lease payments should be expensed as operating costs on either a systematic basis or straight-line basis, ensuring simplified accounting compliance and streamlined financial reporting.",
        "",
        "**Conclusion:** The arrangement **contains an exempt lease** under Ind AS 116.",
        "",
        "**Reason:** The lease qualifies for the Short-Term Exemption (lease term of 12 months or less).",
        "",
        "**Final Opinion:** Capitalization of a Right-of-Use Asset and Lease Liability is **optional/not required**.",
      ].join("\n"),
    };
  }

  // 5. Standard Lease Conclusion
  return {
    recommendation: "Lease",
    recommendationNarrative: [
      "### Executive Summary",
      "We have conducted a thorough accounting assessment of the contract under the Ind AS 116 standard. The agreement meets all qualitative criteria required to identify a lease: there is an explicitly or implicitly identified physical asset, the supplier has no substantive substitution rights, and the lessee obtains substantially all economic benefits while directing the asset's use throughout the period. Furthermore, the payments contain fixed or in-substance fixed elements, and the lease term exceeds the 12-month short-term exemption threshold. Therefore, standard lease accounting is mandatory. The lessee must capitalize the lease by recognizing a Right-of-Use (ROU) asset and a corresponding lease liability at the commencement date, reflecting the present value of the future lease payments.",
      "",
      "**Conclusion:** The arrangement **contains a lease** under Ind AS 116.",
      "",
      "**Reason:** The agreement satisfies all lease identification criteria: there is an identified asset, no substantive supplier substitution rights, and the customer obtains substantially all economic benefits and directs the asset's use.",
      "",
      "**Final Opinion:** The Lessee **must recognize a Right-of-Use Asset and a Lease Liability** at commencement under Ind AS 116.",
    ].join("\n"),
  };
}

// Transformation Layer: Formats the dynamically generated questions list from Gemini
export function transformToQ1Q9Schema(
  questionsList: any[],
): ILeaseAssessmentQuestion[] {
  return (questionsList || []).map((q) => {
    const isPending = (q.confidence ?? 0) < 1.0;
    return {
      questionId: q.questionId || "Q1",
      title: q.title || "Criteria",
      status: isPending ? "pending" : "automated",
      answer: isPending ? null : q.answer,
      confidence:
        q.confidence !== undefined ? q.confidence : isPending ? 0.5 : 1.0,
      explanation: q.explanation || "",
      promptText: q.promptText || "",
      options: q.options || ["Yes", "No"],
      aiUnderstanding: q.aiUnderstanding || "",
      whyAsked: q.whyAsked || "",
    } as ILeaseAssessmentQuestion;
  });
}

// AI-driven recommendation and narrative computation using RAG guidelines
export async function reevaluateRecommendationWithAI(
  questions: ILeaseAssessmentQuestion[],
  rawText: string,
  geminiApiKey: string,
  geminiModel: string,
): Promise<{
  recommendation: "Lease" | "Service Contract" | "Exempt Lease";
  recommendationNarrative: string;
}> {
  try {
    // Determine the recommendation category and fallback narrative deterministically upfront
    const { recommendation, recommendationNarrative: fallbackNarrative } =
      computeFinalClassification(questions);

    const categories = ["LEASE_IDENTIFICATION", "LEASE_TERM", "VALIDATION"];
    const requiredFiles = getRequiredFilesForIntents(categories);
    const scoredChunks = await retrieveScoredChunks(
      "Evaluate qualitative criteria to categorize as Lease or Service Contract under Ind AS 116",
      categories,
      requiredFiles,
      geminiApiKey,
    );
    const { selected: rerankedChunks } = rerankCandidates(
      scoredChunks,
      requiredFiles,
    );
    const ragContext = assembleContext(rerankedChunks, []);

    const prompt = `
      You are a Chartered Accountant (CA) auditing lease arrangements under Ind AS 116.
      Review the original agreement text, the RAG compliance rules, and the final confirmed/answers to the qualitative criteria.

      CRITICAL COMPLIANCE RULES (RAG Context):
      ${ragContext}

      Original Lease Text:
      ${rawText || "[Original lease text not available]"}

      Current Answers to Qualitative Questions:
      ${JSON.stringify(
        questions.map((q) => ({
          questionId: q.questionId,
          title: q.title,
          answer: q.answer,
          explanation: q.explanation,
        })),
        null,
        2,
      )}

      FINAL DETERMINED CLASSIFICATION: ${recommendation}

      CRITICAL ALIGNMENT INSTRUCTION:
      Your narrative MUST align perfectly with the FINAL DETERMINED CLASSIFICATION (${recommendation}) and the confirmed answers above.
      - If a question's answer is "Yes" (or "Satisfied"), treat that criterion as met.
      - If a question's answer is "No" (or "Not Satisfied"), treat that criterion as NOT met.
      - For example: If Substitution Rights (Q2) has the answer "No" (or "Not Satisfied"), it means there are NO substantive substitution rights. You must NOT say the landlord has relocation rights in the final narrative.
      - Detail exactly why the contract is a ${recommendation} based on the specific criteria that failed or succeeded according to the answers.

      CRITICAL AUDITING & WRITING STYLE INSTRUCTIONS:
      - You must write in the tone and language of an experienced, senior Chartered Accountant (CA) writing a concise audit report for a CFO or corporate finance team.
      - DO NOT use generic AI filler words or transition phrases (e.g., "This indicates...", "Therefore...", "Consequently...", "However...", "Moreover...").
      - DO NOT use textbook definitions of Ind AS 116 criteria (e.g. avoid repeating "substantive substitution rights", "identified asset", "economic benefits" multiple times). State only observations of fact and direct accounting conclusions.
      - Keep the explanation extremely brief, concise, and direct.
      - REFERENCING RULE: Refer to accounting standard ONLY as "Ind AS 116". DO NOT include question numbers (e.g. Q1-Q9, Question 1), paragraph numbers/citations (e.g. Para B14-B19), specific example names/numbers, or internal file locations/logic names.
      - Format "recommendationNarrative" exactly like a CA's Final Assessment in Markdown:
        ### Executive Summary
        [A detailed professional Executive Summary paragraph of 120 to 180 words summarizing the agreement scope, key Ind AS 116 audit considerations, and classification rationale.]

        **Conclusion:** [Conclusion statement under Ind AS 116]
        
        **Reason:** [Core audit reasons referencing ONLY Ind AS 116]
        
        **Final Opinion:** [Actionable accounting recommendation e.g. recognition of ROU Asset and Lease Liability]

      Return your response strictly as a JSON object matching this schema, without any markdown formatting or extra text:
      {
        "recommendationNarrative": "markdown formatted string as instructed above"
      }
    `;

    const { text } = await callGemini(geminiApiKey, geminiModel, prompt, true);
    const result = JSON.parse(cleanJsonResponse(text));

    const q9 = questions.find((q) => q.questionId === "Q9")?.answer;
    const isVariableOnly =
      q9 === "Variable Only" ||
      q9 === "Not Satisfied" ||
      q9 === "No" ||
      q9 === "Variable Payments";

    return {
      recommendation,
      recommendationNarrative: isVariableOnly
        ? fallbackNarrative
        : result.recommendationNarrative || fallbackNarrative,
    };
  } catch (err) {
    console.warn(
      "[Assessment Engine] AI re-evaluation failed, falling back to rule engine:",
      err,
    );
    return computeFinalClassification(questions);
  }
}

// AI-driven regeneration incorporating custom management inputs (comments, notes, assumptions)
export async function regenerateRecommendationWithAIAndInputs(
  questions: ILeaseAssessmentQuestion[],
  rawText: string,
  managementInputs: string[],
  originalRecommendation: string,
  geminiApiKey: string,
  geminiModel: string,
): Promise<string> {
  try {
    const categories = ["LEASE_IDENTIFICATION", "LEASE_TERM", "VALIDATION"];
    const requiredFiles = getRequiredFilesForIntents(categories);
    const scoredChunks = await retrieveScoredChunks(
      "Evaluate qualitative criteria to categorize as Lease or Service Contract under Ind AS 116",
      categories,
      requiredFiles,
      geminiApiKey,
    );
    const { selected: rerankedChunks } = rerankCandidates(
      scoredChunks,
      requiredFiles,
    );
    const ragContext = assembleContext(rerankedChunks, []);

    const prompt = `
      You are a Chartered Accountant (CA) auditing lease arrangements under Ind AS 116.
      You are preparing a REGENERATED lease assessment summary report.
      This report is Version 2, which incorporates additional management inputs (business comments, notes, or assumptions) alongside the original lease text and the confirmed question answers.

      CRITICAL COMPLIANCE RULES (RAG Context):
      ${ragContext}

      Original Lease Text:
      ${rawText || "[Original lease text not available]"}

      Confirmed Answers to Qualitative Questions:
      ${JSON.stringify(
        questions.map((q) => ({
          questionId: q.questionId,
          title: q.title,
          answer: q.answer,
          explanation: q.explanation,
        })),
        null,
        2,
      )}

      Original Determined Classification: ${originalRecommendation}

      ADDITIONAL MANAGEMENT INPUTS / BUSINESS CONTEXT:
      ${managementInputs.map((input, idx) => `${idx + 1}. ${input}`).join("\n")}

      CRITICAL ALIGNMENT INSTRUCTION:
      Your narrative MUST align perfectly with the ORIGINAL DETERMINED CLASSIFICATION (${originalRecommendation}), the confirmed answers, and the new management inputs.
      - Treat the management inputs as valid business assumptions, background context, or explanatory notes provided by the company's management.
      - Integrate these management comments and assumptions seamlessly into your narrative (e.g. in the Executive Summary or in the audit explanation).
      - REFERENCING RULE: Refer to accounting standard ONLY as "Ind AS 116". DO NOT include question numbers (e.g. Q1-Q9, Question 1), paragraph numbers/citations (e.g. Para B14-B19), specific example names/numbers, or internal file locations/logic names.
      - Keep the explanation extremely brief, concise, and direct.

      CRITICAL AUDITING & WRITING STYLE INSTRUCTIONS:
      - You must write in the tone and language of an experienced, senior Chartered Accountant (CA) writing a concise audit report for a CFO or corporate finance team.
      - DO NOT use generic AI filler words or transition phrases.
      - DO NOT use textbook definitions of Ind AS 116 criteria. State only observations of fact, management inputs, and direct accounting conclusions.
      - Format "recommendationNarrative" exactly like a CA's Final Assessment in Markdown:
        ### Executive Summary
        [A detailed professional Executive Summary paragraph of 120 to 180 words summarizing the agreement scope, key Ind AS 116 audit considerations, how management's comments/inputs affect or clarify the business context, and classification rationale.]

        **Conclusion:** [Conclusion statement under Ind AS 116]
        
        **Reason:** [Core audit reasons referencing ONLY Ind AS 116]
        
        **Final Opinion:** [Actionable accounting recommendation e.g. recognition of ROU Asset and Lease Liability]

      Return your response strictly as a JSON object matching this schema, without any markdown formatting or extra text:
      {
        "recommendationNarrative": "markdown formatted string as instructed above"
      }
    `;

    const { text } = await callGemini(geminiApiKey, geminiModel, prompt, true);
    const result = JSON.parse(cleanJsonResponse(text));
    return result.recommendationNarrative;
  } catch (err) {
    console.warn("[Assessment Engine] AI regeneration failed:", err);
    throw err;
  }
}

// 1. Core function to start/evaluate assessment on text (v4 Evidence-Based Engine)
export async function startLeaseAssessment(
  fileName: string,
  rawText: string,
  geminiApiKey: string,
  geminiModel: string,
) {
  // A. RAG guideline retrieval for lease identification & term
  const categories = ["LEASE_IDENTIFICATION", "LEASE_TERM", "VALIDATION"];
  const requiredFiles = getRequiredFilesForIntents(categories);
  const scoredChunks = await retrieveScoredChunks(
    "Check if agreement is a lease under Ind AS 116, identified asset, term and short term rules",
    categories,
    requiredFiles,
    geminiApiKey,
  );
  const { selected: rerankedChunks } = rerankCandidates(
    scoredChunks,
    requiredFiles,
  );
  const ragContext = assembleContext(rerankedChunks, []);

  // B. Call Gemini with RAG guidelines & Raw text using the v4 prompt
  const assessmentPrompt = `
    You are a Chartered Accountant (CA) auditing lease arrangements under Ind AS 116. Your primary objective is to classify the agreement correctly. You are performing a professional accounting assessment using evidence-based reasoning over the agreement text, retrieved Knowledge Base rules, and company policies.

    CRITICAL COMPLIANCE RULES (RAG):
    ${ragContext}

    CRITICAL AUDITING & WRITING STYLE INSTRUCTIONS:
    - Tone: Write in the language of an experienced, senior Chartered Accountant (CA) writing a concise audit report for a CFO.
    - Style: Be extremely brief, concise, and direct. Refer to accounting standard ONLY as "Ind AS 116". DO NOT include question numbers (e.g. Q1-Q9, Question 1), paragraph numbers/citations (e.g. Para B14-B19), specific example names/numbers, or internal file locations.
    - Jargon: DO NOT use generic AI transition phrases (e.g. "This indicates...", "Therefore...", "Consequently...", "However...", "Moreover..."). State only direct contractual observations.

    Your execution steps:
    1. PHASE 1 (AGREEMENT MODEL): Read the agreement and extract raw document facts (agreementType, lessorName, lesseeName, assetDescription, paymentClause, paymentType, leaseTerm, commencementDate, expiryDate, lockInPeriod, noticePeriod, supplierRelocationClause). Do not perform any accounting classification.
    2. PHASE 2 (DYNAMIC QUESTIONS GENERATION):
       Analyze the contract and decide which lease assessment criteria/questions are relevant under Ind AS 116.
       - A question is RELEVANT if it helps classify the contract as a lease (under Ind AS 116), determine the lease term, or identify the lease payments.
       - Do NOT generate questions that are completely irrelevant to the agreement's context. For example, if the leased asset is clearly a building, office, power plant, or large/expensive asset, the "Low Value Exemption" is completely irrelevant, so do NOT generate any question for it.
       - For each relevant question, assign a questionId starting with one of these prefixes (corresponding to the standard Ind AS 116 checkpoints):
         - "Q1" for Identified Asset (e.g. Q1_asset)
         - "Q2" for Substitution Rights (e.g. Q2_substitution)
         - "Q3" for Economic Benefits (e.g. Q3_benefits)
         - "Q4" for Right to Direct Use (e.g. Q4_control)
         - "Q5" for Separate Components (e.g. Q5_components)
         - "Q6" for Low Value Exemption (e.g. Q6_lowvalue)
         - "Q7" for Short-Term Exemption (e.g. Q7_shortterm)
         - "Q8" for Lease Term (e.g. Q8_term, Q8_renewal, Q8_purchase)
         - "Q9" for Lease Payments (e.g. Q9_payments, Q9_extra)
       - Auto-answering logic:
         - First, attempt to answer the question automatically using the agreement content and the RAG knowledge base.
         - If the agreement provides clear, explicit, and sufficient evidence to answer the question, set \`confidence\` to exactly \`1.00\` (100% confidence) and provide the \`answer\` (e.g., "Yes", "No", or specific facts). Such questions will be automatically confirmed without management intervention.
         - If the question cannot be answered from the contract alone (e.g., it depends on management's intent, future choices, facts outside the contract, or if the contract is silent on relocation/substitution ability), set \`confidence\` to less than \`1.00\` (e.g., \`0.80\` to \`0.95\`). In this case, set \`answer\` to \`null\` (since it requires management input), and specify \`promptText\` as a clear, natural language question tailored to this agreement, along with \`aiUnderstanding\` and \`whyAsked\`.
         - Avoid generating generic questions. Tailor the \`promptText\`, \`aiUnderstanding\`, and \`whyAsked\` to the specific facts, names, and assets mentioned in the agreement.
       - Dynamic options logic:
         - You must dynamically generate the response choices (\`options\`) to perfectly match the context, range, or nature of the question instead of defaulting only to "Yes" and "No". For example:
           * If asking about low-value thresholds: \`["Less than INR 3,00,000", "More than INR 3,00,000"]\` or specific relevant ranges.
           * If asking about lease duration: \`["12 months or less", "More than 12 months"]\`
           * If asking about payments: \`["Fixed Payments", "Variable Payments", "Both"]\`
           * If asking standard confirmation: \`["Yes", "No"]\`
         - CRITICAL: Management must never be presented with uncertainty. Do NOT include any options like "Unsure", "Unknown", "Insufficient Evidence", "N/A", "Maybe", or "Pending" in the \`options\` list. Management is expected to make a definitive business decision.

    Return your response strictly as a JSON object matching this schema, without markdown backticks:
    {
      "understanding": {
        "documentFacts": {
          "agreementType": "string",
          "lessorName": "string",
          "lesseeName": "string",
          "assetDescription": "string",
          "paymentClause": "string",
          "paymentType": "string",
          "leaseTerm": "string",
          "commencementDate": "string",
          "expiryDate": "string",
          "lockInPeriod": "string",
          "noticePeriod": "string",
          "supplierRelocationClause": "string"
        }
      },
      "questions": [
        {
          "questionId": "string (prefix matching Q1-Q9 e.g. Q1_asset, Q8_renewal)",
          "title": "string (short description e.g. Identified Asset, Renewal Option)",
          "confidence": number,
          "answer": "string | null",
          "explanation": "string (concise CA-grade observation of fact referencing Ind AS 116 only. Do NOT include question numbers, paragraph numbers, or example names)",
          "promptText": "string (clear, natural language question asked to management, e.g. 'Is the lessee reasonably certain to exercise the renewal option?')",
          "options": ["string"],
          "aiUnderstanding": "string (what the AI identified in the contract)",
          "whyAsked": "string (why management confirmation is required)"
        }
      ],
      "recommendationNarrative": "A professional, Chartered Accountant (CA) grade audit summary formatted in Markdown. Structure it exactly as:\\n\\n### Executive Summary\\n[A detailed professional Executive Summary paragraph of 120 to 180 words summarizing the agreement scope, key Ind AS 116 audit considerations, and classification rationale.]\\n\\n**Conclusion:** [Conclusion statement under Ind AS 116]\\n\\n**Reason:** [Core audit reasons referencing ONLY Ind AS 116]\\n\\n**Final Opinion:** [Actionable accounting recommendation e.g. recognition of ROU Asset and Lease Liability]"
    }

    Original Lease Document Text:
    ${rawText}
  `;

  console.log(
    `[Assessment Engine] Running v4 Evidence-Based assessment for ${fileName}...`,
  );
  const { text: rawResponse } = await callGemini(
    geminiApiKey,
    geminiModel,
    assessmentPrompt,
    true,
  );
  console.log("DEBUG: Raw assessment response from Gemini:", rawResponse);
  const parsedResponse = JSON.parse(cleanJsonResponse(rawResponse));

  // C. Map the dynamically generated questions into the expected UI/DB Schema
  const questions = transformToQ1Q9Schema(parsedResponse.questions || []);

  // D. Deterministic Backend matrix recommendation classification calculation
  const { recommendation, recommendationNarrative: fallbackNarrative } =
    computeFinalClassification(questions);

  const q9 = questions.find((q) => q.questionId.startsWith("Q9"))?.answer;
  const isVariableOnly =
    q9 === "Variable Only" ||
    q9 === "Not Satisfied" ||
    q9 === "No" ||
    q9 === "Variable Payments";

  const recommendationNarrative = isVariableOnly
    ? fallbackNarrative
    : parsedResponse.recommendationNarrative || fallbackNarrative;

  const agreementId = "AGR-" + Date.now();

  const remainingPending = questions.filter(
    (q) => q.status === "pending",
  ).length;

  // E. Save the LeaseAssessment session
  const assessmentSession = new LeaseAssessment({
    agreementId,
    fileName,
    rawText,
    questions,
    recommendation,
    overallConfidence: parsedResponse.questions
      ? parsedResponse.questions.reduce(
          (acc: number, curr: any) => acc + (curr.confidence || 0),
          0,
        ) / parsedResponse.questions.length
      : 0.9,
    recommendationNarrative,
    recommendationNarrativeVersion1:
      remainingPending === 0 ? recommendationNarrative : "",
    status: "in_progress",
    financialDataExtracted: false,
  });

  await assessmentSession.save();
  console.log(
    `[Assessment Engine] Saved assessment session for ${agreementId}`,
  );

  return assessmentSession;
}

// 2. Controller for POST /api/v1/agreement-intelligence/assess
export const assessController = async (req: Request, res: Response) => {
  try {
    const { agreementId, rawText, fileName } = req.body;
    if (!agreementId || !rawText) {
      return res
        .status(400)
        .json({ error: "agreementId and rawText are required" });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    let assessment = await LeaseAssessment.findOne({ agreementId });
    if (!assessment) {
      // Create new
      assessment = await startLeaseAssessment(
        fileName || "Agreement",
        rawText,
        geminiApiKey,
        geminiModel,
      );
    }

    return res.status(200).json(assessment);
  } catch (error: any) {
    console.error("Error in assessController:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};

// 3. Controller for POST /api/v1/agreement-intelligence/confirm
export const confirmController = async (req: Request, res: Response) => {
  try {
    const { agreementId, questionId, value } = req.body;
    if (!agreementId || !questionId || value === undefined) {
      return res
        .status(400)
        .json({ error: "agreementId, questionId, and value are required" });
    }

    const assessment = await LeaseAssessment.findOne({ agreementId });
    if (!assessment) {
      return res
        .status(404)
        .json({ error: "Lease assessment session not found" });
    }

    // Update the question
    const qIndex = assessment.questions.findIndex(
      (q) => q.questionId === questionId,
    );
    if (qIndex === -1) {
      return res
        .status(400)
        .json({ error: `Question ${questionId} not found in assessment` });
    }

    assessment.questions[qIndex].answer = value;
    assessment.questions[qIndex].status = "confirmed";
    assessment.questions[qIndex].confidence = 1.0;

    const remainingPending = assessment.questions.filter(
      (q) => q.status === "pending",
    ).length;

    if (remainingPending === 0) {
      console.log(
        `[Assessment Engine] All questions confirmed. Running final Gemini re-evaluation for ${agreementId}...`,
      );
      const geminiApiKey = process.env.GEMINI_API_KEY as string;
      const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

      // Dynamic AI re-evaluation based on confirmed answer and context
      const { recommendation, recommendationNarrative } =
        await reevaluateRecommendationWithAI(
          assessment.questions,
          assessment.rawText,
          geminiApiKey,
          geminiModel,
        );

      assessment.recommendation = recommendation;
      assessment.recommendationNarrative = recommendationNarrative;
      assessment.recommendationNarrativeVersion1 = recommendationNarrative;
    } else {
      console.log(
        `[Assessment Engine] Updated question ${questionId}. ${remainingPending} questions pending. Running local classification.`,
      );
      // Fast path: run deterministic local evaluation
      const { recommendation, recommendationNarrative } =
        computeFinalClassification(assessment.questions);
      assessment.recommendation = recommendation;
      assessment.recommendationNarrative = recommendationNarrative;
    }

    await assessment.save();
    console.log(
      `[Assessment Engine] Updated question ${questionId} dynamically for ${agreementId}`,
    );

    return res.status(200).json(assessment);
  } catch (error: any) {
    console.error("Error in confirmController:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};

// 4. Controller for POST /api/v1/agreement-intelligence/approve
export const approveController = async (req: Request, res: Response) => {
  try {
    const { agreementId, status, overrideReason } = req.body;
    if (!agreementId || !status) {
      return res
        .status(400)
        .json({ error: "agreementId and status are required" });
    }

    if (
      !["accepted_lease", "accepted_service", "overridden"].includes(status)
    ) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const assessment = await LeaseAssessment.findOne({ agreementId });
    if (!assessment) {
      return res
        .status(404)
        .json({ error: "Lease assessment session not found" });
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

    console.log(
      `[Assessment Engine] Running financial data extraction for ${agreementId}...`,
    );
    const financialData = await performFinancialExtractionDirect(
      assessment.rawText,
      geminiApiKey,
      geminiModel,
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
  } catch (error: any) {
    console.error("Error in approveController:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};

// 5. Controller for POST /api/v1/agreement-intelligence/regenerate
export const regenerateController = async (req: Request, res: Response) => {
  try {
    const { agreementId, managementInputs } = req.body;
    if (!agreementId || !Array.isArray(managementInputs)) {
      return res.status(400).json({
        error: "agreementId and managementInputs (array) are required",
      });
    }

    const assessment = await LeaseAssessment.findOne({ agreementId });
    if (!assessment) {
      return res
        .status(404)
        .json({ error: "Lease assessment session not found" });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    // Save inputs
    assessment.managementInputs = managementInputs;

    // Ensure Version 1 is preserved
    if (!assessment.recommendationNarrativeVersion1) {
      assessment.recommendationNarrativeVersion1 =
        assessment.recommendationNarrative || "";
    }

    console.log(
      `[Assessment Engine] Regenerating summary with management inputs for ${agreementId}...`,
    );

    // Regenerate with management inputs
    const regeneratedNarrative = await regenerateRecommendationWithAIAndInputs(
      assessment.questions,
      assessment.rawText,
      managementInputs,
      assessment.recommendation || "Lease",
      geminiApiKey,
      geminiModel,
    );

    assessment.recommendationNarrativeVersion2 = regeneratedNarrative;
    assessment.recommendationNarrative = regeneratedNarrative;

    await assessment.save();

    console.log(
      `[Assessment Engine] Regenerated summary for ${agreementId} as Version 2`,
    );

    return res.status(200).json(assessment);
  } catch (error: any) {
    console.error("Error in regenerateController:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};
