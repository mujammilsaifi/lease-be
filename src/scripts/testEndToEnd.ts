import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { performance } from "perf_hooks";
import { syncKnowledgeBase, processRAGQuery } from "../services/knowledge";
import { callGemini } from "../controllers/agreement-intelligence/geminiService";

dotenv.config();

const MONGO_URI = process.env.MONGODB_URL as string;
const API_KEY = process.env.GEMINI_API_KEY as string;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!MONGO_URI || !API_KEY) {
  console.error("❌ MONGODB_URL and GEMINI_API_KEY must be defined in the .env file.");
  process.exit(1);
}

// Simple PDF parser function matching local project configuration
async function performOCR(filePath: string): Promise<string> {
  console.log("⚠️ Low text density detected. OCR Fallback Triggered for file:", filePath);
  let parser;
  try {
    const [{ PDFParse }, { createWorker }] = await Promise.all([
      import("pdf-parse"),
      import("tesseract.js"),
    ]);

    const fileBuffer = fs.readFileSync(filePath);
    parser = new PDFParse({ data: fileBuffer });

    // Render all pages to screenshots
    const screenshots = await parser.getScreenshot({
      scale: 2.0, // scale factor for OCR resolution
      imageBuffer: true,
    });

    console.log(
      `Generated ${screenshots.pages.length} page image buffers. Beginning tesseract.js OCR...`,
    );

    const ocrTexts: string[] = [];
    const worker = await createWorker("eng");

    for (const page of screenshots.pages) {
      if (!page.data) {
        throw new Error(
          `Page ${page.pageNumber} rendered image buffer is empty`,
        );
      }
      console.log(
        `Performing OCR on page ${page.pageNumber}/${screenshots.pages.length}...`,
      );
      const {
        data: { text },
      } = await worker.recognize(Buffer.from(page.data));
      ocrTexts.push(text);
    }

    await worker.terminate();
    console.log("✅ OCR complete.");
    return ocrTexts.join("\n");
  } catch (err: any) {
    console.error("❌ OCR processing failed:", err);
    throw new Error(`OCR processing failed: ${err.message}`);
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {}
    }
  }
}

// Simple PDF parser function matching local project configuration with OCR fallback
async function parsePDF(filePath: string): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const fileBuffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: fileBuffer });
  const data = await parser.getText();
  try {
    await parser.destroy();
  } catch {}

  let text = data.text || "";
  const numPages = data.total || 1;
  const avgCharsPerPage = text.trim().length / numPages;

  if (text.trim().length < 1500 || avgCharsPerPage < 500) {
    text = await performOCR(filePath);
  }

  return text;
}

// Initial pass: extract structured data from lease raw text
async function getInitialExtractedData(rawText: string): Promise<any> {
  const schemaPrompt = `
    You are an expert lease data extraction engine.
    Extract the lease terms from the lease document text below.
    Return a JSON matching exactly this schema, without any markdown backticks, formatting or explanations:
    {
      "lessorName": "Name of the Lessor (string or null)",
      "natureOfLease": "Type of lease (Must be one of: 'Leasehold land', 'Building', 'Warehouse', 'Plant and Machinery', 'Vehicle', 'Office Equipments', 'Computer and Peripherals', 'Furniture and fixtures', 'Security Deposit', 'Other' or null)",
      "leasePeriod": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
      "rentPaymentFrequency": "One of: 'monthly', 'quarterly', 'semi-annual', 'annual' or null",
      "rentAmount": 0,
      "securityDeposit": 0
    }

    Lease Document Text:
    ${rawText.substring(0, 15000)} // Truncated to fit
  `;

  const { text } = await callGemini(API_KEY, MODEL, schemaPrompt, true);
  // Clean JSON response
  const cleanJsonText = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleanJsonText);
}

async function runEndToEndTest() {
  const pdfPath = "C:\\Users\\hp\\Downloads\\20. Prius Agreement Office MCInd D3 200723_15.04.2020 to 14.04.2023.pdf";
  console.log(`🚀 Starting End-to-End RAG Test on PDF:\n   "${pdfPath}"\n`);
  
  const startTimeTotal = performance.now();

  try {
    // 1. Connect database
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Database Connected.");

    // 2. Sync Knowledge base
    console.log("🔄 Syncing Knowledge Base chunks in database...");
    const syncRes = await syncKnowledgeBase(API_KEY);
    console.log(`✅ Knowledge base synced. Total chunks: ${syncRes.total}\n`);

    // 3. Read and parse PDF
    console.log("📄 Extracting text from PDF document...");
    const parseStart = performance.now();
    const rawText = await parsePDF(pdfPath);
    const parseEnd = performance.now();
    console.log(`✅ Text extracted successfully. Length: ${rawText.length} characters.`);
    console.log(`⏱️ PDF Parsing time: ${((parseEnd - parseStart) / 1000).toFixed(2)} seconds\n`);

    // 4. Extract initial data model
    console.log("⚙️ Running initial Gemini extraction pass to establish metadata...");
    const extractStart = performance.now();
    const extractedData = await getInitialExtractedData(rawText);
    const extractEnd = performance.now();
    console.log("✅ Initial extracted data fields:");
    console.log(JSON.stringify(extractedData, null, 2));
    console.log(`⏱️ Initial extraction time: ${((extractEnd - extractStart) / 1000).toFixed(2)} seconds\n`);

    // 5. Run sequential conversational RAG queries
    const history: any[] = [];
    const queries = [
      {
        question: "Is this agreement a lease under IND AS 116? Explain based on control and substitution rights.",
        type: "Lease Identification"
      },
      {
        question: "What are the start date, end date, and total lease term of this agreement?",
        type: "Lease Term"
      },
      {
        question: "Calculate the lease liability for this agreement. Explain what discount rate / IBR you are using and show the calculation logic.",
        type: "Lease Liability"
      }
    ];

    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      console.log(`----------------------------------------------------------------------`);
      console.log(`💬 Chat Query ${i + 1} (${q.type}):`);
      console.log(`   "${q.question}"`);
      console.log(`----------------------------------------------------------------------`);

      const queryStart = performance.now();

      // Run RAG system
      const brainResult = await processRAGQuery(
        q.question,
        history,
        rawText,
        extractedData,
        API_KEY
      );

      // Call Gemini with compiled RAG context
      const { text: responseText } = await callGemini(API_KEY, MODEL, brainResult.prompt, true);
      const cleanJson = responseText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      const parsedResponse = JSON.parse(cleanJson);

      const queryEnd = performance.now();
      const duration = (queryEnd - queryStart) / 1000;

      console.log(`\n📌 Detected Categories: ${brainResult.intent.categories.join(", ")}`);
      console.log(`📌 Standalone Query: "${brainResult.intent.standaloneQuery}"`);
      
      console.log(`\n📌 Selection Reasoning Logs:`);
      brainResult.reasoning.forEach((log) => console.log(`   - ${log}`));

      console.log(`\n🤖 AI Response:`);
      console.log(parsedResponse.text);

      if (parsedResponse.updatedFields && parsedResponse.updatedFields.length > 0) {
        console.log(`\n📌 Field Corrections / Updates Requested:`);
        console.log(JSON.stringify(parsedResponse.updatedFields, null, 2));
      }

      console.log(`\n⏱️ Query execution time: ${duration.toFixed(2)} seconds\n`);

      // Add to conversation history
      history.push({
        id: `user-${i}`,
        sender: "user",
        text: q.question,
        timestamp: new Date().toISOString()
      });
      history.push({
        id: `ai-${i}`,
        sender: "ai",
        text: parsedResponse.text,
        timestamp: new Date().toISOString()
      });
    }

    const endTimeTotal = performance.now();
    console.log(`======================================================================`);
    console.log(`🏁 End-to-End RAG Test Completed Successfully.`);
    console.log(`⏱️ Total process execution time: ${((endTimeTotal - startTimeTotal) / 1000).toFixed(2)} seconds`);
    console.log(`======================================================================`);

  } catch (error: any) {
    console.error("❌ End-to-end test failed with error:", error);
  } finally {
    console.log("🔌 Disconnecting from MongoDB...");
    await mongoose.disconnect();
    console.log("✅ Database disconnected.");
  }
}

runEndToEndTest();
