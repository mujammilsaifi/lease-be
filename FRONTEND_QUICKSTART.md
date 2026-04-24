# Frontend Integration Quick Start

## 🚀 Quick Start (10 minutes)

### 1. Install Dependencies

```bash
npm install axios
# or
npm install fetch
```

### 2. Create API Client

```typescript
// api/leaseClient.ts
import axios from "axios";

const API_BASE =
  process.env.REACT_APP_API_URL || "http://localhost:3000/api/v1";

const getToken = () => localStorage.getItem("authToken");

const leaseAPI = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add token to all requests
leaseAPI.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors
leaseAPI.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("authToken");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default leaseAPI;
```

### 3. Create Lease Hooks

```typescript
// hooks/useLeases.ts
import { useState, useCallback } from "react";
import leaseAPI from "../api/leaseClient";

export function useLeases() {
  const [leases, setLeases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async (locationId = null) => {
    try {
      setLoading(true);
      const params = locationId ? { locationId } : {};
      const { data } = await leaseAPI.get("/lease", { params });
      setLeases(data.leases);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(
    async (leaseData) => {
      try {
        const { data } = await leaseAPI.post("/lease", [leaseData]);
        await fetch();
        return data;
      } catch (err) {
        setError(err.response?.data?.error || err.message);
        throw err;
      }
    },
    [fetch],
  );

  const update = useCallback(async (leaseId, updates) => {
    try {
      const { data } = await leaseAPI.put(`/lease/${leaseId}`, updates);
      setLeases((prev) =>
        prev.map((group) =>
          group.activeLease._id === leaseId
            ? { ...group, activeLease: data.data }
            : group,
        ),
      );
      return data;
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      throw err;
    }
  }, []);

  const modify = useCallback(
    async (leaseId, changes) => {
      try {
        const { data } = await leaseAPI.put(
          `/lease-modification/${leaseId}`,
          changes,
        );
        await fetch();
        return data;
      } catch (err) {
        setError(err.response?.data?.error || err.message);
        throw err;
      }
    },
    [fetch],
  );

  const delete_ = useCallback(
    async (leaseId) => {
      try {
        await leaseAPI.delete(`/lease/${leaseId}`);
        await fetch();
      } catch (err) {
        setError(err.response?.data?.error || err.message);
        throw err;
      }
    },
    [fetch],
  );

  return {
    leases,
    loading,
    error,
    fetch,
    create,
    update,
    modify,
    delete: delete_,
  };
}
```

### 4. Use in Component

```typescript
// components/LeaseList.tsx
import { useEffect } from 'react';
import { useLeases } from '../hooks/useLeases';

export function LeaseList() {
  const { leases, loading, error, fetch } = useLeases();

  useEffect(() => {
    fetch();
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div>
      <h1>Leases</h1>
      {leases.length === 0 ? (
        <p>No leases found</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Lessor Name</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Version</th>
            </tr>
          </thead>
          <tbody>
            {leases.map(group => (
              <tr key={group.activeLease._id}>
                <td>{group.activeLease.lessorName}</td>
                <td>₹{group.activeLease.rentAmount}</td>
                <td>{group.activeLease.status}</td>
                <td>v{group.activeLease.versionNumber}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

---

## 📋 Example API Calls & Responses

### 1. CREATE LEASE

**Request:**

```bash
curl -X POST http://localhost:3000/api/v1/lease \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '[{
    "lessorName": "ABC Property Ltd",
    "natureOfLease": "Commercial",
    "period": "2024-01-01",
    "leasePeriod": ["2024-01-01", "2028-12-31"],
    "lockingPeriod": ["2024-01-01", "2024-03-31"],
    "leaseWorkingPeriod": ["2024-04-01", "2028-12-31"],
    "rentPaymentType": "Fixed",
    "rentPaymentFrequency": "monthly",
    "rentAmount": 100000,
    "rentPaymentDate": 1
  }]'
```

**Response (201):**

```json
{
  "message": "Leases created successfully",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439001",
      "adminId": "507f1f77bcf86cd799439001",
      "locationId": null,
      "originalLeaseId": "507f1f77bcf86cd799439011",
      "versionNumber": 1,
      "status": "active",
      "lessorName": "ABC Property Ltd",
      "natureOfLease": "Commercial",
      "rentAmount": 100000,
      "rentPaymentFrequency": "monthly",
      "leasePeriod": ["2024-01-01", "2028-12-31"],
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

### 2. FETCH LEASES (ADMIN)

**Request:**

```bash
curl -X GET http://localhost:3000/api/v1/lease \
  -H "Authorization: Bearer eyJhbGc..."
```

**Response (200):**

```json
{
  "leases": [
    {
      "activeLease": {
        "_id": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439001",
        "adminId": "507f1f77bcf86cd799439001",
        "lessorName": "ABC Property Ltd",
        "status": "active",
        "versionNumber": 3,
        "rentAmount": 125000,
        "createdAt": "2024-01-15T10:30:00Z",
        "updatedAt": "2024-02-20T14:15:00Z"
      },
      "previousVersions": [
        {
          "_id": "507f1f77bcf86cd799439012",
          "status": "modified",
          "versionNumber": 2,
          "rentAmount": 110000,
          "updatedAt": "2024-02-10T11:00:00Z"
        },
        {
          "_id": "507f1f77bcf86cd799439013",
          "status": "modified",
          "versionNumber": 1,
          "rentAmount": 100000,
          "updatedAt": "2024-01-15T10:30:00Z"
        }
      ]
    }
  ]
}
```

---

### 3. UPDATE LEASE

**Request:**

```bash
curl -X PUT http://localhost:3000/api/v1/lease/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "rentAmount": 120000,
    "rentPaymentFrequency": "quarterly"
  }'
```

**Response (200):**

```json
{
  "message": "Lease updated successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "userId": "507f1f77bcf86cd799439001",
    "lessorName": "ABC Property Ltd",
    "rentAmount": 120000,
    "rentPaymentFrequency": "quarterly",
    "status": "active",
    "versionNumber": 1,
    "updatedAt": "2024-02-25T16:45:00Z"
  }
}
```

---

### 4. CREATE LEASE MODIFICATION (NEW VERSION)

**Request:**

```bash
curl -X PUT http://localhost:3000/api/v1/lease-modification/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "rentAmount": 135000,
    "remarks": "Annual increase - 12.5%"
  }'
```

**Response (201):**

```json
{
  "message": "Lease modification added successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439014",
    "userId": "507f1f77bcf86cd799439001",
    "lessorName": "ABC Property Ltd",
    "rentAmount": 135000,
    "previousVersionId": "507f1f77bcf86cd799439011",
    "originalLeaseId": "507f1f77bcf86cd799439011",
    "versionNumber": 2,
    "status": "active",
    "remarks": "Annual increase - 12.5%",
    "createdAt": "2024-03-01T09:00:00Z"
  }
}
```

---

### 5. DELETE LEASE

**Request:**

```bash
curl -X DELETE http://localhost:3000/api/v1/lease/507f1f77bcf86cd799439014 \
  -H "Authorization: Bearer eyJhbGc..."
```

**Response (200):**

```json
{
  "message": "Lease deleted successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439014",
    "lessorName": "ABC Property Ltd",
    "versionNumber": 2
  },
  "previousVersionReactivated": true
}
```

---

### 6. FETCH AUDIT LOGS

**Request:**

```bash
curl -X GET http://localhost:3000/api/v1/lease/507f1f77bcf86cd799439011/logs \
  -H "Authorization: Bearer eyJhbGc..."
```

**Response (200):**

```json
{
  "logs": [
    {
      "_id": "log-001",
      "entityType": "Lease",
      "entityId": "507f1f77bcf86cd799439011",
      "entityName": "ABC Property Ltd",
      "action": "MODIFIED",
      "performedBy": "507f1f77bcf86cd799439001",
      "changes": {
        "rentAmount": {
          "from": 100000,
          "to": 120000,
          "displayLabel": "Rent Amount"
        },
        "rentPaymentFrequency": {
          "from": "monthly",
          "to": "quarterly",
          "displayLabel": "Rent Payment Frequency"
        }
      },
      "timestamp": "2024-02-25T16:45:00Z"
    },
    {
      "_id": "log-002",
      "entityType": "Lease",
      "entityId": "507f1f77bcf86cd799439011",
      "entityName": "ABC Property Ltd",
      "action": "CREATED",
      "performedBy": "507f1f77bcf86cd799439001",
      "changes": {},
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

## 🔍 Common Error Scenarios

### 1. Authentication Error

```json
{
  "error": "Authentication required"
}

// HTTP 401
```

**Fix:** Ensure token is in localStorage and hasn't expired

### 2. Duplicate Lease Name

```json
{
  "error": "Lease with lessor name \"ABC Property Ltd\" already exists for this user."
}

// HTTP 409
```

**Fix:** Use a different lessor name or check existing leases

### 3. Permission Denied

```json
{
  "error": "Access denied. Insufficient permissions"
}

// HTTP 403
```

**Fix:** Check user role; ensure admin has right to view this lease

### 4. Invalid Lease ID

```json
{
  "error": "Lease not found"
}

// HTTP 404
```

**Fix:** Verify lease ID is correct

### 5. Bad Request

```json
{
  "error": "Validation Error",
  "details": ["lessorName is required", "rentAmount must be a number"]
}

// HTTP 400
```

**Fix:** Check all required fields are present and correctly typed

---

## 📱 React Hook Usage Example

```typescript
// pages/LeaseDashboard.tsx
import { useEffect, useState } from 'react';
import { useLeases } from '../hooks/useLeases';
import { useAuth } from '../hooks/useAuth';
import LeaseForm from '../components/LeaseForm';
import LeaseTable from '../components/LeaseTable';

export function LeaseDashboard() {
  const { user } = useAuth();
  const { leases, loading, error, fetch, create, update, modify, delete: deleteLease } = useLeases();
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetch();
  }, []);

  const handleCreate = async (formData) => {
    try {
      await create(formData);
      setShowForm(false);
    } catch (err) {
      // Error already set in hook
    }
  };

  const handleUpdate = async (leaseId, changes) => {
    try {
      await update(leaseId, changes);
    } catch (err) {
      // Error already set in hook
    }
  };

  const handleModify = async (leaseId, changes) => {
    try {
      await modify(leaseId, changes);
    } catch (err) {
      // Error already set in hook
    }
  };

  const handleDelete = async (leaseId) => {
    if (window.confirm('Are you sure? This will delete the current version.')) {
      try {
        await deleteLease(leaseId);
      } catch (err) {
        // Error already set in hook
      }
    }
  };

  return (
    <div className="lease-dashboard">
      <h1>Lease Management</h1>
      <p>Role: {user?.role}</p>

      {error && <div className="error-banner">{error}</div>}

      <button onClick={() => setShowForm(!showForm)}>
        {showForm ? 'Cancel' : 'Create New Lease'}
      </button>

      {showForm && <LeaseForm onSubmit={handleCreate} />}

      {loading ? (
        <p>Loading leases...</p>
      ) : (
        <LeaseTable
          leases={leases}
          onUpdate={handleUpdate}
          onModify={handleModify}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
```

---

## 🛠️ Debugging Tips

### 1. Check Token in Console

```javascript
console.log(JSON.parse(atob(localStorage.getItem("authToken")?.split(".")[1])));
// Shows: { _id, role, adminId, locationId, email, ... }
```

### 2. Inspect Network Requests

```javascript
// Enable all API logs
localStorage.setItem("DEBUG", "lease-api:*");
```

### 3. Verify Backend Connection

```bash
curl -X GET http://localhost:3000/health
# Should return: { "status": "ok", "dbConnected": true }
```

### 4. Test with Postman

- Import endpoints into Postman collection
- Set environment variables:
  - `{{BASE_URL}}` = http://localhost:3000/api/v1
  - `{{TOKEN}}` = JWT from auth API
- Use Bearer token in Authorization tab

---

## 📚 Next Steps

1. **Set up environment variables** in `.env`:

   ```
   REACT_APP_API_URL=http://localhost:3000/api/v1
   REACT_APP_EXTERNAL_AUTH_URL=https://auth-service.com
   ```

2. **Create lease form** with validation for:

   - Required fields: lessorName, rentAmount, leasePeriod
   - Date validation: start < end dates
   - Number validation: rentAmount > 0

3. **Implement filters**:

   - By status (active, terminated, closed)
   - By location
   - By date range

4. **Add version history viewer**:

   - Compare versions side-by-side
   - Show change timeline
   - Restore previous versions

5. **Set up error boundaries**:
   - Catch network failures
   - Retry logic with exponential backoff
   - User-friendly error messages

---

## 🎓 Key Takeaways

✅ Token contains user info → no local User model needed
✅ Admin sees all leases, User sees own leases
✅ Lease versioning is automatic
✅ Audit logs track all changes
✅ Location-based filtering supported
✅ All operations are non-destructive (previous versions preserved)
