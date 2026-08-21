import { emitProgress } from "../../controllers/lease-controllers/extractProgressController";

/**
 * Runs PaddleOCR via HTTP microservice (PADDLE_OCR_URL).
 * Emits live per-page extraction progress when trackingId is provided.
 * Throws an Error if PaddleOCR is unconfigured, unreachable, or fails,
 * triggering automatic Tesseract fallback in the caller.
 */
export async function runPaddleOCR(imageBuffers: Buffer[], trackingId?: string): Promise<string> {
  const ocrUrl = process.env.PADDLE_OCR_URL;

  if (!ocrUrl) {
    throw new Error("PADDLE_OCR_URL is not configured in environment variables");
  }

  const totalPages = imageBuffers.length;
  console.log(`[PaddleOCR] Requesting HTTP endpoint: ${ocrUrl} for ${totalPages} page(s)...`);
  const pageTexts: string[] = [];

  for (let i = 0; i < totalPages; i++) {
    const pageNum = i + 1;
    const pageBuffer = imageBuffers[i];

    if (trackingId) {
      const percentage = 30 + Math.floor((pageNum / totalPages) * 35);
      emitProgress(trackingId, {
        stage: "ocr",
        percentage,
        message: `PaddleOCR page ${pageNum}/${totalPages}...`,
        currentPage: pageNum,
        totalPages: totalPages,
      });
    }

    const payload = { images: [pageBuffer.toString("base64")] };

    const response = await fetch(ocrUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000), // 3 minutes timeout for page OCR
    });

    if (!response.ok) {
      throw new Error(`Page ${pageNum} HTTP status ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as { text?: string; results?: string[] };
    const pageText = data.text || (data.results ? data.results.join("\n") : "");

    pageTexts.push(pageText);
  }

  const resultText = pageTexts.join("\n\n--- PAGE BREAK ---\n\n");

  if (resultText && resultText.trim().length > 0) {
    console.log(`[PaddleOCR] HTTP extraction successful (${resultText.length} chars across ${totalPages} pages).`);
    return resultText;
  }

  throw new Error("HTTP service returned empty text response");
}


