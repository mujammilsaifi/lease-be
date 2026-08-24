import fs from "fs";
import { optimizeImageForOcr, rotateImage } from "./ocr/imageUtils";
import { detectDocumentOrientation, runTesseractFallback } from "./ocr/tesseractOcrService";
import { runPaddleOCR, PaddleOcrResult } from "./ocr/paddleOcrService";
import { emitProgress } from "../controllers/lease-controllers/extractProgressController";

export { rotateImage, optimizeImageForOcr };

export interface OcrTimingMetrics {
  pdfRenderTimeMs: number;
  osdTimeMs: number;
  imagePrepTimeMs: number;
  ocrEngineTimeMs: number;
  totalOcrTimeMs: number;
  pagesCount: number;
  avgTimePerPageMs: number;
  engineUsed: "paddleocr" | "tesseract";
  detectedAngle: number;
}

export interface OcrResult {
  text: string;
  timing: OcrTimingMetrics;
}

/**
 * Clean, high-performance OCR Orchestrator Pipeline with timing metrics.
 * 1. Renders PDF pages into image buffers.
 * 2. Performs OSD orientation detection & canvas pre-rotation alignment.
 * 3. Primary Engine: PaddleOCR (PP-StructureV3 / Batch HTTP / Python).
 * 4. Fallback Engine: Tesseract.js (with per-page low-confidence orientation retry).
 */
export async function performOCR(filePath: string, trackingId?: string): Promise<OcrResult> {
  const ocrStartTime = performance.now();
  console.log(`[OCR Orchestrator] Starting processing for: ${filePath}`);

  // Step 1: Render PDF pages to images
  const renderStartTime = performance.now();
  const { PDFParse } = await import("pdf-parse");
  const fileBuffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: fileBuffer });

  let rawBuffers: Buffer[] = [];
  try {
    const screenshots = await parser.getScreenshot({ scale: 1.5, imageBuffer: true });
    if (!screenshots.pages || screenshots.pages.length === 0) {
      throw new Error("No pages could be rendered from PDF.");
    }
    rawBuffers = screenshots.pages.map((p) => Buffer.from(p.data));
  } finally {
    try {
      await parser.destroy();
    } catch {}
  }
  const pdfRenderTimeMs = Math.round(performance.now() - renderStartTime);
  console.log(`[OCR Orchestrator] Rendered ${rawBuffers.length} page(s) at 1.5x scale in ${pdfRenderTimeMs}ms.`);

  // Step 2: Document OSD Orientation Detection
  const osdStartTime = performance.now();
  if (trackingId) {
    emitProgress(trackingId, { stage: "ocr", percentage: 20, message: "Checking document orientation..." });
  }
  const detectedAngle = await detectDocumentOrientation(rawBuffers[0]);
  const osdTimeMs = Math.round(performance.now() - osdStartTime);
  console.log(`[OCR Orchestrator] OSD Orientation angle=${detectedAngle}° determined in ${osdTimeMs}ms.`);

  // Step 3: Optimize and Pre-Rotate Page Image Buffers
  const prepStartTime = performance.now();
  const processedBuffers: Buffer[] = [];
  for (const buffer of rawBuffers) {
    const optimized = await optimizeImageForOcr(buffer, detectedAngle);
    processedBuffers.push(optimized);
  }
  const imagePrepTimeMs = Math.round(performance.now() - prepStartTime);

  // Step 4: PRIMARY ATTEMPT - PaddleOCR (Batch Mode)
  let engineUsed: "paddleocr" | "tesseract" = "paddleocr";
  let ocrEngineTimeMs = 0;
  let ocrText = "";

  try {
    if (trackingId) {
      emitProgress(trackingId, { stage: "ocr", percentage: 30, message: "Running primary OCR engine (PaddleOCR)..." });
    }
    const engineStart = performance.now();
    // Pre-rotated images can skip redundant angle cls
    const paddleResult: PaddleOcrResult = await runPaddleOCR(processedBuffers, trackingId, false);
    ocrEngineTimeMs = Math.round(performance.now() - engineStart);

    if (paddleResult.text && paddleResult.text.trim().length > 0) {
      console.log(`✅ [OCR Orchestrator] Primary PaddleOCR completed in ${ocrEngineTimeMs}ms.`);
      if (trackingId) {
        emitProgress(trackingId, { stage: "ocr", percentage: 65, message: "PaddleOCR extraction complete." });
      }
      ocrText = paddleResult.text;
    }
  } catch (paddleErr: any) {
    console.warn(`⚠️ [OCR Orchestrator Warning] PaddleOCR failed or unreachable (${paddleErr.message}). Falling back to Tesseract.js...`);
  }

  // Step 5: FALLBACK ATTEMPT - Tesseract.js (if PaddleOCR failed or gave empty text)
  if (!ocrText || ocrText.trim().length === 0) {
    engineUsed = "tesseract";
    const tesseractStart = performance.now();
    console.log("[OCR Orchestrator Fallback] Executing Tesseract.js fallback OCR...");
    ocrText = await runTesseractFallback(processedBuffers, rawBuffers, detectedAngle, trackingId);
    ocrEngineTimeMs = Math.round(performance.now() - tesseractStart);
    console.log(`✅ [OCR Orchestrator] Tesseract.js fallback completed in ${ocrEngineTimeMs}ms.`);
  }

  const totalOcrTimeMs = Math.round(performance.now() - ocrStartTime);
  const avgTimePerPageMs = Math.round(totalOcrTimeMs / Math.max(1, rawBuffers.length));

  const timing: OcrTimingMetrics = {
    pdfRenderTimeMs,
    osdTimeMs,
    imagePrepTimeMs,
    ocrEngineTimeMs,
    totalOcrTimeMs,
    pagesCount: rawBuffers.length,
    avgTimePerPageMs,
    engineUsed,
    detectedAngle,
  };

  console.log(
    `[OCR Timing Summary] Total OCR: ${totalOcrTimeMs}ms (${(totalOcrTimeMs / 1000).toFixed(2)}s) | Pages: ${rawBuffers.length} | Avg: ${avgTimePerPageMs}ms/page | Engine: ${engineUsed}`
  );

  return {
    text: ocrText,
    timing,
  };
}

