import mongoose from "mongoose";
import dotenv from "dotenv";
import { syncKnowledgeBase } from "../services/knowledge";

dotenv.config();

const MONGO_URI = process.env.MONGODB_URL as string;
const API_KEY = process.env.GEMINI_API_KEY as string;

if (!MONGO_URI || !API_KEY) {
  console.error("❌ MONGODB_URL and GEMINI_API_KEY must be defined in the .env file.");
  process.exit(1);
}

async function run() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Database Connected.");

    console.log("🔄 Syncing Knowledge Base chunks in database...");
    const syncRes = await syncKnowledgeBase(API_KEY);
    console.log(`✅ Knowledge base synced. Total chunks: ${syncRes.total}`);
    console.log(`   Added: ${syncRes.added}, Updated: ${syncRes.updated}, Deleted: ${syncRes.deleted}`);
  } catch (error) {
    console.error("❌ Sync failed with error:", error);
  } finally {
    console.log("🔌 Disconnecting from MongoDB...");
    await mongoose.disconnect();
    console.log("✅ Database disconnected.");
  }
}

run();
