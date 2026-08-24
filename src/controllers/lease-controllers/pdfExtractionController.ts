import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { emitProgress } from "./extractProgressController";
import { startLeaseAssessment } from "../agreement-intelligence/assessmentController";
import { convertDocToPdf } from "../../services/docxConverter";
import { callGemini, cleanJsonResponse } from "../agreement-intelligence/geminiService";
import { performOCR } from "../../services/ocrService";

function normalizeLinkedPeriods(parsedJson: any) {
  if (parsedJson.leasePeriod) {
    if (!parsedJson.leaseWorkingPeriod) {
      parsedJson.leaseWorkingPeriod = parsedJson.leasePeriod;
    }
    if (!parsedJson.lockingPeriod) {
      parsedJson.lockingPeriod = parsedJson.leaseWorkingPeriod;
    }
  } else {
    if (parsedJson.leaseWorkingPeriod && !parsedJson.lockingPeriod) {
      parsedJson.lockingPeriod = parsedJson.leaseWorkingPeriod;
    } else if (parsedJson.lockingPeriod && !parsedJson.leaseWorkingPeriod) {
      parsedJson.leaseWorkingPeriod = parsedJson.lockingPeriod;
    }
  }
}

// Supported MIME types for upload
const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// 1. Export helper to call Gemini to extract financial data fields from text (Pass 1 + Pass 2)
export async function performFinancialExtractionDirect(
  processedText: string,
  geminiApiKey: string,
  geminiModel: string,
): Promise<any> {
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
        - ESCALATION CLASSIFICATION & NON-CONVERSION RULES:
          - Both Systematic Escalation and Adhoc Escalation CAN coexist in an agreement if the agreement explicitly specifies both percentage-based increases and separate adhoc fixed step amounts.
          - STRICT NON-CONVERSION RULE: You MUST NOT convert a systematic percentage escalation into ad-hoc escalations. If an agreement specifies a percentage escalation rule (e.g. 5% annual increase), extract it ONLY under "systematicEscalations". Do NOT calculate or copy the resulting scheduled/illustrative yearly rent amounts into "adhocEscalations".
          - "adhocEscalations" should ONLY be extracted when specific fixed rupee step amounts are explicitly defined in the agreement without a percentage rule.
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
    - CRITICAL FOR adhocEscalations: The "amount" field MUST be the TOTAL fixed monthly/periodic rental amount for that date range (e.g., 425000), NOT the incremental difference/increase (e.g., NOT 50000). Base rent for the initial period (e.g., 375000) is stored in "rentAmount" and should NOT be included in "adhocEscalations".
    - STRICT NON-CONVERSION RULE FOR ESCALATIONS: Systematic Escalation and Adhoc Escalation must be extracted faithfully based on the agreement. Do NOT convert systematic percentage escalations into ad-hoc escalations (i.e. do NOT populate "adhocEscalations" with scheduled breakdown amounts calculated from a systematic percentage escalation). Extract "adhocEscalations" ONLY for explicit fixed step amounts specified without a percentage rule. Both fields can coexist ONLY if the agreement explicitly specifies both percentage escalations and separate fixed step amounts.
    - For rentFreePeriods, the percentage is typically 100 unless a partial waiver is specified.
    - Estimate a confidence score between 0.0 and 1.0 representing your certainty of the extraction accuracy.
    
    Lease Analysis:
    {{LEASE_ANALYSIS}}

    Original Lease Document Text:
    ${processedText}

    Respond strictly with the raw JSON. Do not include any explanation, markdown formatting, comments, or extra text.
  `;

  const { text: leaseAnalysis } = await callGemini(
    geminiApiKey,
    geminiModel,
    analysisPrompt,
  );
  const { text: responseText } = await callGemini(
    geminiApiKey,
    geminiModel,
    schemaPrompt.replace("{{LEASE_ANALYSIS}}", leaseAnalysis),
    true,
  );

  const parsedJson = JSON.parse(cleanJsonResponse(responseText));
  normalizeLinkedPeriods(parsedJson);

  const confidence =
    typeof parsedJson.confidence === "number" ? parsedJson.confidence : 1.0;
  parsedJson.requiresManualReview = confidence < 0.7;
  parsedJson.rawText = processedText;

  return parsedJson;
}

// 2. Main upload controller: extracts text and runs first-pass assessment (instead of financial extraction)
export const extractPdfController = async (req: Request, res: Response) => {
  const requestStartTime = performance.now();
  let convertedPdfPath = "";
  let ocrMetrics: any = null;
  let pdfParseDurationMs = 0;
  let aiAssessmentDurationMs = 0;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const fileMime = req.file.mimetype;
    const fileExt =
      req.file.originalname?.split(".").pop()?.toLowerCase() || "";
    const isValidMime = SUPPORTED_MIME_TYPES.includes(fileMime);
    const isValidExt = ["pdf", "doc", "docx"].includes(fileExt);

    if (!isValidMime && !isValidExt) {
      return res.status(400).json({
        error:
          "Unsupported file type. Please upload a PDF or Word document (.pdf, .doc, .docx).",
      });
    }

    const MAX_SIZE = 100 * 1024 * 1024;
    if (req.file.size > MAX_SIZE) {
      return res.status(400).json({ error: "File exceeds 100MB limit" });
    }

    const trackingId = req.body.trackingId;
    const isPdf = fileMime === "application/pdf" || fileExt === "pdf";

    if (!isPdf) {
      if (trackingId) {
        emitProgress(trackingId, {
          stage: "quality_check",
          percentage: 15,
          message: "Pre-processing and converting Word document to PDF...",
        });
      }
      try {
        convertedPdfPath = await convertDocToPdf(req.file.path, fileExt);
        console.log("[Converter] Converted file successfully to:", convertedPdfPath);

        // Keep a copy of the converted PDF for reference in non-production environments
        if (process.env.NODE_ENV !== "production") {
          const debugPdfPath = path.join(path.dirname(req.file.path), `${req.file.originalname}.converted.pdf`);
          try {
            fs.copyFileSync(convertedPdfPath, debugPdfPath);
            console.log(`[Debug] Converted PDF saved for reference at: ${debugPdfPath}`);
          } catch (err) {
            console.error("Failed to save debug copy of converted PDF:", err);
          }
        }
      } catch (wordErr: any) {
        throw new Error(
          `Failed to pre-process Word document: ${wordErr.message}`,
        );
      }
    }

    const targetFilePath = isPdf ? req.file.path : convertedPdfPath;
    const fileBuffer = fs.readFileSync(targetFilePath);

    if (trackingId) {
      emitProgress(trackingId, {
        stage: "extracting",
        percentage: 20,
        message: "Extracting text from document...",
      });
    }

    let extractedText = "";
    let pdfData;
    let parser;
    const pdfParseStartTime = performance.now();
    try {
      const { PDFParse } = await import("pdf-parse");
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
    pdfParseDurationMs = Math.round(performance.now() - pdfParseStartTime);

    extractedText = pdfData.text || "";

    const numPages = pdfData.total || 1;
    const avgCharsPerPage = extractedText.trim().length / numPages;

    if (extractedText.trim().length < 1500 || avgCharsPerPage < 500) {
      console.log(
        `Extracted text density is low (Total: ${extractedText.trim().length}, Avg: ${Math.round(
          avgCharsPerPage,
        )} chars/page). Triggering OCR...`,
      );
      if (trackingId) {
        emitProgress(trackingId, {
          stage: "quality_check",
          percentage: 30,
          message: "Scanned layout detected. Starting OCR...",
        });
      }
      const ocrResult = await performOCR(targetFilePath, trackingId);
      extractedText = ocrResult.text;
      ocrMetrics = ocrResult.timing;
    } else {
      if (trackingId) {
        emitProgress(trackingId, {
          stage: "quality_check",
          percentage: 30,
          message: "Text detected successfully.",
        });
      }
    }

    if (!extractedText.trim()) {
      throw new Error("No text content could be extracted from this document.");
    }

    try {
      const debugFilePath = path.join(process.cwd(), "extracted_text_debug.txt");
      fs.writeFileSync(debugFilePath, extractedText, "utf8");
      console.log(`[Debug] Extracted text successfully saved to: ${debugFilePath}`);
    } catch (writeErr) {
      console.error("[Debug] Failed to write extracted text to debug file:", writeErr);
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    if (trackingId) {
      emitProgress(trackingId, {
        stage: "ai-analysis",
        percentage: 70,
        message: "Performing Lease Assessment...",
      });
    }

    // Run first-pass qualitative Lease Assessment
    const aiStartTime = performance.now();
    const assessment = await startLeaseAssessment(
      req.file.originalname,
      extractedText,
      geminiApiKey,
      geminiModel,
    );
    aiAssessmentDurationMs = Math.round(performance.now() - aiStartTime);

    // Calculate total end-to-end duration
    const totalRequestDurationMs = Math.round(performance.now() - requestStartTime);

    // If there is a warning (e.g. legacy doc), append it to assessment response
    const assessmentObj: any = assessment.toObject ? assessment.toObject() : assessment;
    if (fileExt === "doc") {
      assessmentObj.warning = "Legacy DOC files may lose formatting. For best accuracy, please upload DOCX or PDF.";
    }

    // Attach structured timing breakdown
    assessmentObj.timing = {
      totalTimeMs: totalRequestDurationMs,
      totalTimeFormatted: `${(totalRequestDurationMs / 1000).toFixed(2)}s`,
      pdfParseTimeMs: pdfParseDurationMs,
      ocr: ocrMetrics,
      aiAssessmentTimeMs: aiAssessmentDurationMs,
    };

    console.log("========================================================================");
    console.log(`[Agreement Intelligence Timing Breakdown] for: ${req.file.originalname}`);
    console.log(`• Total Processing Time : ${(totalRequestDurationMs / 1000).toFixed(2)}s (${totalRequestDurationMs}ms)`);
    console.log(`• PDF Text Extraction   : ${pdfParseDurationMs}ms`);
    if (ocrMetrics) {
      console.log(
        `• OCR Check Time        : ${(ocrMetrics.totalOcrTimeMs / 1000).toFixed(2)}s (${ocrMetrics.pagesCount} pages, avg ${ocrMetrics.avgTimePerPageMs}ms/page)`
      );
      console.log(`  - Page Rendering      : ${ocrMetrics.pdfRenderTimeMs}ms`);
      console.log(`  - OSD Angle Detection : ${ocrMetrics.osdTimeMs}ms (detected: ${ocrMetrics.detectedAngle}°)`);
      console.log(`  - OCR Engine (${ocrMetrics.engineUsed}): ${ocrMetrics.ocrEngineTimeMs}ms`);
    } else {
      console.log(`• OCR Check Time        : Skipped (Digital PDF)`);
    }
    console.log(`• Gemini AI Assessment  : ${(aiAssessmentDurationMs / 1000).toFixed(2)}s (${aiAssessmentDurationMs}ms)`);
    console.log("========================================================================");

    if (trackingId) {
      emitProgress(trackingId, {
        stage: "complete",
        percentage: 100,
        message: `Assessment completed in ${(totalRequestDurationMs / 1000).toFixed(1)}s.`,
        timing: assessmentObj.timing,
      });
    }

    return res.status(200).json(assessmentObj);
  } catch (error: any) {
    console.error("Error extracting lease data from document:", error);
    return res.status(500).json({
      error: "Error processing the document. Please check backend logs.",
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
    if (convertedPdfPath && fs.existsSync(convertedPdfPath)) {
      try {
        fs.unlinkSync(convertedPdfPath);
        console.log("Successfully cleaned up converted PDF:", convertedPdfPath);
      } catch (cleanupErr) {
        console.error("Failed to clean up converted PDF:", cleanupErr);
      }
    }
  }
};

