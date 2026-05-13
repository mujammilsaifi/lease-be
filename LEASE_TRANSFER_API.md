# Lease Transfer API (Frontend Guide)

This document explains how to call the lease transfer API from frontend.

## Endpoint

- Method: `POST`
- URL: `/api/v1/lease-transfer/:id`
- Full example: `https://<your-domain>/api/v1/lease-transfer/681f5f4d2a9d4f8c8b7d1234`

## Purpose

Transfers a lease from current user (sender) to another user (receiver).

Backend behavior on transfer:
- Sender lease is frozen as historical:
  - `status = "transferred"`
  - `iuStatus = "IU Transferred"`
  - `transferredToUserId = newUserId`
  - `dateOfIUTransfer = dateOfIUTransfer`
  - `leaseTerminationDate = dateOfIUTransfer`
- Receiver gets a NEW lease chain:
  - Full data is cloned without lease field changes
  - All versions are copied with same `status` and `versionNumber`
  - `userId = newUserId`
  - `iuStatus = "IU Received"`
  - `transferredFromUserId = senderUserId`
  - `dateOfIUReceived = dateOfIUReceived`

## Path Param

- `id` (string, required): sender side active lease document `_id`

## Request Body (Strict)

Use exactly these fields:

```json
{
  "newUserId": "682112ab99d0f4f72a5c1111",
  "dateOfIUTransfer": "2026-05-11",
  "dateOfIUReceived": "2026-05-11"
}
```

Required fields:
- `newUserId` (string, ObjectId)
- `dateOfIUTransfer` (string)
- `dateOfIUReceived` (string)

Notes:
- Use date format `YYYY-MM-DD` for consistency.
- Do not send old optional keys like `receiverUserId` or `transferDate`.

## Fetch Example

```ts
const leaseId = "681f5f4d2a9d4f8c8b7d1234";

const response = await fetch(`/api/v1/lease-transfer/${leaseId}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}` // include if your env requires auth
  },
  body: JSON.stringify({
    newUserId: "682112ab99d0f4f72a5c1111",
    dateOfIUTransfer: "2026-05-11",
    dateOfIUReceived: "2026-05-11"
  })
});

const data = await response.json();
if (!response.ok) {
  throw new Error(data?.error || "Transfer failed");
}
```

## Axios Example

```ts
import axios from "axios";

const leaseId = "681f5f4d2a9d4f8c8b7d1234";

const { data } = await axios.post(
  `/api/v1/lease-transfer/${leaseId}`,
  {
    newUserId: "682112ab99d0f4f72a5c1111",
    dateOfIUTransfer: "2026-05-11",
    dateOfIUReceived: "2026-05-11"
  },
  {
    headers: {
      Authorization: `Bearer ${token}` // include if your env requires auth
    }
  }
);
```

## Success Response

Status: `200 OK`

```json
{
  "message": "Entire lease history transferred successfully"
}
```

## Error Responses

- `400 Bad Request`
  - Missing required fields:
    - `"newUserId, dateOfIUTransfer and dateOfIUReceived are required"`
  - Sender and receiver are same user:
    - `"Sender and receiver cannot be the same user"`
- `404 Not Found`
  - `"Active lease not found"`
- `500 Internal Server Error`
  - `"Transfer failed"`

## Frontend Validation Checklist

- Ensure sender lease id exists before API call.
- Ensure `newUserId` is selected and is not sender user id.
- Ensure `dateOfIUTransfer` is entered.
- Ensure `dateOfIUReceived` is entered.
- Disable submit while request is in progress to avoid duplicate transfer calls.

