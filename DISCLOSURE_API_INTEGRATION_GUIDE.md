# Lease Disclosure APIs Integration Guide

This guide provides API documentation and code examples for consuming the **Schedule III Disclosure Entities** and **Information Disclosure** backend endpoints.

---

## 1. Overview

**Base URL**: `https://lease-dev-build.finsensor.ai`

Both APIs accept the **Presentation Period** and use the **authenticated user's token** to calculate identical results to the frontend:

| Feature | Endpoint Path | Full URL | Supported Methods |
| :--- | :--- | :--- | :--- |
| **Schedule III Disclosure Entities** | `/api/v1/reports/schedule-iii-disclosure` | `https://lease-dev-build.finsensor.ai/api/v1/reports/schedule-iii-disclosure` | `GET`, `POST` |
| **Information Disclosure (Notes)** | `/api/v1/reports/information-disclosure` | `https://lease-dev-build.finsensor.ai/api/v1/reports/information-disclosure` | `GET`, `POST` |

> **Note**: Alternative alias paths are also available:  
> - `https://lease-dev-build.finsensor.ai/api/v1/lease/schedule-iii-disclosure`  
> - `https://lease-dev-build.finsensor.ai/api/v1/lease/information-disclosure`

---

## 2. Authentication

All requests require a standard Bearer Token in the authorization header:

```http
Authorization: Bearer <JWT_TOKEN>
```

* **Standard Users**: The API automatically scopes queries and account mappings to the authenticated user ID in the token.
* **Admins / Masters / Sub-Admins**: Can optionally supply a `userId` parameter to query on behalf of a specific user or leave it empty to aggregate across all assigned units.

---

## 3. Endpoints Specification

### A. Schedule III Disclosure Entities

#### Request

**POST** `https://lease-dev-build.finsensor.ai/api/v1/reports/schedule-iii-disclosure`  
*(Or relative path: `/api/v1/reports/schedule-iii-disclosure`)*  
**Headers**: `Content-Type: application/json`, `Authorization: Bearer <token>`

```json
{
  "presentationPeriod": {
    "from": "2024-04-01",
    "to": "2025-03-31"
  },
  "userId": "optional_user_id_for_admins"
}
```

*Alternatively via **GET** with query parameters:*  
`GET https://lease-dev-build.finsensor.ai/api/v1/reports/schedule-iii-disclosure?startDate=2024-04-01&endDate=2025-03-31`

**cURL Example:**
```bash
curl -X POST https://lease-dev-build.finsensor.ai/api/v1/reports/schedule-iii-disclosure \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"presentationPeriod":{"from":"2024-04-01","to":"2025-03-31"}}'
```

#### Response Structure

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
        "particular": "ROU Gross Block",
        "coc": "COC Name / Code",
        "gl": "GL Name / Code",
        "cocCode": "1001",
        "glCode": "5001",
        "amount": 171897490.73,
        "color": "#00adef",
        "adjustmentType": "GAAP adjustments",
        "tag": "Rucurring",
        "entryType": "Addition in ROU and Lease Liability",
        "key": "grouped-0"
      }
    ]
  },
  "metadata": {
    "totalLeasesProcessed": 37,
    "cacheHits": 37,
    "cacheMisses": 0,
    "generatedAt": "2026-09-10T14:00:00.000Z"
  }
}
```

* `data.entries`: Standardized accounting entries with valid CoC codes ready for UI table rendering and export.

---

### B. Information Disclosure (Notes Disclosure)

#### Request

**POST** `https://lease-dev-build.finsensor.ai/api/v1/reports/information-disclosure`  
*(Or relative path: `/api/v1/reports/information-disclosure`)*  
**Headers**: `Content-Type: application/json`, `Authorization: Bearer <token>`

```json
{
  "presentationPeriod": {
    "from": "2024-04-01",
    "to": "2025-03-31"
  },
  "userId": "optional_user_id_for_admins"
}
```

*Alternatively via **GET** with query parameters:*  
`GET https://lease-dev-build.finsensor.ai/api/v1/reports/information-disclosure?startDate=2024-04-01&endDate=2025-03-31`

**cURL Example:**
```bash
curl -X POST https://lease-dev-build.finsensor.ai/api/v1/reports/information-disclosure \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"presentationPeriod":{"from":"2024-04-01","to":"2025-03-31"}}'
```

#### Response Structure

```json
{
  "success": true,
  "data": {
    "presentationPeriod": {
      "from": "2024-04-01",
      "to": "2025-03-31",
      "formatted": "01-Apr-2024 to 31-Mar-2025"
    },
    "contractualData": [
      {
        "key": "within1Year",
        "particulars": "Rent paid within 1 year from reporting date",
        "isHeader": true
      },
      {
        "key": "within1Year-0",
        "particulars": " - Building, Vehicle",
        "oiCode": "OI-101",
        "amount": "9,72,08,723",
        "rawAmount": 97208723,
        "isHeader": false
      }
    ],
    "optionsData": [
      {
        "key": "extensionOption",
        "particulars": "Extension Option",
        "isHeader": true
      },
      {
        "key": "extensionOption-0",
        "particulars": " - Building",
        "oiCode": "OI-201",
        "count": 0,
        "isHeader": false
      }
    ],
    "averagePeriodData": [
      {
        "key": "avg-0",
        "nature": "Building",
        "oiCode": "OI-301",
        "avgPeriod": "4.53"
      }
    ],
    "averageRemainingPeriodData": [
      {
        "key": "avg-rem-0",
        "nature": "Building",
        "oiCode": "OI-401",
        "avgRemainingPeriod": "2.67"
      }
    ],
    "interestRateData": [
      {
        "key": "int-0",
        "nature": "Building",
        "oiCode": "OI-501",
        "range": "10.00 - 10.00"
      }
    ]
  },
  "metadata": {
    "totalLeasesProcessed": 37,
    "cacheHits": 37,
    "cacheMisses": 0
  }
}
```

> **Note on OI Code Filtering**:  
> An **OI Code** is mandatory for an item to appear in the Information Disclosure response. Any lease asset type that does not have an active OI code mapped in Account Mapping is excluded from all 5 disclosure sections (`contractualData`, `optionsData`, `averagePeriodData`, `averageRemainingPeriodData`, `interestRateData`).

---

## 4. Frontend Integration Example (React / Axios)

You can consume these APIs directly using your existing Axios instance (configured with `baseURL: "https://lease-dev-build.finsensor.ai"`) without modifying existing calculations:

```typescript
import api from "../utils/axios"; // Axios instance configured with baseURL: "https://lease-dev-build.finsensor.ai" and Bearer token

// 1. Fetch Schedule III Disclosure from Backend
export const fetchScheduleIIIDisclosure = async (startDate: string, endDate: string, userId?: string) => {
  const response = await api.post("/api/v1/reports/schedule-iii-disclosure", {
    presentationPeriod: { from: startDate, to: endDate },
    userId,
  });
  return response.data; // { success: true, data: { entries }, ... }
};

// 2. Fetch Information Disclosure from Backend
export const fetchInformationDisclosure = async (startDate: string, endDate: string, userId?: string) => {
  const response = await api.post("/api/v1/reports/information-disclosure", {
    presentationPeriod: { from: startDate, to: endDate },
    userId,
  });
  return response.data; // { success: true, data: { contractualData, optionsData, ... }, ... }
};
```

### Example Component Integration:

```tsx
import React, { useState } from "react";
import { Button, Table, message } from "antd";
import { fetchScheduleIIIDisclosure } from "./api";

const ScheduleIIIFromBackend = ({ dateRange }: { dateRange: [any, any] }) => {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchScheduleIIIDisclosure(
        dateRange[0].format("YYYY-MM-DD"),
        dateRange[1].format("YYYY-MM-DD")
      );
      if (res.success) {
        setEntries(res.data.entries);
        message.success("Schedule III data loaded from backend!");
      }
    } catch (err: any) {
      message.error(err.message || "Failed to load disclosure");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Button type="primary" onClick={loadData} loading={loading}>
        Load Schedule III from Backend
      </Button>
      <Table dataSource={entries} rowKey="key" pagination={false} />
    </div>
  );
};
```
