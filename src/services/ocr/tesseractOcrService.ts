import { createWorker, PSM } from "tesseract.js";
import { rotateImage } from "./imageUtils";
import { emitProgress } from "../../controllers/lease-controllers/extractProgressController";

/**
 * Detects page orientation (OSD) on the first page image.
 * Returns the correction angle in degrees (0, 90, 180, 270).
 */
export async function detectDocumentOrientation(firstPageBuffer: Buffer): Promise<number> {
  const osdWorker = await createWorker("eng", 1, {
    legacyCore: true,
    legacyLang: true,
  });

  try {
    const { data } = await osdWorker.detect(firstPageBuffer);
    const orientation = data.orientation_degrees;
    const confidence = data.orientation_confidence;

    console.log(`[OSD] Orientation=${orientation}°, Confidence=${confidence}`);
    if (typeof orientation === "number" && (confidence === undefined || confidence === null || confidence > 2)) {
      return (360 - orientation) % 360;
    }
  } catch (err: any) {
    console.error("[OSD Warning] Orientation detection failed, using 0°:", err.message);
  } finally {
    await osdWorker.terminate();
  }
  return 0;
}

/**
 * Executes fallback OCR using Tesseract.js across processed page image buffers.
 */
export async function runTesseractFallback(
  processedBuffers: Buffer[],
  rawPageBuffers: Buffer[],
  detectedAngle: number,
  trackingId?: string,
): Promise<string> {
  console.log(`[Tesseract Fallback] Processing ${processedBuffers.length} page(s)...`);
  const worker = await createWorker("eng");
  await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });

  const ocrTexts: string[] = [];

  try {
    for (let i = 0; i < processedBuffers.length; i++) {
      const pageNum = i + 1;
      let pageBuffer = processedBuffers[i];

      if (trackingId) {
        const percentage = 30 + Math.floor((pageNum / processedBuffers.length) * 35);
        emitProgress(trackingId, {
          stage: "ocr",
          percentage,
          message: `Tesseract OCR (fallback) page ${pageNum}/${processedBuffers.length}...`,
          currentPage: pageNum,
          totalPages: processedBuffers.length,
        });
      }

      let { data: { text, confidence } } = await worker.recognize(pageBuffer);

      // Low confidence retry across candidate angles
      if (confidence < 70) {
        console.log(`[Tesseract Quality] Page ${pageNum} low confidence (${confidence}). Retrying candidate angles...`);
        let bestText = text;
        let bestConfidence = confidence;

        const candidateAngles = [0, 90, 180, 270].filter((a) => a !== detectedAngle);
        for (const angle of candidateAngles) {
          try {
            const retriedBuffer = await rotateImage(rawPageBuffers[i], angle);
            const retryRes = await worker.recognize(retriedBuffer);
            if (retryRes.data.confidence > bestConfidence) {
              bestConfidence = retryRes.data.confidence;
              bestText = retryRes.data.text;
            }
          } catch {}
        }
        text = bestText;
      }

      ocrTexts.push(text);
    }
  } finally {
    await worker.terminate();
  }

  return ocrTexts.join("\n");
}
