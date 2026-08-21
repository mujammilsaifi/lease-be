import fs from "fs";
import { rotateImage } from "./ocr/imageUtils";
import { detectDocumentOrientation, runTesseractFallback } from "./ocr/tesseractOcrService";
import { runPaddleOCR } from "./ocr/paddleOcrService";
import { emitProgress } from "../controllers/lease-controllers/extractProgressController";

export { rotateImage };

/**
 * Clean, high-performance OCR Orchestrator Pipeline.
 * 1. Renders PDF pages into image buffers.
 * 2. Performs OSD orientation detection & canvas pre-rotation alignment.
 * 3. Primary Engine: PaddleOCR (PP-StructureV3 / HTTP / Python).
 * 4. Fallback Engine: Tesseract.js (with per-page low-confidence orientation retry).
 */
export async function performOCR(filePath: string, trackingId?: string): Promise<string> {
  console.log("[OCR Orchestrator] Starting processing for:", filePath);

  const { PDFParse } = await import("pdf-parse");
  const fileBuffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: fileBuffer });

  let rawBuffers: Buffer[] = [];
  try {
    const screenshots = await parser.getScreenshot({ scale: 2.0, imageBuffer: true });
    if (!screenshots.pages || screenshots.pages.length === 0) {
      throw new Error("No pages could be rendered from PDF.");
    }
    rawBuffers = screenshots.pages.map((p) => Buffer.from(p.data));
  } finally {
    try {
      await parser.destroy();
    } catch {}
  }

  // Step 1: Document OSD Orientation Detection
  if (trackingId) {
    emitProgress(trackingId, { stage: "ocr", percentage: 20, message: "Checking document orientation..." });
  }
  const detectedAngle = await detectDocumentOrientation(rawBuffers[0]);

  // Step 2: Pre-Rotate Page Image Buffers according to detected angle
  const processedBuffers: Buffer[] = [];
  for (const buffer of rawBuffers) {
    const rotated = detectedAngle !== 0 ? await rotateImage(buffer, detectedAngle) : buffer;
    processedBuffers.push(rotated);
  }

  // Step 3: PRIMARY ATTEMPT - PaddleOCR
  try {
    if (trackingId) {
      emitProgress(trackingId, { stage: "ocr", percentage: 30, message: "Running primary OCR engine (PaddleOCR)..." });
    }
    const paddleText = await runPaddleOCR(processedBuffers, trackingId);
    if (paddleText && paddleText.trim().length > 0) {
      console.log("✅ [OCR Orchestrator] Primary PaddleOCR engine completed successfully.");
      if (trackingId) {
        emitProgress(trackingId, { stage: "ocr", percentage: 65, message: "PaddleOCR extraction complete." });
      }
      return paddleText;
    }
  } catch (paddleErr: any) {
    console.warn(`⚠️ [OCR Orchestrator Warning] PaddleOCR engine failed/unavailable: ${paddleErr.message}`);
  }

  // Step 4: FALLBACK ATTEMPT - Tesseract.js
  console.log("[OCR Orchestrator Fallback] Executing Tesseract.js fallback OCR...");
  const tesseractText = await runTesseractFallback(processedBuffers, rawBuffers, detectedAngle, trackingId);
  console.log("✅ [OCR Orchestrator] Tesseract.js fallback OCR completed successfully.");

  return tesseractText;
}
