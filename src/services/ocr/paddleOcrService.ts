import { emitProgress } from "../../controllers/lease-controllers/extractProgressController";

export interface PaddleOcrResult {
  text: string;
  totalTimeMs: number;
  avgTimePerPageMs: number;
  pagesCount: number;
}

/**
 * Runs PaddleOCR via HTTP microservice (PADDLE_OCR_URL).
 * Emits live extraction progress when trackingId is provided.
 * Uses batch requests for high-performance extraction and tracks timing metrics.
 * Throws an Error if PaddleOCR is unconfigured, unreachable, or fails,
 * triggering automatic Tesseract fallback in the caller.
 */
export async function runPaddleOCR(
  imageBuffers: Buffer[],
  trackingId?: string,
  useAngleCls: boolean = false
): Promise<PaddleOcrResult> {
  const ocrUrl = process.env.PADDLE_OCR_URL;

  if (!ocrUrl) {
    throw new Error("PADDLE_OCR_URL is not configured in environment variables");
  }

  const totalPages = imageBuffers.length;
  const startTime = performance.now();
  console.log(`[PaddleOCR] Starting batch request to ${ocrUrl} for ${totalPages} page(s)...`);

  if (trackingId) {
    emitProgress(trackingId, {
      stage: "ocr",
      percentage: 35,
      message: `Running PaddleOCR engine (${totalPages} page${totalPages > 1 ? "s" : ""})...`,
      currentPage: 1,
      totalPages: totalPages,
    });
  }

  // Convert buffers to base64
  const base64Images = imageBuffers.map((buf) => buf.toString("base64"));

  const payload = {
    images: base64Images,
    use_angle_cls: useAngleCls,
  };

  const response = await fetch(ocrUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(300000), // 5 minutes timeout for entire document
  });

  if (!response.ok) {
    throw new Error(`PaddleOCR HTTP status ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    text?: string;
    results?: string[];
    total_time_ms?: number;
    avg_time_per_page_ms?: number;
    pages_count?: number;
  };

  const resultText = data.text || (data.results ? data.results.join("\n") : "");
  const durationMs = Math.round(performance.now() - startTime);
  const avgTimePerPage = Math.round(durationMs / Math.max(1, totalPages));

  if (resultText && resultText.trim().length > 0) {
    console.log(
      `✅ [PaddleOCR Complete] Extracted ${resultText.length} chars across ${totalPages} page(s) in ${durationMs}ms (avg ${avgTimePerPage}ms/page).`
    );

    if (trackingId) {
      emitProgress(trackingId, {
        stage: "ocr",
        percentage: 65,
        message: `PaddleOCR extraction complete (${totalPages} pages in ${(durationMs / 1000).toFixed(1)}s).`,
        currentPage: totalPages,
        totalPages: totalPages,
      });
    }

    return {
      text: resultText,
      totalTimeMs: durationMs,
      avgTimePerPageMs: avgTimePerPage,
      pagesCount: totalPages,
    };
  }

  throw new Error("HTTP service returned empty text response");
}



