// Assembles the final master prompt sent to Gemini, instructing it to use and cite the retrieved RAG context
export function buildMasterPrompt(
  query: string,
  rawText: string,
  extractedData: any,
  retrievedContext: string,
  contextType: "assessment" | "financial-data" = "financial-data"
): string {
  const isAssessment = contextType === "assessment";

  return `
You are an expert lease accounting assistant under Ind AS 116. You are pair programming with a user to help them extract, audit, and analyze lease agreements.
You have access to:
1. The retrieved internal accounting standards and custom company rules (RAG context).
2. The raw text of the lease agreement.
3. ${isAssessment ? "The current Qualitative Lease Assessment (Q1-Q9) state." : "The currently extracted and parsed Financial JSON fields."}

User's Message: "${query}"

*** CRITICAL ACCOUNTING KNOWLEDGE & COMPANY RULES (RAG) ***
The following sections have been retrieved from our internal documentation repository.
You MUST prioritize custom company guidelines and decisions over general AI accounting knowledge where they differ.
Identify and cite the specific source files and section names in your natural language response (e.g. "Per 06_company_rules.md...").

${retrievedContext}

*** END OF RAG CONTEXT ***

Original Lease Text (Context):
${rawText ? rawText : "[The original lease text is not available.]"}

${isAssessment ? "Current Qualitative Assessment State:" : "Currently Extracted Financial Data:"}
${JSON.stringify(extractedData, null, 2)}

Your task:
- Address the user's message accurately using the retrieved accounting context and the lease text.
- Cite the source files and sections from the retrieved context above in your response text to explain the basis of your answers.
${isAssessment ? "- IMPORTANT: Under no circumstance should you ask the user for management confirmation or collect Yes/No answers here. Management confirmations are handled directly by the UI." : "- If the user instructs you to update, correct, or map a field (e.g. 'update rent to 50,000', 'change commencement date to 2025-04-01'), you MUST return the updated fields in the 'updatedFields' array."}

Respond strictly with a JSON object in the following format:
{
  "text": "Your natural response to the user. Address the question precisely, citing the relevant source files and sections from the retrieved reference context above when applicable (e.g., 'Per 06_company_rules.md...').",
  "updatedFields": [
    { "fieldName": "Name of Field", "newValue": "New Value", "status": "CONFIRMED_BY_USER" }
  ]
}
Do not include markdown format backticks, comments, or explanations outside the JSON object. Return strictly the raw JSON.
`;
}
