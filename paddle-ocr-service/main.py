import base64
import io
import os
import time
import logging
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image
import numpy as np
from paddleocr import PaddleOCR

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("paddleocr-service")

app = FastAPI(
    title="PaddleOCR Service",
    description="FastAPI Microservice for PaddleOCR & PP-StructureV3 Text Extraction",
    version="1.0.0"
)

# Determine optimal OpenMP CPU threads
num_cpu_threads = max(4, os.cpu_count() or 4)

# Initialize PaddleOCR engine with vectorized batch recognition (rec_batch_num=30) and multi-threading
logger.info(f"Initializing PaddleOCR engine (rec_batch_num=30, CPU threads={num_cpu_threads})...")
ocr_engine = PaddleOCR(
    use_angle_cls=False,
    lang="en",
    enable_mkldnn=False,  # Disabled to prevent Windows ONEDNN memory descriptor collisions
    cpu_threads=num_cpu_threads,
    rec_batch_num=30,
    show_log=False
)
logger.info("PaddleOCR engine initialized successfully.")


class OCRRequest(BaseModel):
    images: List[str]  # Array of base64-encoded image strings
    use_angle_cls: Optional[bool] = False  # Skip redundant angle cls if document is already pre-oriented


class OCRResponse(BaseModel):
    status: str
    text: str
    pages_count: int
    total_time_ms: Optional[float] = None
    avg_time_per_page_ms: Optional[float] = None


@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "paddleocr-service"}


@app.post("/ocr", response_model=OCRResponse)
async def process_ocr(request: OCRRequest):
    if not request.images:
        raise HTTPException(status_code=400, detail="No base64 images provided.")

    t_batch_start = time.perf_counter()
    num_pages = len(request.images)
    logger.info(f"[OCR Start] Processing {num_pages} page(s) (angle_cls={request.use_angle_cls}, rec_batch_num=30)...")

    extracted_pages: List[str] = []

    for idx, base64_str in enumerate(request.images):
        t_page_start = time.perf_counter()
        try:
            # Strip data URI header if present
            if "," in base64_str:
                base64_str = base64_str.split(",", 1)[1]

            image_bytes = base64.b64decode(base64_str)
            pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            np_img = np.array(pil_img)

            # Run PaddleOCR with vectorized batch recognition
            result = ocr_engine.ocr(np_img, cls=bool(request.use_angle_cls))

            page_lines: List[str] = []
            if result:
                for res in result:
                    if not res:
                        continue
                    if isinstance(res, dict):
                        texts = res.get("rec_texts") or res.get("rec_text") or []
                        if isinstance(texts, list):
                            page_lines.extend([str(t).strip() for t in texts if t and str(t).strip()])
                        elif isinstance(texts, str) and texts.strip():
                            page_lines.append(texts.strip())
                    elif isinstance(res, list):
                        for line in res:
                            if isinstance(line, dict):
                                t = line.get("text") or line.get("rec_text")
                                if t and str(t).strip():
                                    page_lines.append(str(t).strip())
                            elif isinstance(line, (list, tuple)) and len(line) >= 2:
                                if isinstance(line[1], (list, tuple)) and len(line[1]) > 0:
                                    t = line[1][0]
                                    if t and str(t).strip():
                                        page_lines.append(str(t).strip())
                                elif isinstance(line[1], str) and line[1].strip():
                                    page_lines.append(line[1].strip())

            page_text = "\n".join(page_lines)
            extracted_pages.append(page_text)
            page_duration_ms = round((time.perf_counter() - t_page_start) * 1000, 2)
            logger.info(f"Page {idx + 1}/{num_pages} finished in {page_duration_ms}ms ({len(page_lines)} lines extracted).")

        except Exception as e:
            logger.error(f"Error processing page {idx + 1}: {str(e)}")
            extracted_pages.append("")

    total_time_ms = round((time.perf_counter() - t_batch_start) * 1000, 2)
    avg_time_per_page = round(total_time_ms / max(1, num_pages), 2)
    logger.info(f"[OCR Complete] {num_pages} page(s) finished in {total_time_ms}ms (avg {avg_time_per_page}ms/page).")

    full_text = "\n\n--- PAGE BREAK ---\n\n".join(extracted_pages)

    return OCRResponse(
        status="success",
        text=full_text,
        pages_count=num_pages,
        total_time_ms=total_time_ms,
        avg_time_per_page_ms=avg_time_per_page
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    logger.info(f"Starting PaddleOCR FastAPI server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)



