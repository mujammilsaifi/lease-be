import mongoose, { Schema, Document } from "mongoose";

export interface IKnowledgeChunk extends Document {
  documentName: string;
  chunkId: string;
  module?: string;
  topic?: string;
  subTopic?: string;
  sectionTitle: string;
  content: string;
  examples: string[];
  decisionRules?: string;
  accountingStandard?: string;
  keywords: string[];
  embedding: number[];
  hash: string;
  version: number;
  priority: number; // 1 (lowest) to 5 (highest)
  source: string;
  category: string; // e.g. "LEASE_IDENTIFICATION"
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeChunkSchema: Schema = new Schema(
  {
    documentName: { type: String, required: true },
    chunkId: { type: String, required: true, unique: true, index: true },
    module: { type: String },
    topic: { type: String },
    subTopic: { type: String },
    sectionTitle: { type: String, required: true },
    content: { type: String, required: true },
    examples: { type: [String], default: [] },
    decisionRules: { type: String },
    accountingStandard: { type: String, default: "IND AS 116" },
    keywords: { type: [String], default: [], index: true },
    embedding: { type: [Number], required: true },
    hash: { type: String, required: true },
    version: { type: Number, default: 1 },
    priority: { type: Number, default: 3 },
    source: { type: String, default: "docx" },
    category: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model<IKnowledgeChunk>("KnowledgeChunk", KnowledgeChunkSchema);
