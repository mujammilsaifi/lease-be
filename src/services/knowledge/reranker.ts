import { ScoredChunk } from "./retrievalEngine";
import { IKnowledgeChunk } from "../../models/knowledgeChunk.model";

// Reranks and selects the best 5 knowledge chunks, ensuring company rules and examples are included
export function rerankCandidates(
  scoredChunks: ScoredChunk[],
  requiredFiles: string[]
): { selected: IKnowledgeChunk[]; reasoning: string[] } {
  const selected: IKnowledgeChunk[] = [];
  const reasoning: string[] = [];
  const selectedChunkIds = new Set<string>();

  // 1. Take top 10 candidates for reranking evaluation
  const candidates = scoredChunks.slice(0, 10);

  // 2. Identify required/forced compliance chunks first (e.g. company rules matching active intents)
  for (const candidate of candidates) {
    const isFileRequired = requiredFiles.includes(candidate.chunk.documentName);
    const isCompanyRule = candidate.chunk.documentName === "06_company_rules.md";
    
    if ((isCompanyRule || isFileRequired) && selected.length < 5) {
      if (!selectedChunkIds.has(candidate.chunk.chunkId)) {
        selected.push(candidate.chunk);
        selectedChunkIds.add(candidate.chunk.chunkId);
        reasoning.push(
          `[Forced Rule/Intent Match] Chunk: ${candidate.chunk.chunkId} | ${candidate.reason}`
        );
      }
    }
  }

  // 3. Select remaining top candidates based on blended Hybrid Score
  for (const candidate of candidates) {
    if (selected.length >= 5) break;
    if (!selectedChunkIds.has(candidate.chunk.chunkId)) {
      selected.push(candidate.chunk);
      selectedChunkIds.add(candidate.chunk.chunkId);
      reasoning.push(
        `[Hybrid Score Match] Chunk: ${candidate.chunk.chunkId} | Score: ${candidate.finalScore.toFixed(3)} | ${candidate.reason}`
      );
    }
  }

  // 4. Practical Example Retrieval: Ensure we include at least one concrete example
  const hasExample = 
    selected.some((chunk) => chunk.examples && chunk.examples.length > 0) || 
    selected.some((chunk) => chunk.documentName === "10_real_examples.md");
                      
  if (!hasExample && selected.length < 5) {
    // Find the first available example chunk from the scored list
    const exampleCandidate = scoredChunks.find(
      (sc) =>
        !selectedChunkIds.has(sc.chunk.chunkId) &&
        (sc.chunk.documentName === "10_real_examples.md" || (sc.chunk.examples && sc.chunk.examples.length > 0))
    );
    if (exampleCandidate) {
      selected.push(exampleCandidate.chunk);
      selectedChunkIds.add(exampleCandidate.chunk.chunkId);
      reasoning.push(
        `[Example Inclusion] Chunk: ${exampleCandidate.chunk.chunkId} | ${exampleCandidate.reason}`
      );
    }
  }

  console.log(`[Reranker] Selected ${selected.length} chunks. Selection logs:\n` + reasoning.join("\n"));

  return {
    selected,
    reasoning,
  };
}
