# Schedule III Disclosure API Changes & Enhancements

## Overview
This document outlines the modifications made to the Schedule III Disclosure API endpoint (`/api/v1/reports/schedule-iii-disclosure` and `/api/v1/lease/schedule-iii-disclosure`) and the calculation service (`scheduleIIIDisclosureService.ts`).

---

## 1. Exclusion of Entries Without CoC Code
- **Problem**: Previously, accounting rows with missing or empty Chart of Accounts codes (`"cocCode": ""`) were returned in the response payload.
- **Change**: Added filtering to exclude any entry where `cocCode` is empty (`""`), whitespace, or `"-"`.
- **Result**: Only entries mapped to a valid `cocCode` are returned in the response.

---

## 2. Standardized `entryNo` on Every Row
- **Problem**: Previously, `entryNo` was only populated on the first row of each entry group, leaving subsequent rows with empty strings (`""`).
- **Change**: Updated the mapping logic so every object in the `entries` array explicitly carries its entry number (e.g., `"Entry 1"`, `"Entry 2"`, etc.).
- **Result**: Frontend components and consumers can reliably read `entryNo` from any row without relying on stateful row grouping.

---

## 3. Removal of `exportData`
- **Problem**: Both `entries` and `exportData` represented identical accounting rows, resulting in duplicate payload data.
- **Change**: Removed `exportData` from the service calculation and controller response.
- **Result**: The API response payload is approximately 50% smaller and cleaner, containing only `presentationPeriod` and `entries`.

---

## 4. Standardized Amount Formatting
- Amounts are capped and rounded to **2 decimal places** as floating-point numbers (e.g., `96666268.58`, `0`), avoiding floating-point precision anomalies.

---

## 5. Removed Legacy & Redundant Properties
- Removed deprecated fields `revisedNo`, `originalEntryNo`, `sign`, and `columnOfReport` from the output objects.

---

## Response Structure Example

```json
{
  "success": true,
  "data": {
    "presentationPeriod": {
      "from": "2024-04-01",
      "to": "2025-03-31",
      "formatted": "01-Apr-2024 to 31-Mar-2025"
    },
    "entries": [
      {
        "entryNo": "Entry 1",
        "narration": "Addition in Gross Block of ROU and Lease Liability during the period",
        "particular": "Current Lease Liability",
        "coc": "COC Name / Leasehold land",
        "gl": "",
        "cocCode": "Leasehold land",
        "glCode": "",
        "amount": 0,
        "color": "#00adef",
        "adjustmentType": "GAAP adjustments",
        "tag": "Rucurring",
        "entryType": "Addition in ROU and Lease Liability",
        "key": "grouped-0"
      },
      {
        "entryNo": "Entry 1",
        "narration": "Addition in Gross Block of ROU and Lease Liability during the period",
        "particular": "Current Lease Liability",
        "coc": "COC Name / Building",
        "gl": "",
        "cocCode": "Building",
        "glCode": "",
        "amount": -14140077.44,
        "color": "#00adef",
        "adjustmentType": "GAAP adjustments",
        "tag": "Rucurring",
        "entryType": "Addition in ROU and Lease Liability",
        "key": "grouped-1"
      }
    ]
  },
  "metadata": {
    "totalLeasesProcessed": 26,
    "cacheHits": 26,
    "cacheMisses": 0,
    "generatedAt": "2026-09-15T12:34:53.567Z"
  }
}
```

---

## Modified Files
1. `src/services/lease-calculations/scheduleIIIDisclosureService.ts`
2. `src/controllers/lease-controllers/disclosureReportController.ts`
3. `DISCLOSURE_API_INTEGRATION_GUIDE.md`
4. `SCHEDULE_III_DISCLOSURE_CHANGES.md` (new)
