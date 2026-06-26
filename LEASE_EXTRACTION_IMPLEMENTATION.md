# Lease Agreement Data Extraction & Formatting

## Overview

This module extracts structured lease data from uploaded PDF lease agreements using a hybrid pipeline: **digital text parsing** → **OCR fallback** → **Gemini AI two-pass analysis** → **structured JSON output**.

---

## Pipeline Architecture

```
PDF Upload (multipart/form-data)
        │
        ▼
  ┌──────────────────────────────┐
  │ 1. Validation                │  MIME check (application/pdf)
  │                              │  Size check (< 15MB)
  └──────────┬───────────────────┘
             ▼
  ┌──────────────────────────────┐
  │ 2. Digital Text Extraction   │  pdf-parse
  │                              │
  │    Quality Heuristic:        │  total chars < 1500 OR
  │    avg chars/page < 500      │  avg chars/page < 500
  └──────────┬───────────────────┘
             │
     ┌───────┴───────┐
     ▼               ▼
  (High Quality)  (Low Quality)
     │               │
     │     ┌─────────┴──────────┐
     │     │ 3. OCR (Tesseract) │  tesseract.js
     │     │                     │  pdf-parse screenshots
     │     │  Progress: 20-70%  │  per-page recognition
     │     └─────────┬──────────┘
     │               │
     └───────┬───────┘
             ▼
  ┌──────────────────────────────┐
  │ 4. Pass 1: Legal Analysis    │  Gemini free-form analysis
  │                              │  Parties, asset, dates,
  │   Progress: 70%              │  payments, escalations, etc.
  └──────────┬───────────────────┘
             ▼
  ┌──────────────────────────────┐
  │ 5. Pass 2: Schema Conversion │  Gemini → strict JSON
  │                              │  responseMimeType: app/json
  │   Progress: 90%              │  Indian currency normalization
  └──────────┬───────────────────┘
             ▼
  ┌──────────────────────────────┐
  │ 6. Post-Processing           │  clean markdown fences
  │                              │  normalize linked periods
  │   Progress: 100%             │  confidence assessment
  └──────────┬───────────────────┘
             ▼
      Structured Lease JSON
```

---

## Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/v1/lease/extract-pdf` | Upload PDF → extract data |
| `GET`  | `/api/v1/lease/extract-progress` | SSE stream for real-time progress |
| `POST` | `/api/v1/agreement-intelligence/chat` | Interactive chat to refine extracted data |

---

## Extraction Details

### 1. Digital Text Extraction (`pdf-parse`)
- Extracts native digital text from the PDF
- Computes quality heuristics to detect scanned documents
- **Threshold:** total chars < 1500 OR avg chars/page < 500 → trigger OCR

### 2. OCR Fallback (`tesseract.js`)
- Renders each PDF page to a screenshot image (scale 2.0) via `pdf-parse`
- Processes pages through Tesseract OCR (English)
- Emits per-page progress via SSE (20% → 70%)
- Requires `eng.traineddata` in project root

### 3. Gemini Two-Pass AI Analysis (`gemini-2.5-flash`)

**Pass 1 — Free-form Lease Analysis:**
Extracts under these headings:
- Parties and roles
- Lease asset / nature (categorized: Building, Leasehold land, Warehouse, etc.)
- Date terms (commencement, expiry, tenure, lock-in)
- Payment terms (rent, GST, frequency, due date, totals)
- Escalation clauses (% increases, fixed adhoc amounts)
- Rent-free / fit-out periods
- Discounting rate / IBR
- Security deposit
- Termination / lock-in clauses

**Pass 2 — Schema Conversion:**
- Strict JSON output via `responseMimeType: "application/json"`
- Currency normalization (e.g., `Rs. 4,55,000` → `455000`)
- Date standardization (always `YYYY-MM-DD`)
- Default period relationships (working/lock-in periods default to lease period)
- Rent-free periods default to 100% waiver

### 4. Post-Processing
- Strips markdown code fences from Gemini response
- Fills `leaseWorkingPeriod` / `lockingPeriod` defaults from `leasePeriod`
- Sets `requiresManualReview: true` if `confidence < 0.7`
- Generates `agreementId` as `"AGR-" + Date.now()`
- Attaches `rawText` to response

---

## Output JSON Schema

```json
{
  "lessorName": "string | null",
  "natureOfLease": "Leasehold land | Building | Warehouse | Plant and Machinery | Vehicle | Office Equipments | Computer and Peripherals | Furniture and fixtures | Security Deposit | Other | null",
  "leasePeriod": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "leaseWorkingPeriod": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "lockingPeriod": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "rentPaymentType": "Advance Payment | Arrear Payment | null",
  "rentPaymentFrequency": "monthly | quarterly | semi-annual | annual | null",
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
  "confidence": 0.0,
  "requiresManualReview": false,
  "agreementId": "AGR-<timestamp>",
  "rawText": "full extracted text"
}
```

---

## Real-Time Progress (SSE)

Clients connect to `GET /api/v1/lease/extract-progress?trackingId=<uuid>` to receive progress events:

| Stage | % | Description |
|-------|---|-------------|
| `connected` | 0% | SSE connection established |
| `extracting` | 10% | Digital text extraction |
| `quality_check` | 20% | Checking if OCR needed |
| `ocr` | 20-70% | Per-page OCR progress |
| `ai-analysis` | 70% | Gemini lease analysis |
| `structuring` | 90% | Gemini schema conversion |
| `complete` | 100% | Finished |

---

## Key Files

| File | Purpose |
|------|---------|
| `src/controllers/lease-controllers/pdfExtractionController.ts` | Core extraction pipeline (396 lines) |
| `src/controllers/lease-controllers/extractProgressController.ts` | SSE progress tracking |
| `src/controllers/agreement-intelligence/geminiService.ts` | Shared Gemini API wrapper with cost tracking |
| `src/controllers/agreement-intelligence/chatController.ts` | Interactive chat to refine extracted data |
| `src/controllers/agreement-intelligence/fieldsController.ts` | Field update acknowledgment (placeholder) |
| `src/models/lease.model.ts` | Lease Mongoose schema |
| `src/routes/lease/leaseRoutes.ts` | Route definitions |
| `src/routes/agreement-intelligence/agreementIntelligenceRoutes.ts` | Chat route definitions |
| `src/scripts/test-single-file.ts` | Standalone OCR + Gemini test script |
| `eng.traineddata` | Tesseract English language data |

---

## Configuration

Environment variables (`.env`):

```
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

Multer stores uploaded PDFs temporarily in `uploads/` (cleaned up after processing).

---

## Design Decisions

1. **Two-pass Gemini approach** — First pass does free-form legal analysis; second pass formats into strict JSON. Improves accuracy over a single prompt.
2. **Hybrid text extraction** — Tries digital parsing first, falls back to OCR only for scanned/low-quality PDFs.
3. **Stateless extraction** — Extracted data is returned directly to frontend without persistence. Frontend creates the lease via `POST /api/v1/lease`.
4. **No JWT on extraction routes** — Upload and chat endpoints are unauthenticated (intended for pre-login or public use).
5. **Indian currency handling** — Normalizes `Rs. 4,55,000` (Indian comma format) to numeric `455000`.
