import { getEmbedding } from "./embeddingService";
import KnowledgeChunk, { IKnowledgeChunk } from "../../models/knowledgeChunk.model";

// Compute dot product of two vectors
function dotProduct(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) return 0;
  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    sum += v1[i] * v2[i];
  }
  return sum;
}

// Compute simple word overlap score between query and chunk
function computeKeywordScore(query: string, content: string, keywords: string[]): number {
  const queryWords = query.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  if (queryWords.length === 0) return 0;

  let matches = 0;
  const contentLower = content.toLowerCase();

  for (const word of queryWords) {
    if (contentLower.includes(word) || (keywords && keywords.some((kw) => kw.includes(word)))) {
      matches++;
    }
  }
  return matches / queryWords.length;
}

export interface ScoredChunk {
  chunk: IKnowledgeChunk;
  embeddingSimilarity: number;
  keywordScore: number;
  categoryMatch: number;
  priorityBoost: number;
  companyRuleBoost: number;
  finalScore: number;
  reason: string;
}

// Retrieves all chunks scored by hybrid similarity metrics
export async function retrieveScoredChunks(
  standaloneQuery: string,
  categories: string[],
  requiredFiles: string[],
  apiKey: string
): Promise<ScoredChunk[]> {
  // 1. Get embedding for standalone query
  const queryVector = await getEmbedding(standaloneQuery, apiKey);

  // 2. Fetch chunks
  const chunks = await KnowledgeChunk.find({});
  const scoredChunks: ScoredChunk[] = [];

  for (const chunk of chunks) {
    // Cosine similarity
    const embeddingSimilarity = dotProduct(queryVector, chunk.embedding);

    // Keyword overlap
    const keywordScore = computeKeywordScore(standaloneQuery, chunk.content, chunk.keywords || []);

    // Category match
    const hasCategoryMatch = categories.map((c) => c.toUpperCase()).includes(chunk.category.toUpperCase());
    const categoryMatch = hasCategoryMatch ? 1.0 : 0.0;

    // Priority boost (1 to 5 scaled to 0.02 - 0.10)
    const priorityBoost = (chunk.priority || 3) * 0.02;

    // Company rule boost (extra weight to custom company directives)
    const isCompanyRuleFile = chunk.documentName === "06_company_rules.md";
    const companyRuleBoost = (isCompanyRuleFile && hasCategoryMatch) ? 0.15 : 0.0;

    // Blended Hybrid Score
    const finalScore =
      embeddingSimilarity * 0.5 +
      keywordScore * 0.15 +
      categoryMatch * 0.20 +
      priorityBoost +
      companyRuleBoost;

    // Selection explanation log
    const reason = `Sim: ${embeddingSimilarity.toFixed(2)} | Key: ${keywordScore.toFixed(2)} | CatMatch: ${categoryMatch} | Prio: ${chunk.priority} | RuleBoost: ${companyRuleBoost > 0 ? "Yes" : "No"}`;

    scoredChunks.push({
      chunk,
      embeddingSimilarity,
      keywordScore,
      categoryMatch,
      priorityBoost,
      companyRuleBoost,
      finalScore,
      reason,
    });
  }

  // Sort descending by final score
  scoredChunks.sort((a, b) => b.finalScore - a.finalScore);

  return scoredChunks;
}
