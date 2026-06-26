import fs from "fs";
import path from "path";
import crypto from "crypto";
import { generateRichChunks } from "./chunkGenerator";
import { getEmbedding } from "./embeddingService";
import KnowledgeChunk from "../../models/knowledgeChunk.model";

function getMd5Hash(text: string): string {
  return crypto.createHash("md5").update(text).digest("hex");
}

// Synchronizes markdown documents in the knowledge_base folder with the MongoDB database
export async function syncKnowledgeBase(apiKey: string): Promise<{ added: number; updated: number; deleted: number; total: number }> {
  try {
    const kbDir = path.resolve(__dirname, "../../../knowledge_base");
    if (!fs.existsSync(kbDir)) {
      console.warn(`[RAG Indexer] Knowledge base directory not found at: ${kbDir}`);
      return { added: 0, updated: 0, deleted: 0, total: 0 };
    }

    const files = fs.readdirSync(kbDir).filter((file) => file.endsWith(".md"));
    let added = 0;
    let updated = 0;
    const currentChunkIds = new Set<string>();

    for (const file of files) {
      const filePath = path.join(kbDir, file);
      const text = fs.readFileSync(filePath, "utf-8");
      const richChunks = generateRichChunks(file, text);

      for (const richChunk of richChunks) {
        // Generate a unique chunk ID combining file name and section title
        const chunkId = `${richChunk.documentName}#${richChunk.sectionTitle.replace(/\s+/g, "-").toLowerCase()}`;
        currentChunkIds.add(chunkId);
        
        const contentHash = getMd5Hash(richChunk.content);
        const existing = await KnowledgeChunk.findOne({ chunkId });

        // Text representation for vector computation
        const embedText = `Title: ${richChunk.sectionTitle}\nTopic: ${richChunk.topic || ""}\nCategory: ${richChunk.category}\nContent: ${richChunk.content}`;

        if (!existing) {
          console.log(`[RAG Indexer] Generating embedding for new chunk: ${chunkId}`);
          const embedding = await getEmbedding(embedText, apiKey);

          await KnowledgeChunk.create({
            documentName: richChunk.documentName,
            module: richChunk.module,
            topic: richChunk.topic,
            subTopic: richChunk.subTopic,
            sectionTitle: richChunk.sectionTitle,
            content: richChunk.content,
            examples: richChunk.examples,
            decisionRules: richChunk.decisionRules,
            accountingStandard: richChunk.accountingStandard,
            keywords: richChunk.keywords,
            embedding,
            hash: contentHash,
            version: 1,
            priority: richChunk.priority,
            source: richChunk.source,
            category: richChunk.category,
            chunkId,
          });
          added++;
        } else if (existing.hash !== contentHash) {
          console.log(`[RAG Indexer] Regeneating embedding for changed chunk: ${chunkId}`);
          const embedding = await getEmbedding(embedText, apiKey);

          existing.content = richChunk.content;
          existing.module = richChunk.module;
          existing.topic = richChunk.topic;
          existing.subTopic = richChunk.subTopic;
          existing.sectionTitle = richChunk.sectionTitle;
          existing.examples = richChunk.examples;
          existing.decisionRules = richChunk.decisionRules;
          existing.accountingStandard = richChunk.accountingStandard;
          existing.keywords = richChunk.keywords;
          existing.embedding = embedding;
          existing.hash = contentHash;
          existing.version = (existing.version || 1) + 1;
          existing.priority = richChunk.priority;
          existing.category = richChunk.category;

          await existing.save();
          updated++;
        }
      }
    }

    // Clean up old chunks that are no longer in the documents
    const allStored = await KnowledgeChunk.find({}, { chunkId: 1 });
    let deleted = 0;
    for (const stored of allStored) {
      if (!currentChunkIds.has(stored.chunkId)) {
        console.log(`[RAG Indexer] Deleting stale chunk from DB: ${stored.chunkId}`);
        await KnowledgeChunk.deleteOne({ chunkId: stored.chunkId });
        deleted++;
      }
    }

    const total = await KnowledgeChunk.countDocuments();
    console.log(`[RAG Indexer] Sync completed. Added: ${added}, Updated: ${updated}, Deleted: ${deleted}, Total: ${total}`);
    return { added, updated, deleted, total };
  } catch (error) {
    console.error("[RAG Indexer] Sync failed:", error);
    throw error;
  }
}
