import { IKnowledgeChunk } from "../../models/knowledgeChunk.model";

// Generates standardized citation annotations from selected chunks
export function generateCitations(chunks: IKnowledgeChunk[]): string {
  if (chunks.length === 0) return "No citations reference.";

  const citationsList = chunks.map((chunk, idx) => {
    return `[Citation ${idx + 1}] File: ${chunk.documentName} | Section: ${chunk.sectionTitle} (Topic: ${chunk.topic || "General"})`;
  });

  return citationsList.join("\n");
}
