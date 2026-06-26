import { IKnowledgeChunk } from "../../models/knowledgeChunk.model";
import { generateCitations } from "./citationEngine";

// Assembles selected knowledge chunks and debug logs into a formatted reference context for Gemini
export function assembleContext(
  chunks: IKnowledgeChunk[],
  reasoning: string[]
): string {
  if (chunks.length === 0) {
    return "[No reference guidelines were retrieved from the knowledge base for this query.]";
  }

  const chunksContext = chunks.map((chunk, idx) => {
    let text = `### Reference [${idx + 1}]: ${chunk.sectionTitle}\n`;
    text += `Source File: ${chunk.documentName}\n`;
    if (chunk.module) text += `Module: ${chunk.module}\n`;
    if (chunk.topic) text += `Topic: ${chunk.topic}\n`;
    if (chunk.subTopic) text += `Sub-Topic: ${chunk.subTopic}\n`;
    text += `Category: ${chunk.category}\n\n`;
    
    text += `--- Content ---\n${chunk.content}\n`;
    
    if (chunk.decisionRules) {
      text += `\n--- Decision Rules ---\n${chunk.decisionRules}\n`;
    }
    
    if (chunk.examples && chunk.examples.length > 0) {
      text += `\n--- Practical Examples ---\n`;
      chunk.examples.forEach((ex, eIdx) => {
        text += `Example ${eIdx + 1}:\n${ex}\n`;
      });
    }
    
    return text;
  }).join("\n\n==================================================\n\n");

  const citations = generateCitations(chunks);

  const finalContext = `
*** SYSTEM REFERENCE CONTEXT (KNOWLEDGE BASE RETRIEVED) ***
The following sections have been semantically retrieved from our internal documentation:

${chunksContext}

*** CITATIONS INDEX ***
${citations}

*** RETRIEVAL REASONING LOG (DEBUG CONTEXT) ***
${reasoning.map((r) => "- " + r).join("\n")}
`;

  return finalContext;
}
