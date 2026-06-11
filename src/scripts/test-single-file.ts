import fs from "fs";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

async function performOCR(filePath: string): Promise<string> {
  console.log("OCR triggered for file:", filePath);
  let parser;
  try {
    const fileBuffer = fs.readFileSync(filePath);
    parser = new PDFParse({ data: fileBuffer });

    const screenshots = await parser.getScreenshot({
      scale: 2.0,
      imageBuffer: true,
    });

    const ocrTexts: string[] = [];
    const worker = await createWorker("eng");

    for (const page of screenshots.pages) {
      if (!page.data) {
        throw new Error(`Page ${page.pageNumber} rendered image buffer is empty`);
      }
      console.log(`Performing OCR on page ${page.pageNumber}/${screenshots.pages.length}...`);
      const {
        data: { text },
      } = await worker.recognize(Buffer.from(page.data));
      ocrTexts.push(text);
    }

    await worker.terminate();
    return ocrTexts.join("\n");
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {}
    }
  }
}

async function callGemini(content: string, formatJson = false): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const request: any = {
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
    contents: content,
    config: {
      temperature: 0,
    },
  };

  if (formatJson) {
    request.config.responseMimeType = "application/json";
  }

  const response = await ai.models.generateContent(request);
  const responseText = response.text || "";
  if (!responseText.trim()) {
    throw new Error("Gemini returned an empty response.");
  }

  return responseText.trim();
}

async function runTest() {
  const filePath = "C:\\Users\\hp\\Downloads\\Evolve Work Studio Fy-23-24.pdf";

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at path: ${filePath}`);
    return;
  }

  const fileBuffer = fs.readFileSync(filePath);
  let parser;
  let text = "";

  try {
    parser = new PDFParse({ data: fileBuffer });
    const result = await parser.getText();
    text = result.text || "";
    console.log(`Digital text length: ${text.trim().length}`);
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {}
    }
  }

  if (text.trim().length < 500) {
    text = await performOCR(filePath);
    console.log(`OCR text length: ${text.trim().length}`);
  }

  if (!text.trim()) {
    throw new Error("No text content found.");
  }

  const fullText = text;

  const analysisPrompt = `
    You are an expert lease analyst. Analyze the lease agreement text and identify parties, lease asset, dates, payment terms, deposits, termination, lock-in, and evidence for inferred values.
    Infer legal/commercial meaning from varied wording. Calculate totals such as seats multiplied by rate. Treat monthly subscription/license/service/seat fee as rent for the schema. Treat refundable deposits as security deposits.

    Lease Document Text:
    ${fullText}
  `;

  const leaseAnalysis = await callGemini(analysisPrompt);
  console.log("\nLease analysis:");
  console.log(leaseAnalysis);

  const schemaPrompt = `
    Convert this lease analysis into raw JSON only:
    {
      "lessorName": "string or null",
      "natureOfLease": "Leasehold land | Building | Warehouse | Plant and Machinery | Vehicle | Office Equipments | Computer and Peripherals | Furniture and fixtures | Security Deposit | Other | null",
      "leasePeriod": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
      "leaseWorkingPeriod": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
      "lockingPeriod": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
      "rentPaymentType": "Advance Payment | Arrear Payment | null",
      "rentPaymentFrequency": "monthly | quarterly | semi-annual | annual | null",
      "rentAmount": 0,
      "rentPaymentDate": 1,
      "securityDeposit": 0,
      "confidence": 0.95
    }

    Use null when a value is not supported. If only leaseWorkingPeriod or lockingPeriod is present, use the same value for the missing one.

    Lease Analysis:
    ${leaseAnalysis}

    Original Text:
    ${fullText}
  `;

  const jsonResponse = await callGemini(schemaPrompt, true);
  console.log("\nJSON response:");
  console.log(jsonResponse);
}

runTest().catch(console.error);
