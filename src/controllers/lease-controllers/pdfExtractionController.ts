import { Request, Response } from "express";
import fs from "fs";

async function performOCR(filePath: string): Promise<string> {
  console.log("OCR Triggered for file:", filePath);
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
    console.log("OCR complete.");
    return ocrTexts.join("\n");
  } catch (err: any) {
    console.error("OCR processing failed:", err);
    throw new Error(`OCR processing failed: ${err.message}`);
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {}
    }
  }
}

async function callGemini(
  geminiApiKey: string,
  geminiModel: string,
  content: string,
  formatJson = false,
): Promise<string> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const request: any = {
    model: geminiModel,
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

  // Log token usage and estimated cost
  const usage = response.usageMetadata;
  if (usage) {
    const inputTokens = usage.promptTokenCount || 0;
    const outputTokens = usage.candidatesTokenCount || 0;

    // Assuming standard Gemini 1.5/2.5 Flash pricing (<128k context):
    // Input: $0.075 per 1M tokens | Output: $0.30 per 1M tokens
    const costUsd =
      (inputTokens / 1000000) * 0.075 + (outputTokens / 1000000) * 0.3;
    const costInr = costUsd * 95; // 1 USD = 95 INR

    console.log(
      `[Gemini Cost Estimate] Model: ${geminiModel} | ` +
        `Input Tokens: ${inputTokens} | ` +
        `Output Tokens: ${outputTokens} | ` +
        `Est. Cost: ₹${costInr.toFixed(4)}`,
    );
  }

  if (!responseText.trim()) {
    throw new Error("Empty response received from Gemini model.");
  }

  return responseText.trim();
}

function cleanJsonResponse(responseText: string): string {
  let cleanedText = responseText.trim();
  if (cleanedText.startsWith("\`\`\`json")) {
    cleanedText = cleanedText.substring(7);
  } else if (cleanedText.startsWith("\`\`\`")) {
    cleanedText = cleanedText.substring(3);
  }
  if (cleanedText.endsWith("\`\`\`")) {
    cleanedText = cleanedText.substring(0, cleanedText.length - 3);
  }
  return cleanedText.trim();
}

function normalizeLinkedPeriods(parsedJson: any) {
  // If leasePeriod exists, default leaseWorkingPeriod and lockingPeriod to leasePeriod if not provided
  if (parsedJson.leasePeriod) {
    if (!parsedJson.leaseWorkingPeriod) {
      parsedJson.leaseWorkingPeriod = parsedJson.leasePeriod;
    }
    if (!parsedJson.lockingPeriod) {
      parsedJson.lockingPeriod = parsedJson.leaseWorkingPeriod;
    }
  } else {
    // Fallback logic if leasePeriod is not present
    if (parsedJson.leaseWorkingPeriod && !parsedJson.lockingPeriod) {
      parsedJson.lockingPeriod = parsedJson.leaseWorkingPeriod;
    } else if (parsedJson.lockingPeriod && !parsedJson.leaseWorkingPeriod) {
      parsedJson.leaseWorkingPeriod = parsedJson.lockingPeriod;
    }
  }
}

export const extractPdfController = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF file uploaded" });
    }

    // MIME Validation
    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "Uploaded file is not a PDF" });
    }

    // Size Validation (15MB limit)
    const MAX_SIZE = 15 * 1024 * 1024;
    if (req.file.size > MAX_SIZE) {
      return res.status(400).json({ error: "PDF file exceeds 15MB limit" });
    }

    const fileBuffer = fs.readFileSync(req.file.path);

    // 1. Try digital text extraction
    let pdfData;
    let parser;
    try {
      parser = new PDFParse({ data: fileBuffer });
      pdfData = await parser.getText();
    } catch (parseErr: any) {
      throw new Error(`Failed to parse digital PDF: ${parseErr.message}`);
    } finally {
      if (parser) {
        try {
          await parser.destroy();
        } catch {}
      }
    }

    let extractedText = pdfData.text || "";

    // 2. Check text threshold (500 chars) for scanned PDF
    if (extractedText.trim().length < 500) {
      console.log("Extracted text length is low. Triggering OCR...");
      extractedText = await performOCR(req.file.path);
    }

    if (!extractedText.trim()) {
      throw new Error("No text content could be extracted from this PDF.");
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    const processedText = extractedText;
    const analysisPrompt = `
      You are an expert lease agreement reader and writer. 
      The lease agreement may use complex legal wording, varying terminology, and different structures every time.
      Read the document like a senior legal/financial analyst and identify the true commercial intent behind the text.
      Many inputs might not be available in the document. If an input is not found, do not hallucinate; note it as missing.

      Analyze the lease text and return concise structured findings under these headings:
      1. Parties and roles:
         - Identify lessor/licensor/landlord/service provider names.
         - Identify lessee/licensee/tenant/customer names when available.
      2. Lease asset / nature:
         - Identify the nature of the lease. It MUST be categorized into one of these exact types: 'Leasehold land', 'Building', 'Warehouse', 'Plant and Machinery', 'Vehicle', 'Office Equipments', 'Computer and Peripherals', 'Furniture and fixtures', 'Security Deposit', or 'Other'.
         - For office space, shop, apartment, flat, or residential property, use 'Building'.
         - For open land, plot, or bare land, use 'Leasehold land'.
         - For godown, storage, or industrial shed, use 'Warehouse'.
      3. Date terms:
         - Find commencement/effective/start dates.
         - Find valid till/expiry/end dates.
         - Find tenure/duration clauses and calculate dates only when clear.
         - Find lease working period and lock-in/locking period if separately stated. If not separately stated, note that they follow the main lease period.
      4. Payment terms:
         - Find rent, lease rent, license fee, subscription fee, service fee, seat charges, area charges, GST/tax exclusions, payment timing, and due date.
         - Calculate totals when the document provides quantity multiplied by rate.
         - Infer frequency from phrases like monthly, per month, quarterly, annually, recurring billing, or monthly subscription.
      5. Escalation Clauses (Rent Increase):
         - Systematic Escalation: Rent increases by a fixed percentage at regular intervals (e.g., "rent increases by 5% every year", "10% escalation every 3 years").
         - Adhoc Escalation: Rent changes to specific fixed amounts for specific date ranges (e.g., "Rs 50,000 for year 1-2, Rs 60,000 for year 3-5").
      6. Rent-Free / Fit-out Periods:
         - Identify any periods where rent is explicitly waived or discounted (e.g., "first 3 months are rent-free for fit-outs", "no rent for the first 45 days").
      7. Discounting Rate:
         - Look for mentions of a discount rate, incremental borrowing rate (IBR), or interest rate used for lease liability calculations (e.g., "discount rate of 8.5%").
      8. Deposits:
         - Find refundable security deposit, interest-free deposit, guarantee, or similar amounts.
      9. Termination / lock-in:
         - Identify lock-in clauses and termination notice clauses.
      10. Evidence:
         - Include short evidence snippets or paraphrased source phrases for important inferred values.

      Important inference rules:
      - "Commencement Date", "effective from", "shall commence from", "valid from", or similar wording usually indicates lease start.
      - "Valid till", "expires on", "valid up to", "ending on", or similar wording usually indicates lease end.
      - Monthly subscription/license/service/seat fee is rentAmount for this schema.
      - Refundable deposit is securityDeposit for this schema.
      - Convert Indian currency formats such as Rs. 4,55,000 or INR 2,45,700 to plain numeric meaning.
      - If lock-in period or working period are not separately stated, they follow the main lease period.
      - For rent-free periods, percentage waived is typically 100 unless stated otherwise.

      Lease Document Text:
      ${processedText}
    `;

    const schemaPrompt = `
      You are an expert lease data normalization engine and lease agreement writer.
      Convert the lease analysis into the required input JSON schema.
      Use only the lease analysis and the original document text below. Infer and calculate values when the legal/business meaning is clear.
      If an input is not available in the document, return null or an empty array for lists. Do not hallucinate values.
      Return the output as a valid JSON object matching exactly this schema, without any markdown formatting, backticks, or extra text:

      {
        "lessorName": "Name of the Lessor (string or null)",
        "natureOfLease": "Type of lease (Must be one of: 'Leasehold land', 'Building', 'Warehouse', 'Plant and Machinery', 'Vehicle', 'Office Equipments', 'Computer and Peripherals', 'Furniture and fixtures', 'Security Deposit', 'Other' or null)",
        "leasePeriod": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
        "leaseWorkingPeriod": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
        "lockingPeriod": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
        "rentPaymentType": "Either 'Advance Payment' or 'Arrear Payment' or null",
        "rentPaymentFrequency": "One of: 'monthly', 'quarterly', 'semi-annual', 'annual' or null",
        "rentAmount": 0,
        "rentPaymentDate": 1,
        "securityDeposit": 0,
        "discountingRates": [
          { "dateRange": ["YYYY-MM-DD", "YYYY-MM-DD"], "rate": 0 }
        ],
        "systematicEscalations": [
          { "dateRange": "YYYY-MM-DD", "frequency": "annual", "percentage": 0 }
        ],
        "adhocEscalations": [
          { "dateRange": ["YYYY-MM-DD", "YYYY-MM-DD"], "frequency": "monthly", "amount": 0 }
        ],
        "rentFreePeriods": [
          { "dateRange": ["YYYY-MM-DD", "YYYY-MM-DD"], "percentage": 100 }
        ],
        "confidence": 0.95
      }

      Notes:
      - If a field cannot be determined or reasonably inferred from the document, use null (or [] for arrays).
      - Do not require exact schema field names to appear in the document. Infer from equivalent legal/business wording.
      - "Commencement Date", "effective from" usually indicates leasePeriod.start.
      - "Valid till", "expires on" usually indicates leasePeriod.end.
      - If the document gives a duration from a start date, calculate the end date only when the language is clear.
      - Monthly subscription fee, license fee, rent, or equivalent recurring occupancy charge should be treated as rentAmount.
      - If the document gives units multiplied by a rate, such as "35 seats x Rs. 7,020", calculate the total rentAmount.
      - If billing or fee language is monthly, return rentPaymentFrequency as "monthly".
      - Refundable deposit, interest-free refundable deposit, or similar wording should be treated as securityDeposit.
      - Convert Indian currency formats like Rs. 4,55,000 into plain numbers like 455000.
      - Return all dates in YYYY-MM-DD format. 
      - For leaseWorkingPeriod and lockingPeriod, if they are not explicitly stated, use the exact same dates as leasePeriod.
      - For rentPaymentDate, if they say end of month/period, use 'endOfPeriod'. If a specific numerical date is given, use the number.
      - For systematicEscalations, dateRange is a SINGLE string "YYYY-MM-DD" indicating when the escalation starts/applies.
      - For adhocEscalations, rentFreePeriods, and discountingRates, dateRange is an ARRAY of two strings: ["start_date", "end_date"].
      - For rentFreePeriods, the percentage is typically 100 unless a partial waiver is specified.
      - Estimate a confidence score between 0.0 and 1.0 representing your certainty of the extraction accuracy.
      
      Lease Analysis:
      {{LEASE_ANALYSIS}}

      Original Lease Document Text:
      ${processedText}

      Respond strictly with the raw JSON. Do not include any explanation, markdown formatting, comments, or extra text.
    `;

    console.log(
      `Analyzing lease text (${processedText.length} characters) with Gemini model ${geminiModel}...`,
    );
    const leaseAnalysis = await callGemini(
      geminiApiKey,
      geminiModel,
      analysisPrompt,
    );

    console.log("Converting lease analysis into required JSON schema...");
    const responseText = await callGemini(
      geminiApiKey,
      geminiModel,
      schemaPrompt.replace("{{LEASE_ANALYSIS}}", leaseAnalysis),
      true,
    );

    const parsedJson = JSON.parse(cleanJsonResponse(responseText));
    normalizeLinkedPeriods(parsedJson);

    // Confidence assessment
    const confidence =
      typeof parsedJson.confidence === "number" ? parsedJson.confidence : 1.0;
    parsedJson.requiresManualReview = confidence < 0.7;

    return res.status(200).json(parsedJson);
  } catch (error: any) {
    console.error("Error extracting lease data from PDF:", error);
    return res.status(500).json({
      error: "Error processing the PDF. Please check backend logs.",
      details: error.message,
    });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log("Successfully cleaned up temp file:", req.file.path);
      } catch (cleanupErr) {
        console.error("Failed to clean up temp file:", cleanupErr);
      }
    }
  }
};
