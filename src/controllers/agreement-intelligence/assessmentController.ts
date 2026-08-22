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
        "We have conducted an independent qualitative assessment of the contract under Ind AS 116 guidelines to evaluate the accounting treatment. The contract governs usage-based operations where the payments are entirely variable and contingent upon the actual output or utilization, without any guaranteed minimum payments or unavoidable fixed fees. In accordance with company audit guidelines, in case variable lease payments are mentioned in the agreement, AI must assess whether there is any in-substance fixed lease rent mentioned in the agreement. Under Ind AS 116, lease payments must be fixed or in-substance fixed to qualify for capitalization. Because there are no unavoidable in-substance fixed payments or minimum guaranteed lease amounts, a lease liability cannot be mathematically calculated, and consequently, a Right-of-Use (ROU) asset cannot be recognized. This arrangement is classified as a service contract, and all payments should be recognized as operating expenses in the statement of profit and loss as they are incurred. This aligns with standard audit practices for variable-only arrangements, ensuring compliant reporting for the CFO.",
        "",
        "**Conclusion:** The arrangement **does not contain a lease** under Ind AS 116.",
        "",
        "**Reason:** The agreement specifies variable lease payments, and an assessment confirms there are no in-substance fixed lease payments or minimum guaranteed amounts.",
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
        "We have evaluated the uploaded contract under the Ind AS 116 lease accounting standard. The contract contains a lease, but it qualifies for the Low-Value Asset exemption based on management confirmation that the underlying asset is of low value. Under Ind AS 116, lessees can elect not to recognize right-of-use assets and lease liabilities for low-value leases. Choosing this exemption allows the lessee to recognize the lease payments as an expense on a straight-line basis over the lease term, simplifying the accounting process and reducing balance sheet complexity. This is recommended for qualifying low-value assets to avoid unnecessary capitalization and auditing overhead.",
        "",
        "**Conclusion:** The arrangement **contains an exempt lease** under Ind AS 116.",
        "",
        "**Reason:** The lease qualifies for the Low-Value Exemption based on management confirmation.",
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

// Dynamic Input Type determination helper for management questions
export function determineInputType(
  q: any,
): "date" | "number" | "boolean" | "select" | "text" {
  const questionId = (q.questionId || "").toLowerCase();
  const promptText = (q.promptText || "").toLowerCase();
  const title = (q.title || "").toLowerCase();
  const options = Array.isArray(q.options) ? q.options : [];

  // Standard qualitative checkpoint questions (Q1 to Q7, Q8_renewal, Q8_purchase) are boolean unless multi-choice options exist
  if (
    questionId.startsWith("q1") ||
    questionId.startsWith("q2") ||
    questionId.startsWith("q3") ||
    questionId.startsWith("q4") ||
    questionId.startsWith("q5") ||
    questionId.startsWith("q6") ||
    questionId.startsWith("q7") ||
    questionId.startsWith("q8_renewal") ||
    questionId.startsWith("q8_purchase")
  ) {
    if (
      options.length > 0 &&
      !options.every(
        (o: string) => o.toLowerCase() === "yes" || o.toLowerCase() === "no",
      )
    ) {
      return "select";
    }
    return "boolean";
  }

  if (
    q &&
    (q.inputType === "date" ||
      q.inputType === "number" ||
      q.inputType === "boolean" ||
      q.inputType === "select" ||
      q.inputType === "text")
  ) {
    return q.inputType;
  }

  // 1. Date check
  if (
    promptText.includes("start date") ||
    promptText.includes("end date") ||
    promptText.includes("commencement date") ||
    promptText.includes("initiation date") ||
    promptText.includes("when does") ||
    (promptText.includes("date") && !promptText.includes("update") && !promptText.includes("candidate")) ||
    title.includes("date") ||
    questionId.includes("date")
  ) {
    if (
      options.length > 0 &&
      !options.every(
        (o: string) => o.toLowerCase() === "yes" || o.toLowerCase() === "no",
      )
    ) {
      return "select";
    }
    return "date";
  }

  // 2. Number check (avoid matching 'low value' or 'separate components')
  if (
    promptText.includes("gst rate") ||
    promptText.includes("percentage") ||
    promptText.includes("amount") ||
    promptText.includes("price") ||
    promptText.includes("initial direct cost amount") ||
    promptText.includes("security deposit amount") ||
    promptText.includes("discount rate") ||
    promptText.includes("how much") ||
    promptText.includes("day of month") ||
    title.includes("rate") ||
    title.includes("amount") ||
    title.includes("price") ||
    questionId.includes("amount") ||
    questionId.includes("price") ||
    questionId.includes("rate")
  ) {
    if (
      options.length > 0 &&
      !options.every(
        (o: string) => o.toLowerCase() === "yes" || o.toLowerCase() === "no",
      )
    ) {
      return "select";
    }
    return "number";
  }

  // 3. Boolean check
  if (
    (options.length === 2 &&
      ((options[0].toLowerCase() === "yes" && options[1].toLowerCase() === "no") ||
        (options[0].toLowerCase() === "no" && options[1].toLowerCase() === "yes"))) ||
    promptText.includes("whether") ||
    promptText.includes("incurred") ||
    promptText.includes("reasonably certain") ||
    promptText.includes("exemption") ||
    title.includes("exemption") ||
    title.includes("option")
  ) {
    return "boolean";
  }

  // 4. Select check
  if (options.length > 0) {
    return "select";
  }

  // 5. Fallback for text
  return "text";
}

// Transformation Layer: Formats the dynamically generated questions list from Gemini
export function transformToQ1Q9Schema(
  questionsList: any[],
): ILeaseAssessmentQuestion[] {
  return (questionsList || []).map((q) => {
    const isPending = (q.confidence ?? 0) < 1.0;
    const inputType = q.inputType || determineInputType(q);
    return {
      questionId: q.questionId || "Q1",
      title: q.title || "Criteria",
      status: isPending ? "pending" : "automated",
      answer: isPending ? null : q.answer,
      confidence:
        q.confidence !== undefined ? q.confidence : isPending ? 0.5 : 1.0,
      explanation: q.explanation || "",
      promptText: q.promptText || q.title || q.explanation || "Clarification Question",
      inputType,
      options:
        Array.isArray(q.options) && q.options.length > 0
          ? q.options
          : inputType === "boolean"
          ? ["Yes", "No"]
          : undefined,
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
      - VARIABLE LEASE PAYMENTS & IN-SUBSTANCE FIXED RENT MANDATE: In case variable lease payments are mentioned in the agreement, your assessment narrative MUST explicitly state whether there is any in-substance fixed lease rent or minimum guaranteed payment mentioned in the agreement.
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
      - VARIABLE LEASE PAYMENTS & IN-SUBSTANCE FIXED RENT MANDATE: In case variable lease payments are mentioned in the agreement, your assessment narrative MUST explicitly state whether there is any in-substance fixed lease rent or minimum guaranteed payment mentioned in the agreement.
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
    - STRICT LOCK-IN PERIOD RULE: If the agreement specifies an explicit Minimum Lock-in Period / Locking Period (e.g. 3 Years), that lock-in period is legally non-cancellable. The Lease Working Period and Lock-in Period MUST BE AT LEAST the duration of the explicit lock-in period (e.g. 3 Years). Notice period clauses (e.g. 3 months notice) specify notification lead-time, NOT the lease term. AI MUST NOT reduce the Lease Working Period below the explicit contractual lock-in period.
    - VARIABLE LEASE PAYMENTS & IN-SUBSTANCE FIXED RENT MANDATE: In case there are variable lease payments mentioned in the agreement, AI must assess whether there is any in-substance fixed lease rent mentioned in the agreement and explicitly include this evaluation in the qualitative recommendationNarrative and question explanations.
    - LOW-VALUE ASSET MANDATE: In case AI assesses that a leased asset could qualify as a low-value asset, AI must ONLY ask management whether to consider that asset as a low-value asset or not (e.g. options: ["Yes", "No"]). AI MUST NOT mention, specify, or refer to any monetary threshold (such as ₹3,00,000 or $5,000) when identifying, asking about, or describing the low-value asset.

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
         - Dynamic options and inputType logic:
          - You must specify \`inputType\` for each question as one of:
            * "boolean" (for Yes/No choices)
            * "select" (for multi-choice dropdown selection)
            * "date" (if asking for a specific date)
            * "number" (if asking for a numeric quantity, rate, or amount)
            * "text" (if asking for open description or textual response)
          - You must dynamically generate the response choices (\`options\`) to perfectly match the context, range, or nature of the question instead of defaulting only to "Yes" and "No". For example:
            * If asking about low-value asset classification: \`options: ["Yes", "No"]\`, \`inputType: "boolean"\` (CRITICAL: DO NOT specify or mention any monetary threshold, amount, or currency value).
            * If asking about lease duration: \`options: ["12 months or less", "More than 12 months"]\`, \`inputType: "select"\`
            * If asking about payments: \`options: ["Fixed Payments", "Variable Payments", "Both"]\`, \`inputType: "select"\`
            * If asking standard confirmation: \`options: ["Yes", "No"]\`, \`inputType: "boolean"\`
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
          "inputType": "date | number | boolean | select | text",
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
      `[Assessment Engine] Running financial gap analysis for ${agreementId}...`,
    );

    // 1. Retrieve dynamic RAG context
    const categories = ["EXTRACTION_RULES", "COMPANY_RULES", "LEASE_TERM"];
    const requiredFiles = getRequiredFilesForIntents(categories);
    const scoredChunks = await retrieveScoredChunks(
      "Identify lease financial parameters, rent, payments, lock-in, GST, ROU adjustments, initial direct costs, incentives",
      categories,
      requiredFiles,
      geminiApiKey,
    );
    const { selected: rerankedChunks } = rerankCandidates(
      scoredChunks,
      requiredFiles,
    );
    const ragContext = assembleContext(rerankedChunks, []);

    // 2. Perform Gap Analysis using Gemini
    const gapAnalysisPrompt = `
      You are a senior Chartered Accountant (CA) auditing lease contracts under Ind AS 116.
      You are performing a Financial Gap Analysis to identify if any vital information is missing or needs clarification before executing final financial extraction.

      CRITICAL SYSTEM COMPLIANCE RULES (RAG Context):
      ${ragContext}

      Original Lease Text:
      ${assessment.rawText}

      Qualitative Assessment Context (Stage 1 Output - TREAT THESE AS CONFIRMED FACTS):
      - Recommendation: ${assessment.recommendation}
      - Status: ${status}
      - Confirmed Qualitative Checkpoint Answers:
      ${JSON.stringify(
        assessment.questions.map((q) => ({
          questionId: q.questionId,
          title: q.title,
          answer: q.answer,
          explanation: q.explanation,
        })),
        null,
        2,
      )}

      YOUR INSTRUCTIONS:
      1. Perform a gap analysis of the Lease Agreement under Ind AS 116 based on the provided RAG guidelines and qualitative assessment context.
      2. **Strict Fact Precedence:** Treat all confirmed answers from Stage 1 as established facts. DO NOT ask questions that have already been resolved.
      3. Identify if any additional facts are missing or require clarification from management. Focus strictly on these points:
         - **GST Applicability:** Ask management: "Should GST be included in the rent amount for Ind AS 116 calculation, and if so, what is the applicable GST rate?"
           FOR THE GST QUESTION, STRICTLY PROVIDE OPTIONS: ["Yes, 18%", "No, GST should not be included"], inputType: "select".
         - **Initial Direct Costs:** If not mentioned in the agreement, ask management: "Were there any initial direct costs incurred by the lessee at the initiation of the agreement?"
           OPTIONS: ["Yes, initial direct costs incurred", "No initial direct costs incurred"], inputType: "boolean". If confirmed yes, ask for initial direct cost amount with inputType: "number".
         - **Rent Start Date vs. Agreement Start Date:** If rent start date differs from agreement start date, inform management of this fact and ask: "Rent initiation date differs from agreement start date. Should the lease agreement be initiated from agreement start date or rent start date?"
           OPTIONS: ["Agreement Start Date", "Rent Start Date"], inputType: "select".
         - **Lessee Unilateral Option During Non-Cancellable Period:** If non-cancellable period mentioned and ONLY lessee has option to cancel/terminate during non-cancellable period, ask: "Does management intend to cancel or terminate the lease agreement during the non-cancellable period?"
           OPTIONS: ["No, management will not terminate", "Yes, management will terminate"], inputType: "boolean".
         - **Lessee Unilateral Option Post Non-Cancellable Period:** If post non-cancellable period ONLY lessee has option to terminate remaining period, ask: "Is it management's intention to terminate the lease agreement post non-cancellable period?"
           OPTIONS: ["No, management will continue the lease", "Yes, management will terminate post non-cancellable period"], inputType: "boolean".
         - **Lessee Unilateral Termination Right:** If only the lessee has the right to terminate, ask: "Within what period does the lessee expect to terminate the lease?" inputType: "date" or "text" or "number".
         - **Discount Rate:** If missing, ask for rate with inputType: "number".
         - **Variable Index Rate Value:** If rent depends on index/rate, and commencement value is missing, ask with inputType: "number".
         - **Residual Value Guarantees:** If RVG is mentioned but expected amount is missing, ask with inputType: "number".
         - **Purchase Option Price:** If purchase option is certain but price is missing, ask with inputType: "number".
         - **In-substance Fixed Payments:** If mentioned but the amount is unclear, ask with inputType: "number".
         - **Lease Incentives:** If mentioned but date is missing, ask with inputType: "date". If receipt is unclear, ask with inputType: "boolean".
      4. Generate clarification questions ONLY for facts that are missing or require business decision. If a fact is explicitly mentioned in the text or already resolved, do NOT ask. (Specifically: If security deposit amount or interest terms are explicitly stated in the contract text e.g. Clause 10 specifies Rs 15,00,000 security deposit, DO NOT ask if security deposit exists or should be included).
      5. Input Type logic: For every generated question, assign 'inputType' matching the nature of input: "date" (for dates), "number" (for numeric amounts/rates), "boolean" (for Yes/No choices), "select" (for predefined multi-choice dropdown options), "text" (for text descriptions).
      6. Return a JSON object matching this schema:
      {
        "clarificationRequired": boolean,
        "questions": [
          {
            "questionId": "string (e.g. FQ_gst, FQ_directcost, FQ_rent_start_date, FQ_purchase_price)",
            "title": "string (short title)",
            "confidence": number,
            "answer": "string | null",
            "explanation": "string (concise CA-grade observation of why we are asking)",
            "promptText": "string (clear, natural language question asked to management)",
            "inputType": "date | number | boolean | select | text",
            "options": ["string"],
            "aiUnderstanding": "string (what the AI identified in the contract)",
            "whyAsked": "string (why management confirmation is required)"
          }
        ]
      }
      
      Respond strictly with raw JSON, no markdown formatting or backticks.
    `;

    const { text: gapResponse } = await callGemini(
      geminiApiKey,
      geminiModel,
      gapAnalysisPrompt,
      true,
    );
    const parsedGap = JSON.parse(cleanJsonResponse(gapResponse));

    if (parsedGap.clarificationRequired && parsedGap.questions && parsedGap.questions.length > 0) {
      console.log(`[Assessment Engine] Financial clarifications required for ${agreementId}. Asking ${parsedGap.questions.length} questions.`);
      const questions = (parsedGap.questions || []).map((q: any, idx: number) => {
        let options = (Array.isArray(q.options) && q.options.length > 0) ? q.options : undefined;
        const isGstQuestion =
          (q.questionId || "").toLowerCase().includes("gst") ||
          (q.title || "").toLowerCase().includes("gst") ||
          (q.promptText || "").toLowerCase().includes("gst");
        if (isGstQuestion && (!options || options.length === 0)) {
          options = ["Yes, 18%", "No, GST should not be included"];
        }

        const inputType = q.inputType || determineInputType({ ...q, options });

        return {
          questionId: q.questionId || `FQ_${idx + 1}`,
          title: q.title || "Clarification",
          status: "pending",
          answer: null,
          confidence: q.confidence !== undefined ? q.confidence : 0.5,
          explanation: q.explanation || "",
          promptText: q.promptText || q.title || q.explanation || "Financial Clarification Required",
          inputType,
          options: options || (inputType === "boolean" ? ["Yes", "No"] : undefined),
          aiUnderstanding: q.aiUnderstanding || "",
          whyAsked: q.whyAsked || "",
        };
      });
      
      assessment.financialClarifications = {
        questions,
        status: "pending",
        resolvedFacts: {}
      };
      
      await assessment.save();

      return res.status(200).json({
        status: "pending_financial_clarifications",
        financialClarifications: assessment.financialClarifications,
      });
    } else {
      console.log(`[Assessment Engine] No clarifications required for ${agreementId}. Proceeding directly to final extraction.`);
      assessment.financialClarifications = {
        questions: [],
        status: "completed",
        resolvedFacts: {}
      };

      const financialData = await performFinancialExtractionWithAnswersDirect(
        assessment,
        geminiApiKey,
        geminiModel,
      );

      assessment.financialDataExtracted = true;
      await assessment.save();

      return res.status(200).json({
        status: "complete",
        financialData: {
          ...financialData,
          agreementId,
        },
      });
    }
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

// Helper function to extract financial parameters while enforcing qualitative & clarifications answers
export async function performFinancialExtractionWithAnswersDirect(
  assessment: any,
  geminiApiKey: string,
  geminiModel: string,
): Promise<any> {
  const resolvedFacts = assessment.financialClarifications.resolvedFacts || {};
  let factsText = "";
  if (resolvedFacts instanceof Map) {
    for (const [key, val] of resolvedFacts.entries()) {
      factsText += `- ${key}: ${val}\n`;
    }
  } else {
    for (const key of Object.keys(resolvedFacts)) {
      factsText += `- ${key}: ${resolvedFacts[key]}\n`;
    }
  }

  // Load knowledge base rules (EXTRACTION_RULES, LEASE_TERM, COMPANY_RULES)
  const categories = ["EXTRACTION_RULES", "COMPANY_RULES", "LEASE_TERM"];
  const requiredFiles = getRequiredFilesForIntents(categories);
  const scoredChunks = await retrieveScoredChunks(
    "Extract lease parameters, rent, deposits, lock-in, GST, direct costs, lease term",
    categories,
    requiredFiles,
    geminiApiKey,
  );
  const { selected: rerankedChunks } = rerankCandidates(
    scoredChunks,
    requiredFiles,
  );
  const ragContext = assembleContext(rerankedChunks, []);

  const extractionPrompt = `
    You are an expert lease data normalization engine. You are performing the final financial extraction for a lease agreement.
    You must extract standard lease parameters under Ind AS 116.
    
    CRITICAL SYSTEM COMPLIANCE RULES (RAG Context):
    ${ragContext}

    Original Lease Document Text:
    ${assessment.rawText}

    Qualitative Assessment Context (Stage 1 Output - TREAT AS ESTABLISHED FACTS):
    - Final Recommendation: ${assessment.recommendation}
    - Confirmed Checkpoint Answers:
    ${JSON.stringify(
      assessment.questions.map((q: any) => ({
        questionId: q.questionId,
        title: q.title,
        answer: q.answer,
      })),
      null,
      2,
    )}

    CONFIRMED FINANCIAL CLARIFICATIONS (Stage 2 Output - TREAT AS ESTABLISHED FACTS):
    ${factsText || "[No financial clarifications were required]"}

    CRITICAL EXTRACTION DIRECTIONS:
    1. **Precedence Rule:** Confirmed answers from Stage 1 and Stage 2 always take absolute precedence over values inferred from the text. Never overwrite them.
    2. **GST Applicability:** If GST is confirmed as applicable, compute the total rent amount including GST (e.g. if base rent is 100,000 and GST is 18%, rentAmount must be 118000).
    3. **Initial Direct Costs:** Apply the initial direct costs to ROU adjustments ('rouAdjustments') with a positive balance on the lease working initiation date. If confirmed as none or missing, do not include.
    4. **Rent Initiation Date vs. Agreement Start Date:** If management opted to initiate the agreement from the **Rent Start Date**, set the start date of **Lease Working Period ('leaseWorkingPeriod')** to the rent initiation date and adjust dates accordingly.
    5. **Lease Working Period ('leaseWorkingPeriod'):** Use the lease term, non-cancellable period, lessee/lessor termination intentions, expected termination timeframe, and renewal option facts established in Stage 1 and Stage 2 to compute exact start and end dates.
    6. **Lock-In Period ('lockingPeriod'):** Must ALWAYS be set to the exact same start and end dates as the calculated **Lease Working Period**.
    7. **Frequency of Rent Payment:** If not mentioned, default to "monthly".
    8. **Frequencies:** Rent Payment Frequency default "monthly", Interest Calculation Frequency always "monthly".
    9. **Data Provenance:** For each extracted field, determine the source of the value.
       - The source MUST be one of: "Agreement" (extracted from text), "Management Clarification" (from Stage 1 or Stage 2 confirmations), or "Assessment Reasoning" (computed based on compliance logic).
       - Provide the confidence score (High, Medium, Low) and the source text snippet when from the agreement.
    10. **Adhoc Escalations vs Systematic Escalations (STRICT NON-CONVERSION RULE):** Extract "systematicEscalations" for percentage-based rent increases and "adhocEscalations" for explicit fixed step rent amounts. Both CAN coexist in an agreement if the document explicitly specifies both types. However, you MUST NOT convert a systematic percentage escalation into ad-hoc escalations (do NOT populate "adhocEscalations" with scheduled breakdown amounts calculated from a systematic percentage escalation). The "amount" field in "adhocEscalations" MUST only be used for standalone fixed rental steps specified in the agreement without a percentage rule. Base rent for the initial period (e.g. 375000) is stored in "rentAmount" and should NOT be included in "adhocEscalations".

    Return the output as a valid JSON object matching exactly this schema, without any markdown formatting, backticks, or extra text:
    {
      "lessorName": "string or null",
      "natureOfLease": "Type of lease (One of: 'Leasehold land', 'Building', 'Warehouse', 'Plant and Machinery', 'Vehicle', 'Office Equipments', 'Computer and Peripherals', 'Furniture and fixtures', 'Security Deposit', 'Other' or null)",
      "leasePeriod": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
      "leaseWorkingPeriod": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
      "lockingPeriod": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
      "rentPaymentType": "Either 'Advance Payment' or 'Arrear Payment' or null",
      "rentPaymentFrequency": "One of: 'monthly', 'quarterly', 'semi-annual', 'annual' or null",
      "rentAmount": number,
      "rentPaymentDate": "string or number",
      "securityDeposit": number,
      "discountingRates": [
        { "dateRange": ["YYYY-MM-DD", "YYYY-MM-DD"], "rate": number }
      ],
      "systematicEscalations": [
        { "dateRange": "YYYY-MM-DD", "frequency": "annual", "percentage": number }
      ],
      "adhocEscalations": [
        { "dateRange": ["YYYY-MM-DD", "YYYY-MM-DD"], "frequency": "monthly", "amount": number }
      ],
      "rentFreePeriods": [
        { "dateRange": ["YYYY-MM-DD", "YYYY-MM-DD"], "percentage": number }
      ],
      "confidence": number,
      "provenance": {
        "lessorName": { "source": "Agreement | Management Clarification | Assessment Reasoning", "confidenceScore": "High | Medium | Low", "sourceText": "string" },
        "natureOfLease": { "source": "Agreement | Management Clarification | Assessment Reasoning", "confidenceScore": "High | Medium | Low", "sourceText": "string" },
        "leasePeriod": { "source": "Agreement | Management Clarification | Assessment Reasoning", "confidenceScore": "High | Medium | Low", "sourceText": "string" },
        "leaseWorkingPeriod": { "source": "Agreement | Management Clarification | Assessment Reasoning", "confidenceScore": "High | Medium | Low", "sourceText": "string" },
        "lockingPeriod": { "source": "Agreement | Management Clarification | Assessment Reasoning", "confidenceScore": "High | Medium | Low", "sourceText": "string" },
        "rentPaymentType": { "source": "Agreement | Management Clarification | Assessment Reasoning", "confidenceScore": "High | Medium | Low", "sourceText": "string" },
        "rentPaymentFrequency": { "source": "Agreement | Management Clarification | Assessment Reasoning", "confidenceScore": "High | Medium | Low", "sourceText": "string" },
        "rentAmount": { "source": "Agreement | Management Clarification | Assessment Reasoning", "confidenceScore": "High | Medium | Low", "sourceText": "string" },
        "rentPaymentDate": { "source": "Agreement | Management Clarification | Assessment Reasoning", "confidenceScore": "High | Medium | Low", "sourceText": "string" },
        "securityDeposit": { "source": "Agreement | Management Clarification | Assessment Reasoning", "confidenceScore": "High | Medium | Low", "sourceText": "string" }
      }
    }
  `;

  const { text: responseText } = await callGemini(
    geminiApiKey,
    geminiModel,
    extractionPrompt,
    true,
  );

  const parsedJson = JSON.parse(cleanJsonResponse(responseText));

  // Normalize working period & lock-in
  if (parsedJson.leasePeriod) {
    if (!parsedJson.leaseWorkingPeriod) {
      parsedJson.leaseWorkingPeriod = parsedJson.leasePeriod;
    }
    if (!parsedJson.lockingPeriod) {
      parsedJson.lockingPeriod = parsedJson.leaseWorkingPeriod;
    }
  }

  return parsedJson;
}

// Controller for POST /api/v1/agreement-intelligence/confirm-financial
export const confirmFinancialController = async (req: Request, res: Response) => {
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

    // Update dynamic question
    const qIndex = assessment.financialClarifications.questions.findIndex(
      (q) => q.questionId === questionId,
    );
    if (qIndex === -1) {
      return res
        .status(400)
        .json({ error: `Question ${questionId} not found in clarifications` });
    }

    assessment.financialClarifications.questions[qIndex].answer = value;
    assessment.financialClarifications.questions[qIndex].status = "confirmed";
    assessment.financialClarifications.questions[qIndex].confidence = 1.0;

    const title = assessment.financialClarifications.questions[qIndex].title;
    
    // Store resolved fact
    if (!assessment.financialClarifications.resolvedFacts) {
      assessment.financialClarifications.resolvedFacts = {};
    }
    
    if (assessment.financialClarifications.resolvedFacts instanceof Map) {
      assessment.financialClarifications.resolvedFacts.set(title.replace(/\./g, ''), value);
    } else {
      assessment.financialClarifications.resolvedFacts[title.replace(/\./g, '')] = value;
    }

    // Mark modifications so Mongoose knows resolvedFacts Map/Object changed
    assessment.markModified('financialClarifications.resolvedFacts');

    const remainingPending = assessment.financialClarifications.questions.filter(
      (q) => q.status === "pending",
    ).length;

    const geminiApiKey = process.env.GEMINI_API_KEY as string;
    const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    if (remainingPending === 0) {
      console.log(
        `[Assessment Engine] All financial clarifications confirmed for ${agreementId}. Triggering final extraction...`,
      );
      assessment.financialClarifications.status = "completed";

      const financialData = await performFinancialExtractionWithAnswersDirect(
        assessment,
        geminiApiKey,
        geminiModel,
      );

      assessment.financialDataExtracted = true;
      await assessment.save();

      return res.status(200).json({
        status: "complete",
        financialData: {
          ...financialData,
          agreementId,
        },
      });
    } else {
      await assessment.save();
      return res.status(200).json({
        status: "pending_financial_clarifications",
        financialClarifications: assessment.financialClarifications,
      });
    }
  } catch (error: any) {
    console.error("Error in confirmFinancialController:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};

// Controller for POST /api/v1/agreement-intelligence/save-progress
// Controller for POST /api/v1/agreement-intelligence/save-progress
export const saveProgressController = async (req: Request, res: Response) => {
  try {
    const {
      agreementId,
      sessionData,
      assessmentSession,
    } = req.body;

    const targetId =
      agreementId || sessionData?.agreementId || assessmentSession?.agreementId;

    if (!targetId) {
      return res.status(400).json({ error: "agreementId is required" });
    }

    const sanitizeQuestionList = (qList: any[]): any[] => {
      if (!Array.isArray(qList)) return [];
      return qList.map((q, idx) => ({
        ...q,
        questionId: q.questionId || `Q${idx + 1}`,
        title: q.title || q.promptText || q.questionId || `Question ${idx + 1}`,
        inputType: q.inputType || determineInputType(q),
      }));
    };

    let assessment = await LeaseAssessment.findOne({ agreementId: targetId });

    if (!assessment) {
      const dataToSave = sessionData || assessmentSession || req.body;
      assessment = new LeaseAssessment({
        agreementId: targetId,
        fileName: dataToSave.fileName || "Agreement",
        stage: dataToSave.stage || "assessment",
        rawText: dataToSave.rawText || "",
        questions: sanitizeQuestionList(dataToSave.questions),
        recommendation: dataToSave.recommendation || null,
        overallConfidence: dataToSave.overallConfidence || 1.0,
        recommendationNarrative: dataToSave.recommendationNarrative || "",
        status: dataToSave.status || "in_progress",
        overrideReason: dataToSave.overrideReason,
        financialDataExtracted: dataToSave.financialDataExtracted || false,
        financialClarifications: dataToSave.financialClarifications
          ? {
              ...dataToSave.financialClarifications,
              questions: sanitizeQuestionList(dataToSave.financialClarifications.questions),
            }
          : {
              questions: [],
              status: "pending",
              resolvedFacts: {},
            },
        extractedFields: dataToSave.extractedFields || [],
        rawFinancialData: dataToSave.rawFinancialData || null,
      });
    } else {
      const incomingData = sessionData || assessmentSession || req.body;

      if (incomingData.stage) (assessment as any).stage = incomingData.stage;
      if (incomingData.questions) {
        assessment.questions = sanitizeQuestionList(incomingData.questions);
      }
      if (incomingData.status) assessment.status = incomingData.status;
      if (incomingData.recommendation !== undefined)
        assessment.recommendation = incomingData.recommendation;
      if (incomingData.recommendationNarrative !== undefined)
        assessment.recommendationNarrative = incomingData.recommendationNarrative;
      if (incomingData.managementInputs)
        assessment.managementInputs = incomingData.managementInputs;
      if (incomingData.overrideReason !== undefined)
        assessment.overrideReason = incomingData.overrideReason;
      if (incomingData.financialDataExtracted !== undefined)
        assessment.financialDataExtracted = incomingData.financialDataExtracted;
      if (incomingData.financialClarifications) {
        assessment.financialClarifications = {
          ...assessment.financialClarifications,
          ...incomingData.financialClarifications,
          questions: sanitizeQuestionList(
            incomingData.financialClarifications.questions ||
              assessment.financialClarifications?.questions ||
              [],
          ),
        };
        assessment.markModified("financialClarifications");
      }
      if (incomingData.extractedFields !== undefined) {
        (assessment as any).extractedFields = incomingData.extractedFields;
        assessment.markModified("extractedFields");
      }
      if (incomingData.rawFinancialData !== undefined) {
        (assessment as any).rawFinancialData = incomingData.rawFinancialData;
        assessment.markModified("rawFinancialData");
      }
    }

    await assessment.save();

    return res.status(200).json({
      success: true,
      message: "Progress saved successfully",
      assessment,
    });
  } catch (error: any) {
    console.error("Error in saveProgressController:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};
// Controller for GET /api/v1/agreement-intelligence/progress/:agreementId or /resume/:agreementId
export const getProgressController = async (req: Request, res: Response) => {
  try {
    const { agreementId } = req.params;
    if (!agreementId) {
      return res.status(400).json({ error: "agreementId is required" });
    }

    const assessment = await LeaseAssessment.findOne({ agreementId });
    if (!assessment) {
      return res
        .status(404)
        .json({ error: "Saved progress session not found" });
    }

    return res.status(200).json({
      success: true,
      assessment,
    });
  } catch (error: any) {
    console.error("Error in getProgressController:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};

// Controller for GET /api/v1/agreement-intelligence/saved-list
export const getSavedListController = async (req: Request, res: Response) => {
  try {
    const list = await LeaseAssessment.find(
      {},
      "agreementId fileName status recommendation overallConfidence createdAt updatedAt",
    ).sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      count: list.length,
      list,
    });
  } catch (error: any) {
    console.error("Error in getSavedListController:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};

// Controller for DELETE /api/v1/agreement-intelligence/saved/:agreementId
export const deleteSavedController = async (req: Request, res: Response) => {
  try {
    const { agreementId } = req.params;
    if (!agreementId) {
      return res.status(400).json({ error: "agreementId is required" });
    }

    const result = await LeaseAssessment.deleteOne({ agreementId });
    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ error: "Saved assessment session not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Saved assessment session deleted successfully",
    });
  } catch (error: any) {
    console.error("Error in deleteSavedController:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};

