import fs from "fs";
import { optimizeImageForOcr, rotateImage } from "./ocr/imageUtils";
import { detectDocumentOrientation, runTesseractFallback } from "./ocr/tesseractOcrService";
import { runPaddleOCR, runPaddlePdfOCR, PaddleOcrResult } from "./ocr/paddleOcrService";
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
 * 1. Primary Path: Direct PDF PaddleOCR microservice streaming (/ocr/pdf) for maximum throughput.
 * 2. Fallback Path: Local PDF rendering, OSD detection, image prep, and Tesseract.js OCR.
 */
export async function performOCR(filePath: string, trackingId?: string): Promise<OcrResult> {
  const ocrStartTime = performance.now();
  console.log(`[OCR Orchestrator] Starting processing for: ${filePath}`);

  const paddleUrl = process.env.PADDLE_OCR_URL;

  // PRIMARY HIGH-PERFORMANCE ATTEMPT: Direct PDF PaddleOCR
  if (paddleUrl && fs.existsSync(filePath)) {
    try {
      if (trackingId) {
        emitProgress(trackingId, {
          stage: "ocr",
          percentage: 30,
          message: "Running primary OCR engine (PaddleOCR)...",
        });
      }

      const engineStart = performance.now();
      const paddleResult: PaddleOcrResult = await runPaddlePdfOCR(filePath, trackingId, false);
      const ocrEngineTimeMs = Math.round(performance.now() - engineStart);

      if (paddleResult.text && paddleResult.text.trim().length > 0) {
        const totalOcrTimeMs = Math.round(performance.now() - ocrStartTime);
        const timing: OcrTimingMetrics = {
          pdfRenderTimeMs: 0,
          osdTimeMs: 0,
          imagePrepTimeMs: 0,
          ocrEngineTimeMs,
          totalOcrTimeMs,
          pagesCount: paddleResult.pagesCount,
          avgTimePerPageMs: paddleResult.avgTimePerPageMs,
          engineUsed: "paddleocr",
          detectedAngle: 0,
        };

        console.log(`✅ [OCR Orchestrator] Direct PDF PaddleOCR completed in ${totalOcrTimeMs}ms (${paddleResult.pagesCount} pages, avg ${paddleResult.avgTimePerPageMs}ms/page).`);

        if (trackingId) {
          emitProgress(trackingId, {
            stage: "ocr",
            percentage: 65,
            message: `PaddleOCR extraction complete (${paddleResult.pagesCount} pages in ${(totalOcrTimeMs / 1000).toFixed(1)}s).`,
            currentPage: paddleResult.pagesCount,
            totalPages: paddleResult.pagesCount,
          });
        }

        return {
          text: paddleResult.text,
          timing,
        };
      }
    } catch (paddleErr: any) {
      console.warn(
        `⚠️ [OCR Orchestrator Warning] Direct PaddleOCR failed or unreachable (${paddleErr.message}). Initiating fallback pipeline...`
      );
    }
  }

  // FALLBACK PIPELINE: Render PDF pages locally & run Tesseract.js / base64 PaddleOCR
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
  console.log(`[OCR Orchestrator Fallback] Rendered ${rawBuffers.length} page(s) at 1.5x scale in ${pdfRenderTimeMs}ms.`);

  // Step 2: Document OSD Orientation Detection
  const osdStartTime = performance.now();
  if (trackingId) {
    emitProgress(trackingId, { stage: "ocr", percentage: 20, message: "Checking document orientation..." });
  }
  const detectedAngle = await detectDocumentOrientation(rawBuffers[0]);
  const osdTimeMs = Math.round(performance.now() - osdStartTime);
  console.log(`[OCR Orchestrator Fallback] OSD Orientation angle=${detectedAngle}° determined in ${osdTimeMs}ms.`);

  // Step 3: Optimize and Pre-Rotate Page Image Buffers
  const prepStartTime = performance.now();
  const processedBuffers: Buffer[] = [];
  for (const buffer of rawBuffers) {
    const optimized = await optimizeImageForOcr(buffer, detectedAngle);
    processedBuffers.push(optimized);
  }
  const imagePrepTimeMs = Math.round(performance.now() - prepStartTime);

  // Step 4: Try base64 PaddleOCR batch if configured
  let engineUsed: "paddleocr" | "tesseract" = "paddleocr";
  let ocrEngineTimeMs = 0;
  let ocrText = "";

  if (paddleUrl) {
    try {
      const engineStart = performance.now();
      const paddleResult = await runPaddleOCR(processedBuffers, trackingId, false);
      ocrEngineTimeMs = Math.round(performance.now() - engineStart);
      if (paddleResult.text && paddleResult.text.trim().length > 0) {
        ocrText = paddleResult.text;
      }
    } catch (batchErr: any) {
      console.warn(`⚠️ [OCR Orchestrator Warning] Batch PaddleOCR fallback failed (${batchErr.message}).`);
    }
  }

  // Step 5: Tesseract.js Fallback
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


