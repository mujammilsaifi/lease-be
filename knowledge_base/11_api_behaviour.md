# API Integration & Behaviour Guidelines

## Endpoints
1. **`/api/v1/lease/extract-pdf` (POST):** Uploads a PDF lease agreement. Performs extraction, quality checks, optional OCR, and Gemini-based two-pass parsing, returning the extracted JSON schema.
2. **`/api/v1/lease/extract-progress` (GET):** Real-time Server-Sent Events (SSE) progress update endpoint.
3. **`/api/v1/agreement-intelligence/chat` (POST):** Accepts `message`, `extractedData`, and `rawText`. Evaluates the query using RAG, fetches relevant accounting knowledge and company rules, sends to Gemini, and returns a natural language response along with a list of `updatedFields` if modifications are requested.

## Chat Response Requirements
The `/api/v1/agreement-intelligence/chat` endpoint must return a JSON response matching exactly this format:
```json
{
  "text": "Your natural language response to the user containing the answer or confirmation.",
  "updatedFields": [
    { "fieldName": "Name of Field", "newValue": "New Value", "status": "CONFIRMED_BY_USER" }
  ]
}
```
