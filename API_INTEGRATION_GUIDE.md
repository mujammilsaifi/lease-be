# Lease API Integration Guide

## 📋 Overview

This backend provides REST APIs for lease management with role-based access control:

- **ADMIN** users can view/manage all leases across their organization
- **USER** users can only view/manage their own leases
- **Authentication** is via JWT tokens from external API

---

## 🔐 Authentication Flow

### 1. Login (External API)

- Frontend calls **external user API** to get JWT token
- Token contains claims:
  ```json
  {
    "_id": "user-id-from-external-db",
    "role": "ADMIN" | "USER" | "SUB_ADMIN" | "MASTER",
    "adminId": "admin-id (null only for ADMIN/MASTER — backend uses _id instead)",
    "locationId": "location-id-or-null",
    "email": "user@example.com",
    "fullName": "User Name"
  }
  ```

### 2. Pass Token to Backend APIs

All backend requests must include:

```
Authorization: Bearer <JWT_TOKEN>
```

---

## 📊 Lease Data Model

### Lease Schema Fields

```json
{
  "_id": "ObjectId",
  "userId": "ObjectId (creator's ID from external API)",
  "adminId": "ObjectId (admin-owner's ID, optional)",
  "locationId": "ObjectId (location reference, optional)",
  "lessorName": "string (required)",
  "natureOfLease": "string (required)",
  "status": "active | terminated | closed | modified",
  "period": "string",
  "leasePeriod": ["2024-01-01", "2028-12-31"],
  "rentAmount": 50000,
  "rentPaymentType": "string",
  "rentPaymentFrequency": "monthly",
  "versionNumber": 1,
  "originalLeaseId": "ObjectId (reference to first version)",
  "previousVersionId": "ObjectId (reference to earlier version)",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

---

## 🚀 API Endpoints

### 1. CREATE LEASE

**Endpoint:** `POST /api/v1/lease`

**Description:** Create new lease(s)

**Headers:**

```
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

**Request Body:**

```json
[
  {
    "lessorName": "Property Owner Co.",
    "natureOfLease": "Commercial",
    "period": "2024-01-01",
    "leasePeriod": ["2024-01-01", "2028-12-31"],
    "lockingPeriod": ["2024-01-01", "2024-03-31"],
    "leaseWorkingPeriod": ["2024-04-01", "2028-12-31"],
    "rentPaymentType": "Fixed",
    "rentPaymentFrequency": "monthly",
    "rentAmount": 50000,
    "rentPaymentDate": 1
  }
]
```

**Response (201):**

```json
{
  "message": "Leases created successfully",
  "data": [
    {
      "_id": "lease-123",
      "userId": "user-id-from-token",
      "adminId": "admin-id-from-token",
      "originalLeaseId": "lease-123",
      "versionNumber": 1,
      "status": "active",
      "lessorName": "Property Owner Co.",
      ...otherFields
    }
  ]
}
```

**Backend Logic:**

```typescript
// Token parsed from Authorization header — frontend must NOT send userId or adminId
const user = await getUser(token); // Contains _id, role, adminId

// userId is always the JWT owner
lease.userId = user._id;

// adminId is the group identifier — never null
// Admin: adminId = own _id   →  admin owns and can query all org leases
// User:  adminId = user.adminId  →  ties lease to the admin's org
const isAdmin = ["ADMIN", "MASTER", "SUB_ADMIN"].includes(user.role);
lease.adminId = isAdmin ? user._id : user.adminId;
```

**Security Rule:**

```
Frontend must NOT send userId or adminId in the request body.
Backend always extracts these from the JWT — body values are ignored/overwritten.
```

**Resulting data per creator role:**

| Creator Role     | userId        | adminId             |
| ---------------- | ------------- | ------------------- |
| ADMIN / MASTER   | admin's `_id` | admin's `_id`       |
| USER / SUB_ADMIN | user's `_id`  | their admin's `_id` |

**Frontend Example (React):**

```typescript
async function createLease(leaseData) {
  const token = localStorage.getItem("authToken");

  const response = await fetch("http://backend:3000/api/v1/lease", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([leaseData]),
  });

  if (response.ok) {
    return await response.json();
  } else {
    throw new Error("Failed to create lease");
  }
}
```

---

### 2. FETCH LEASES (Grouped)

**Endpoint:** `GET /api/v1/lease`

**Description:** Fetch leases based on user role with automatic grouping by originalLeaseId

**Headers:**

```
Authorization: Bearer <TOKEN>
```

**Query Parameters:**

```
?userId=<optional-override-user-id>
&locationId=<optional-location-filter>
```

**Response (200):**

```json
{
  "leases": [
    {
      "activeLease": {
        "_id": "lease-v3",
        "lessorName": "Property Owner Co.",
        "status": "active",
        "versionNumber": 3,
        ...
      },
      "previousVersions": [
        {
          "_id": "lease-v2",
          "status": "modified",
          "versionNumber": 2,
          ...
        },
        {
          "_id": "lease-v1",
          "status": "modified",
          "versionNumber": 1,
          ...
        }
      ]
    }
  ]
}
```

**Backend Logic:**

```typescript
const token = req.headers.authorization?.split("Bearer ")[1];
const requestUser = await getUser(token); // Parses token

const query = {};
const isAdmin = ["ADMIN", "MASTER"].includes(requestUser.role);

if (isAdmin) {
  // Admin sees: leases they created OR leases from their users
  query.$or = [{ adminId: requestUser._id }, { userId: requestUser._id }];
} else {
  // User sees: only their own leases
  query.userId = requestUser._id;
}

// Optional location filter
if (locationId) {
  query.locationId = locationId;
}

const leases = await Lease.find(query).sort({ _id: -1 });

// Group by originalLeaseId for version history
const grouped = groupByOriginalLeaseId(leases);
```

**Frontend Example (React):**

```typescript
async function fetchLeases(locationId = null) {
  const token = localStorage.getItem('authToken');

  let url = 'http://backend:3000/api/v1/lease';
  if (locationId) {
    url += `?locationId=${locationId}`;
  }

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json();
  return data.leases; // Already grouped
}

// Display in UI
function LeaseList() {
  const [leases, setLeases] = useState([]);

  useEffect(() => {
    fetchLeases().then(setLeases);
  }, []);

  return (
    <div>
      {leases.map(leaseGroup => (
        <div key={leaseGroup.activeLease._id}>
          <h3>{leaseGroup.activeLease.lessorName}</h3>
          <p>Status: {leaseGroup.activeLease.status}</p>
          <p>Version: {leaseGroup.activeLease.versionNumber}</p>
          {leaseGroup.previousVersions.length > 0 && (
            <details>
              <summary>Version History ({leaseGroup.previousVersions.length})</summary>
              {leaseGroup.previousVersions.map(v => (
                <p key={v._id}>v{v.versionNumber} - {v.status}</p>
              ))}
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

### 3. UPDATE LEASE

**Endpoint:** `PUT /api/v1/lease/:id`

**Description:** Update specific lease fields

**Headers:**

```
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

**Request Body:**

```json
{
  "lessorName": "Updated Name",
  "rentAmount": 55000,
  "status": "terminated",
  "remarks": "Early termination"
}
```

**Response (200):**

```json
{
  "message": "Lease updated successfully",
  "data": { ...updated lease }
}
```

**Frontend Example:**

```typescript
async function updateLease(leaseId, updates) {
  const token = localStorage.getItem("authToken");

  const response = await fetch(`http://backend:3000/api/v1/lease/${leaseId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });

  return await response.json();
}
```

---

### 4. CREATE LEASE MODIFICATION (Versioning)

**Endpoint:** `PUT /api/v1/lease-modification/:id`

**Description:** Create a new version of a lease (soft modification)

**Request Body:**

```json
{
  "lessorName": "New Name",
  "rentAmount": 60000,
  "rentPaymentFrequency": "quarterly"
}
```

**Response (201):**

```json
{
  "message": "Lease modification added successfully",
  "data": {
    "_id": "lease-v2-new-id",
    "previousVersionId": "lease-v1-id",
    "originalLeaseId": "lease-v1-id",
    "versionNumber": 2,
    "status": "active",
    ...modifiedFields
  }
}
```

**Frontend Example:**

```typescript
async function modifyLease(leaseId, changes) {
  const token = localStorage.getItem("authToken");

  const response = await fetch(
    `http://backend:3000/api/v1/lease-modification/${leaseId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(changes),
    },
  );

  return await response.json();
}
```

---

### 5. DELETE LEASE

**Endpoint:** `DELETE /api/v1/lease/:id`

**Description:** Delete a lease version (auto-restores previous version if exists)

**Headers:**

```
Authorization: Bearer <TOKEN>
```

**Response (200):**

```json
{
  "message": "Lease deleted successfully",
  "data": { ...deleted lease },
  "previousVersionReactivated": true
}
```

**Frontend Example:**

```typescript
async function deleteLease(leaseId) {
  const token = localStorage.getItem("authToken");

  const response = await fetch(`http://backend:3000/api/v1/lease/${leaseId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return await response.json();
}
```

---

### 6. FETCH LEASE MOVEMENT (Time-Range Filter)

**Endpoint:** `GET /api/v1/lease/movement`

**Description:** Fetch leases active within a date range

**Query Parameters:**

```
?startDate=2024-01-01
&endDate=2024-12-31
&locationId=<optional>
```

**Response (200):**

```json
{
  "leases": [
    {
      "activeLease": { ...lease data },
      "previousVersions": [ ...history ]
    }
  ]
}
```

**Frontend Example:**

```typescript
async function fetchLeasesForPeriod(startDate, endDate) {
  const token = localStorage.getItem("authToken");

  const url = new URL("http://backend:3000/api/v1/lease/movement");
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return await response.json();
}
```

---

### 7. FETCH LEASE AUDIT LOGS

**Endpoint:** `GET /api/v1/lease/:id/logs`

**Description:** Get change history for a specific lease

**Response (200):**

```json
{
  "logs": [
    {
      "_id": "log-123",
      "entityType": "Lease",
      "entityId": "lease-id",
      "entityName": "Property Owner Co.",
      "action": "CREATED" | "UPDATED" | "MODIFIED" | "DELETED",
      "performedBy": "user-id",
      "changes": {
        "rentAmount": { "from": 50000, "to": 55000 },
        "status": { "from": "active", "to": "terminated" }
      },
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Frontend Example:**

```typescript
async function fetchLeaseLogs(leaseId) {
  const token = localStorage.getItem('authToken');

  const response = await fetch(`http://backend:3000/api/v1/lease/${leaseId}/logs`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  return await response.json();
}

// Display change history
function AuditLog({ leaseId }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    fetchLeaseLogs(leaseId).then(data => setLogs(data.logs));
  }, [leaseId]);

  return (
    <table>
      <thead>
        <tr>
          <th>Action</th>
          <th>Date</th>
          <th>Changes</th>
        </tr>
      </thead>
      <tbody>
        {logs.map(log => (
          <tr key={log._id}>
            <td>{log.action}</td>
            <td>{new Date(log.timestamp).toLocaleString()}</td>
            <td>
              {Object.entries(log.changes).map(([field, change]) => (
                <p key={field}>
                  {field}: {change.from} → {change.to}
                </p>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## 🎯 Role-Based Access Control

### ADMIN Role

- ✅ See all leases in organization
- ✅ Create leases (as own lease)
- ✅ Modify leases
- ✅ Delete leases
- ✅ Filter by location
- ✅ View all audit logs

### USER Role

- ✅ See only own leases
- ✅ Create own leases
- ✅ Modify own leases
- ✅ Delete own leases
- ✅ Filter by location (if set)
- ✅ View own audit logs

---

## 📱 Frontend Integration Example (React)

### Setup

```typescript
// authContext.ts
const AuthContext = createContext();

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('authToken'));
  const [user, setUser] = useState(JSON.parse(atob(token?.split('.')[1] || '{}')));

  return (
    <AuthContext.Provider value={{ token, user }}>
      {children}
    </AuthContext.Provider>
  );
}
```

### Lease Service

```typescript
// leaseService.ts
import { useAuth } from "./authContext";

export function useLeaseAPI() {
  const { token } = useAuth();
  const baseURL = "http://backend:3000/api/v1";

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  return {
    async createLease(leaseData) {
      const res = await fetch(`${baseURL}/lease`, {
        method: "POST",
        headers,
        body: JSON.stringify([leaseData]),
      });
      if (!res.ok) throw new Error("Failed to create lease");
      return res.json();
    },

    async fetchLeases(locationId = null) {
      let url = `${baseURL}/lease`;
      if (locationId) url += `?locationId=${locationId}`;

      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Failed to fetch leases");
      return res.json();
    },

    async updateLease(leaseId, updates) {
      const res = await fetch(`${baseURL}/lease/${leaseId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update lease");
      return res.json();
    },

    async deleteLease(leaseId) {
      const res = await fetch(`${baseURL}/lease/${leaseId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to delete lease");
      return res.json();
    },

    async fetchLeaseLogs(leaseId) {
      const res = await fetch(`${baseURL}/lease/${leaseId}/logs`, { headers });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
  };
}
```

### Component Usage

```typescript
function LeaseManager() {
  const { user } = useAuth();
  const leaseAPI = useLeaseAPI();
  const [leases, setLeases] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    leaseAPI.fetchLeases()
      .then(data => setLeases(data.leases))
      .finally(() => setLoading(false));
  }, []);

  const isAdmin = ['ADMIN', 'MASTER'].includes(user?.role);

  return (
    <div>
      <h1>{isAdmin ? 'All Leases' : 'My Leases'}</h1>
      {loading ? <p>Loading...</p> : (
        <div>
          {leases.map(group => (
            <LeaseCard key={group.activeLease._id} leaseGroup={group} />
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## ⚠️ Error Handling

### Common Response Codes

| Code | Meaning      | Action                        |
| ---- | ------------ | ----------------------------- |
| 200  | Success      | Parse response                |
| 201  | Created      | Parse response                |
| 400  | Bad request  | Check payload validation      |
| 401  | Unauthorized | Refresh token or re-login     |
| 403  | Forbidden    | User lacks permission         |
| 404  | Not found    | Resource doesn't exist        |
| 409  | Conflict     | Duplicate lease name for user |
| 500  | Server error | Retry or contact support      |

### Error Response

```json
{
  "error": "Error message describing the issue"
}
```

---

## 🔑 Key Integration Points

1. **Token Management**: Store JWT in localStorage or secure cookie
2. **Authorization Header**: Always include `Bearer <token>`
3. **Role Detection**: Parse token to get `role` and `adminId`
4. **Grouping**: Frontend receives pre-grouped leases by version
5. **Audit Trail**: Fetch logs for compliance tracking
6. **Location Filter**: Support multi-location organizations

---

## 📝 Notes

- All timestamps are ISO 8601 format
- ObjectIds are MongoDB 24-character hex strings
- Lease versioning is automatic on modifications
- Audit logs are immutable
- Frontend should handle offline scenarios gracefully
