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
  const qMap = new Map<string, string | null>();
  questions.forEach((q) => qMap.set(q.questionId, q.answer));

  const q1 = qMap.get("Q1");
  const q2 = qMap.get("Q2");
  const q3 = qMap.get("Q3");
  const q4 = qMap.get("Q4");
  const q6 = qMap.get("Q6");
  const q7 = qMap.get("Q7");
  const q9 = qMap.get("Q9");

  // 1. Variable-only payment check (Company Policy Override)
  if (q9 === "Variable Only" || q9 === "Not Satisfied" || q9 === "No" || q9 === "Variable Payments") {
    return {
      recommendation: "Service Contract",
      recommendationNarrative: [
        "### Executive Summary",
        "",
        "**Conclusion:** The arrangement **does not contain a lease** under Ind AS 116.",
        "",
        "**Reason:**",
        "The agreement specifies variable-only payments based on usage or output with no minimum guaranteed or in-substance fixed lease payments.",
        "",
        "**Lease accounting under Ind AS 116 is therefore not applicable.**",
        "",
        "### Final Opinion",
        "Recognition of a Right-of-Use Asset and Lease Liability is **not required**."
      ].join("\n"),
    };
  }

  // 2. Core Lease Identification Criteria Check
  if (q1 === "No" || q3 === "No" || q4 === "No" || q2 === "Yes") {
    let reason = "One or more mandatory qualitative criteria for lease identification under Ind AS 116 are not met.";
    if (q2 === "Yes" || q1 === "No") {
      reason = "Although the agreement specifies a particular unit or space, the Lessor retains a substantive right to substitute the asset throughout the contract term. Accordingly, the Lessee does not obtain the right to use an identified asset.";
    } else if (q3 === "No") {
      reason = "The Lessee does not obtain substantially all economic benefits from use of the identified asset.";
    } else if (q4 === "No") {
      reason = "The Lessee does not hold control over directing the use of the identified asset.";
    }

    return {
      recommendation: "Service Contract",
      recommendationNarrative: [
        "### Executive Summary",
        "",
        "**Conclusion:** The arrangement **does not contain a lease** under Ind AS 116.",
        "",
        "**Reason:**",
        reason,
        "",
        "**Lease accounting under Ind AS 116 is therefore not applicable.**",
        "",
        "### Final Opinion",
        "Recognition of a Right-of-Use Asset and Lease Liability is **not required**."
      ].join("\n"),
    };
  }

  // 3. Low-Value Exemption Check
  if (q6 === "Yes") {
    return {
      recommendation: "Exempt Lease",
      recommendationNarrative: [
        "### Executive Summary",
        "",
        "**Conclusion:** The arrangement **contains an exempt lease** under Ind AS 116.",
        "",
        "**Reason:**",
        "The lease qualifies for the Low-Value Exemption (underlying value < ₹3,00,000 / $5,000).",
        "",
        "### Final Opinion",
        "Capitalization of a Right-of-Use Asset and Lease Liability is **optional/not required**."
      ].join("\n"),
    };
  }

  // 4. Short-Term Exemption Check
  if (q7 === "Yes") {
    return {
      recommendation: "Exempt Lease",
      recommendationNarrative: [
        "### Executive Summary",
        "",
        "**Conclusion:** The arrangement **contains an exempt lease** under Ind AS 116.",
        "",
        "**Reason:**",
        "The lease qualifies for the Short-Term Exemption (lease term of 12 months or less).",
        "",
        "### Final Opinion",
        "Capitalization of a Right-of-Use Asset and Lease Liability is **optional/not required**."
      ].join("\n"),
    };
  }

  // 5. Standard Lease Conclusion
  return {
    recommendation: "Lease",
    recommendationNarrative: [
      "### Executive Summary",
      "",
      "**Conclusion:** The arrangement **contains a lease** under Ind AS 116.",
      "",
      "**Reason:**",
      "The agreement satisfies all lease identification criteria: there is an identified asset, no substantive supplier substitution rights, and the customer obtains substantially all economic benefits and directs the asset's use.",
      "",
      "### Final Opinion",
      "The Lessee **must recognize a Right-of-Use Asset and a Lease Liability** at commencement under Ind AS 116."
    ].join("\n"),
  };
}

// Transformation Layer: Converts Internal Assessment Matrix and Evidence Matrix into Q1-Q9 layout
export function transformToQ1Q9Schema(
  assessmentMatrix: any[],
  evidenceMatrix: any[],
): ILeaseAssessmentQuestion[] {
  const criterionMap: { [key: string]: string } = {
    "Identified Asset": "Q1",
    "Substitution Rights": "Q2",
    "Economic Benefits": "Q3",
    "Right to Direct Use": "Q4",
    "Separate Components": "Q5",
    "Low Value Exemption": "Q6",
    "Short-Term Exemption": "Q7",
    "Lease Term": "Q8",
    "Lease Payments": "Q9",
  };

  const evidenceMap = new Map<string, any>(
    (evidenceMatrix || []).map((e) => [e.criterion, e]),
  );

  return (assessmentMatrix || []).map((c) => {
    const qId = criterionMap[c.criterion] || "Q1";
    const evidence = evidenceMap.get(c.criterion);

    const isPending =
      c.requiresManagement === true ||
      c.decision === "Insufficient Evidence" ||
      (evidence && evidence.confidence < 1.0);

    let answerText: string | null = null;
    if (!isPending) {
      if (qId === "Q8" || qId === "Q9") {
        answerText = c.decision;
      } else {
        answerText = c.decision === "Satisfied" ? "Yes" : "No";
      }
    }

    const ruleId = evidence?.kbRuleId || "N/A";
    const ruleTitle = evidence?.kbRuleTitle || "N/A";
    const evidenceText = evidence?.agreementEvidence || "N/A";
    const reasoningText = c.reasoning || "";

    let promptText = `Please confirm the parameter for ${c.criterion}.`;
    let options = ["Yes", "No"];

    if (isPending && c.managementQuestion) {
      const qObj = c.managementQuestion;
      promptText = qObj.questionText || promptText;
      options = qObj.options || options;

      const whyPart = qObj.whyAsked ? `\n\nWhy Asked: ${qObj.whyAsked}` : "";
      const missingPart =
        qObj.missingEvidence && qObj.missingEvidence.length > 0
          ? `\n\nMissing Evidence: ${qObj.missingEvidence.join(", ")}`
          : "";
      c.reasoning = (c.reasoning || "") + whyPart + missingPart;
    }

    // Clean professional template-driven formatting for observations and citations
    const refText = ruleId !== "N/A" ? `${ruleTitle} (${ruleId})` : ruleTitle;
    const explanation = [
      `**Ind AS Reference:**\n${refText}`,
      "",
      `**Evidence:**\n${evidenceText}`,
      "",
      `**Assessment:**\n${reasoningText}`,
      "",
      `**Conclusion:**\n${
        isPending
          ? "Pending management confirmation."
          : c.decision === "Satisfied"
            ? "Criterion satisfied."
            : "Criterion not satisfied."
      }`
    ].join("\n");

    return {
      questionId: qId,
      title: c.criterion,
      status: isPending ? "pending" : "automated",
      answer: answerText,
      confidence:
        evidence?.confidence !== undefined
          ? evidence.confidence
          : isPending
            ? 0.5
            : 1.0,
      explanation,
      promptText,
      options,
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
      Review the original agreement text, the RAG compliance rules, and the current qualitative assessment answers (some confirmed by management).
      Your task is to write a professional CA-grade narrative explanation of the classification decision.

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

      CRITICAL AUDITING & WRITING STYLE INSTRUCTIONS:
      - You must write in the tone and language of an experienced, senior Chartered Accountant (CA) writing a concise audit report for a CFO or corporate finance team.
      - DO NOT use generic AI filler words or transition phrases (e.g., "This indicates...", "Therefore...", "Consequently...", "However...", "Moreover...").
      - DO NOT use textbook definitions of Ind AS 116 criteria (e.g. avoid repeating "substantive substitution rights", "identified asset", "economic benefits" multiple times). State only observations of fact and direct accounting conclusions.
      - Keep the explanation extremely brief, concise, and direct. Citing the relevant clauses and standard paragraphs (e.g., Para B14-B19).
      - Format "recommendationNarrative" exactly like a CA's Final Assessment in Markdown:
        ### Reason for Classification
        [Concise paragraph explaining the core reason. Cite the relevant clause and the Ind AS standard paragraph e.g. B14-B19]

        ### Recommendation
        [Direct, clear statement of whether Right-of-Use Asset or Lease Liability should be recognized under Ind AS 116]

      Return your response strictly as a JSON object matching this schema, without any markdown formatting or extra text:
      {
        "recommendationNarrative": "markdown formatted string as instructed above"
      }
    `;

    const { text } = await callGemini(geminiApiKey, geminiModel, prompt, true);
    const result = JSON.parse(cleanJsonResponse(text));

    // Determinstic Backend Matrix calculation
    const { recommendation, recommendationNarrative: fallbackNarrative } =
      computeFinalClassification(questions);

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
    - Style: Be extremely brief, concise, and direct. Citing the relevant clauses and standard paragraphs (e.g., Para B14-B19).
    - Jargon: DO NOT use generic AI transition phrases (e.g. "This indicates...", "Therefore...", "Consequently...", "However...", "Moreover..."). State only direct contractual observations.
    - Concise Table Observations: Keep the "reasoning" for each criterion inside the "assessmentMatrix" down to a single brief sentence or short bulleted observation of fact (e.g. "Lessor can relocate Lessee to a comparable space at any time" or "Lessee occupies the unit exclusively for business"). Do not write generic paragraphs or restate Ind AS definitions.
    - Confidence Scores: Avoid assigning exactly 1.00 (100%) confidence for evaluative criteria (like Identified Asset, Substitution Rights, Control, Economic Benefits). Use values like 0.85 to 0.95 to reflect professional judgement. Only assign 1.00 for verified, explicit numerical or contractual facts (e.g. lease term duration of 20 years or a fixed rent amount).

    Your execution steps:
    1. PHASE 1 (AGREEMENT MODEL): Read the agreement and extract raw document facts (agreementType, lessorName, lesseeName, assetDescription, paymentClause, paymentType, leaseTerm, commencementDate, expiryDate, lockInPeriod, noticePeriod, supplierRelocationClause). Do not perform any accounting classification.
    2. PHASE 2 (EVIDENCE MATRIX): For each of the 9 required criteria (Identified Asset, Substitution Rights, Economic Benefits, Right to Direct Use, Separate Components, Low Value Exemption, Short-Term Exemption, Lease Term, Lease Payments):
       - Locate the applicable rule ID, rule title, and rule explanation from the RAG context.
       - Find the matching clause or evidence in the agreement.
       - Assign a confidence score (float 0.0 to 1.0) adhering to the confidence guidelines.
    3. PHASE 3 (ASSESSMENT MATRIX): Evaluate the evidence against the KB rules to determine:
       - decision: "Satisfied", "Not Satisfied", or "Insufficient Evidence". 
         * CRITICAL LEASE PAYMENTS RULE: If the agreement payments are completely variable (e.g. rate per unit of electricity supplied, price per actual hour used, parking charge per vehicle) and contain no unavoidable in-substance fixed payments or minimum guarantees, you MUST classify the decision for "Lease Payments" as "Not Satisfied" or "Variable Only". Under Ind AS 116, usage-based variable payments do not qualify as lease payments for capitalization, meaning lease liability cannot be calculated.
       - reasoning: A very short, direct observation of fact (1 sentence max).
       - requiresManagement: boolean indicating if evidence is missing or ambiguous.
       - If requiresManagement is true, construct a managementQuestion object containing:
         * questionText: precise management clarification prompt.
         * missingEvidence: array of what parameters are missing from the agreement text.
         * whyAsked: explanation of why the question is needed.
         * options: standard confirmation options (typically ["Yes", "No"]).

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
      "evidenceMatrix": [
        {
          "criterion": "Identified Asset" | "Substitution Rights" | "Economic Benefits" | "Right to Direct Use" | "Separate Components" | "Low Value Exemption" | "Short-Term Exemption" | "Lease Term" | "Lease Payments",
          "kbRuleId": "string",
          "kbRuleTitle": "string",
          "agreementEvidence": "string",
          "confidence": number
        }
      ],
      "assessmentMatrix": [
        {
          "criterion": "Identified Asset" | "Substitution Rights" | "Economic Benefits" | "Right to Direct Use" | "Separate Components" | "Low Value Exemption" | "Short-Term Exemption" | "Lease Term" | "Lease Payments",
          "decision": "Satisfied" | "Not Satisfied" | "Insufficient Evidence",
          "requiresManagement": boolean,
          "reasoning": "string",
          "managementQuestion": {
            "questionText": "string",
            "missingEvidence": ["string"],
            "whyAsked": "string",
            "options": ["string"]
          }
        }
      ],
      "recommendationNarrative": "A professional, Chartered Accountant (CA) grade audit summary formatted in Markdown. Structure it exactly as:\n\n### Reason for Classification\n[Concise paragraph explaining the core reason. Cite the relevant clause and the Ind AS standard paragraph e.g. B14-B19]\n\n### Recommendation\n[Direct, clear statement of whether Right-of-Use Asset or Lease Liability should be recognized under Ind AS 116]"
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

  // C. Map the Evidence and Assessment matrices into the expected Q1-Q9 UI/DB Schema
  const questions = transformToQ1Q9Schema(
    parsedResponse.assessmentMatrix,
    parsedResponse.evidenceMatrix,
  );

  // D. Deterministic Backend matrix recommendation classification calculation
  const { recommendation, recommendationNarrative: fallbackNarrative } =
    computeFinalClassification(questions);

  const q9 = questions.find((q) => q.questionId === "Q9")?.answer;
  const isVariableOnly =
    q9 === "Variable Only" ||
    q9 === "Not Satisfied" ||
    q9 === "No" ||
    q9 === "Variable Payments";

  const recommendationNarrative = isVariableOnly
    ? fallbackNarrative
    : parsedResponse.recommendationNarrative || fallbackNarrative;

  const agreementId = "AGR-" + Date.now();

  // E. Save the LeaseAssessment session
  const assessmentSession = new LeaseAssessment({
    agreementId,
    fileName,
    rawText,
    questions,
    recommendation,
    overallConfidence: parsedResponse.evidenceMatrix
      ? parsedResponse.evidenceMatrix.reduce(
          (acc: number, curr: any) => acc + (curr.confidence || 0),
          0,
        ) / parsedResponse.evidenceMatrix.length
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

    if (status === "accepted_lease" || status === "overridden") {
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
            `,
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
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};
