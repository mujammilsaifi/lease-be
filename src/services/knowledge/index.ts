import { syncKnowledgeBase } from "./documentIndexer";
import { classifyIntent, ChatMessage } from "./intentClassifier";
import { getRequiredFilesForIntents } from "./companyRuleEngine";
import { retrieveScoredChunks } from "./retrievalEngine";
import { rerankCandidates } from "./reranker";
import { assembleContext } from "./contextAssembler";
import { buildMasterPrompt } from "./promptBuilder";
import KnowledgeChunk from "../../models/knowledgeChunk.model";

export { syncKnowledgeBase } from "./documentIndexer";
export { classifyIntent, ChatMessage, IntentResult } from "./intentClassifier";

export interface BrainResult {
  prompt: string;
  context: string;
  intent: {
    categories: string[];
    standaloneQuery: string;
    explanation: string;
  };
  reasoning: string[];
}

// Orchestrates the entire RAG pipeline from intent classification, hybrid retrieval, reranking, to final prompt generation
export async function processRAGQuery(
  query: string,
  history: ChatMessage[],
  rawText: string,
  extractedData: any,
  apiKey: string
): Promise<BrainResult> {
  // 1. Auto-index baseline chunks if the database is empty
  const count = await KnowledgeChunk.countDocuments();
  if (count === 0) {
    console.log("[RAG Brain] Database is empty. Syncing knowledge base files...");
    await syncKnowledgeBase(apiKey);
  }

  // 2. Classify user intent and formulate standalone query
  const intentResult = await classifyIntent(query, history, apiKey);

  // 3. Rule Engine: Map categories to compliance files
  const requiredFiles = getRequiredFilesForIntents(intentResult.categories);

  // 4. Hybrid Search Retrieval
  const scoredChunks = await retrieveScoredChunks(
    intentResult.standaloneQuery,
    intentResult.categories,
    requiredFiles,
    apiKey
  );

  // 5. Reranking & Filtering
  const { selected: rerankedChunks, reasoning } = rerankCandidates(scoredChunks, requiredFiles);

  // 6. Assemble context with metadata and examples
  const context = assembleContext(rerankedChunks, reasoning);

  // 7. Generate final master prompt
  const prompt = buildMasterPrompt(query, rawText, extractedData, context);

  return {
    prompt,
    context,
    intent: intentResult,
    reasoning,
  };
}
