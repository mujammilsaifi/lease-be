# Lease & Admin Logic Flows

## 🔄 Lease Creation Flow

### Decision Tree

```
User Submits Lease Form
    ↓
Extract Token from Headers
    ↓
Parse Token → Get User Claims (_id, role, adminId, locationId)
    ↓
Check Role
    ├─→ ADMIN / MASTER
    │   ├─→ Set userId = user._id
    │   ├─→ Set adminId = user._id  ⟵ ADMIN is own group owner
    │   ├─→ Set locationId = null
    │   └─→ Save Lease
    │
    ├─→ USER / SUB_ADMIN
    │   ├─→ Set userId = user._id
    │   ├─→ Set adminId = user.adminId  ⟵ USER under their ADMIN
    │   ├─→ Set locationId = user.locationId
    │   └─→ Save Lease
    │
    └─→ No Role Found
        └─→ Return 400 "Invalid token"

Create Lease Instance
    ├─→ Set versionNumber = 1
    ├─→ Set originalLeaseId = lease._id (after save)
    ├─→ Set status = "active"
    ├─→ Create AuditLog entry
    └─→ Return 201 with lease data
```

### Code Implementation

```typescript
export const leaseController: RequestHandler = async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    const user = await getUser(token);

    const leaseData = req.body; // Array of leases

    // Add user info to each lease
    const enrichedLeases = leaseData.map((lease) => ({
      ...lease,
      userId: user._id,
      adminId: ["ADMIN", "MASTER", "SUB_ADMIN"].includes(user.role) ? user._id : user.adminId,
      locationId: user.locationId || null,
      versionNumber: 1,
    }));

    // Save to DB
    const savedLeases = await leaseModel.insertMany(enrichedLeases);

    // Set originalLeaseId to self
    await Promise.all(
      savedLeases.map((lease) =>
        leaseModel.findByIdAndUpdate(lease._id, { originalLeaseId: lease._id }),
      ),
    );

    // Log creation
    await Promise.all(
      savedLeases.map((lease) =>
        AuditLog.create({
          entityType: "Lease",
          entityId: lease._id,
          action: "CREATED",
          performedBy: user._id,
          timestamp: new Date(),
        }),
      ),
    );

    return res.status(201).json({
      message: "Leases created successfully",
      data: savedLeases,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
```

---

## 👁️ Lease Fetch Flow

### Decision Tree

```
Frontend Sends GET /lease Request
    ↓
Extract Token from Authorization Header
    ↓
Validate & Parse Token → Get User (_id, role, adminId)
    ↓
Determine Query Filter
    ├─→ User.role = "ADMIN" or "MASTER"
    │   ├─→ Query = { $or: [ {adminId: user._id}, {userId: user._id} ] }
    │   └─→ Logic: Admin sees leases they created OR leases of their users
    │
    └─→ User.role = "USER" or "SUB_ADMIN"
        ├─→ Query = { userId: user._id }
        └─→ Logic: User sees only their own leases

Add Optional Filters
    ├─→ if locationId provided
    │   └─→ Query.locationId = locationId
    └─→ if adminId filter
        └─→ Query.adminId = adminId

Fetch from Database
    ↓
Group Results by originalLeaseId
    ├─→ activeLease = lease with status "active|terminated|closed"
    └─→ previousVersions = all other versions sorted by versionNumber desc

Format Response
    ↓
Return 200 with grouped leases
```

### Code Implementation

```typescript
export const getLeaseController: RequestHandler = async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    const requestUser = await getUser(token);
    const { locationId } = req.query;

    // Build query based on role
    const query = {};
    const isAdmin = ["ADMIN", "MASTER"].includes(requestUser?.role);

    if (isAdmin && requestUser?._id) {
      // Admin query: sees own OR their users' leases
      query.$or = [
        { adminId: requestUser._id }, // Org leases (users + own)
        { userId: requestUser._id }, // Admin's own directly-created leases
      ];
    } else if (requestUser?._id) {
      // User query: sees only own leases
      query.userId = requestUser._id;
    } else {
      return res.status(400).json({ message: "Authentication required" });
    }

    // Optional location filter
    if (typeof locationId === "string") {
      query.locationId = locationId;
    }

    // Fetch all matching leases
    const allLeases = await leaseModel.find(query).sort({ _id: -1 }).lean();

    // Group by originalLeaseId
    const leaseMap = new Map();
    allLeases.forEach((lease) => {
      const key = lease.originalLeaseId?.toString() || lease._id.toString();

      if (!leaseMap.has(key)) {
        leaseMap.set(key, {
          activeLease: null,
          previousVersions: [],
        });
      }

      const group = leaseMap.get(key);

      if (["active", "terminated", "closed"].includes(lease.status)) {
        group.activeLease = lease;
      } else {
        group.previousVersions.push(lease);
      }
    });

    const result = Array.from(leaseMap.values());
    return res.status(200).json({ leases: result });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
```

---

## ✏️ Lease Update Flow

### Decision Tree

```
Frontend Sends PUT /lease/:id with Updates
    ↓
Find Existing Lease by ID
    ├─→ Found
    │   ├─→ Check Duplicate (if lessorName changed)
    │   │   ├─→ Duplicate Found → 400 "Name already exists"
    │   │   └─→ No Duplicate → Continue
    │   └─→ Apply Updates
    │       └─→ Save to Database
    │
    └─→ Not Found → 404 "Lease not found"

Handle Special Status Transitions
    ├─→ "terminated" → "active"
    │   ├─→ Remove: leaseTerminationDate
    │   └─→ Remove: remarks
    │
    ├─→ "closed" → "active"
    │   └─→ Remove: leaseClosureDate
    │
    └─→ Other transitions allowed

Log Changes to Audit Table
    ├─→ Calculate diffs (old vs new)
    ├─→ Create AuditLog with changes
    └─→ Non-blocking (errors don't fail request)

Return Updated Lease
    └─→ 200 with modified lease data
```

### Code Implementation

```typescript
export const updateLeaseController: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Find existing lease
    const existingLease = await leaseModel.findById(id);
    if (!existingLease) {
      return res.status(404).json({ message: "Lease not found" });
    }

    // Check for duplicate lessorName (if being updated)
    if (
      updateData.lessorName &&
      updateData.lessorName !== existingLease.lessorName
    ) {
      const duplicate = await leaseModel.findOne({
        userId: existingLease.userId,
        lessorName: {
          $regex: `^${updateData.lessorName.trim()}$`,
          $options: "i",
        },
        _id: { $ne: id }, // Exclude self
      });

      if (duplicate) {
        return res.status(400).json({
          error: `Lease with name "${updateData.lessorName}" already exists`,
        });
      }
    }

    let updateQuery = { $set: updateData };

    // Handle status transitions
    if (
      existingLease.status === "terminated" &&
      updateData.status === "active"
    ) {
      delete updateQuery.$set.leaseTerminationDate;
      delete updateQuery.$set.remarks;
      updateQuery.$unset = { leaseTerminationDate: "", remarks: "" };
    }

    if (existingLease.status === "closed" && updateData.status === "active") {
      delete updateQuery.$set.leaseClosureDate;
      updateQuery.$unset = { leaseClosureDate: "" };
    }

    // Apply update
    const updatedLease = await leaseModel.findByIdAndUpdate(id, updateQuery, {
      new: true,
    });

    // Log changes (non-blocking)
    try {
      const changes = getChanges(
        existingLease.toObject(),
        updatedLease.toObject(),
      );
      if (Object.keys(changes).length > 0) {
        await AuditLog.create({
          entityType: "Lease",
          entityId: id,
          action: "UPDATED",
          performedBy: existingLease.userId,
          changes,
          timestamp: new Date(),
        });
      }
    } catch (auditErr) {
      console.error("Audit log error (non-blocking):", auditErr);
    }

    return res.status(200).json({
      message: "Lease updated successfully",
      data: updatedLease,
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
```

---

## 📝 Lease Modification (Versioning) Flow

### Decision Tree

```
Frontend Sends PUT /lease-modification/:id with Changes
    ↓
Find Original Lease by ID
    ├─→ Found → Extract originalLeaseId, previousVersionId
    └─→ Not Found → 404

Start Database Transaction
    ↓
Mark Original as "modified"
    └─→ Update status = "modified"

Create New Lease Version
    ├─→ Copy all data from original
    ├─→ Apply requested changes
    ├─→ Set previousVersionId = original._id
    ├─→ Set originalLeaseId = original.originalLeaseId || original._id
    ├─→ Increment versionNumber += 1
    ├─→ Set status = "active"
    └─→ Save new version

Commit Transaction
    ↓
Log Modification
    ├─→ Calculate differences
    ├─→ Create AuditLog entry
    └─→ Non-blocking

Return New Version
    └─→ 201 with new lease data
```

### Code Implementation

```typescript
export const leaseModificationController: RequestHandler = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const modifyData = req.body;

    // Find original lease
    const originalData = await leaseModel.findById(id).lean().session(session);
    if (!originalData) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Lease not found" });
    }

    // Mark original as modified
    await leaseModel.findByIdAndUpdate(id, { status: "modified" }, { session });

    // Create new version
    const newLeaseData = {
      ...modifyData,
      userId: originalData.userId,
      adminId: originalData.adminId,
      locationId: originalData.locationId,
      originalLeaseId: originalData.originalLeaseId || originalData._id,
      previousVersionId: originalData._id,
      versionNumber: (originalData.versionNumber || 0) + 1,
      status: "active",
    };

    const savedLease = await leaseModel.create([newLeaseData], { session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Log modification (non-blocking, after commit)
    try {
      const changes = getChanges(originalData, savedLease[0].toObject());
      if (Object.keys(changes).length > 0) {
        await AuditLog.create({
          entityType: "Lease",
          entityId: originalData.originalLeaseId || originalData._id,
          action: "MODIFIED",
          performedBy: originalData.userId,
          changes,
          timestamp: new Date(),
        });
      }
    } catch (auditErr) {
      console.error("Audit log error (non-blocking):", auditErr);
    }

    return res.status(201).json({
      message: "Lease modification added successfully",
      data: savedLease[0],
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    return res.status(500).json({ error: error.message });
  }
};
```

---

## 🗑️ Lease Deletion Flow

### Decision Tree

```
Frontend Sends DELETE /lease/:id
    ↓
Find Lease to Delete
    ├─→ Found
    │   ├─→ Check if has previousVersionId
    │   │   ├─→ Yes → Get previous version
    │   │   └─→ No → No restoration needed
    │   └─→ Delete current lease
    │
    └─→ Not Found → 404 "Lease not found"

Log Deletion
    └─→ Create AuditLog with action="DELETED"

Check for Previous Version
    ├─→ Previous Version Exists
    │   ├─→ Update previous.status = "active"
    │   ├─→ Save previous
    │   └─→ Return { previousVersionReactivated: true }
    │
    └─→ No Previous Version
        └─→ Return { previousVersionReactivated: false }

Return Success
    └─→ 200 with deleted lease & reactivation status
```

### Code Implementation

```typescript
export const deleteLeaseController: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    // Find lease
    const leaseToDelete = await leaseModel.findById(id);
    if (!leaseToDelete) {
      return res.status(404).json({ message: "Lease not found" });
    }

    let previousVersionReactivated = false;
    let previousVersion = null;

    // Get previous version if exists
    if (leaseToDelete.previousVersionId) {
      previousVersion = await leaseModel.findById(
        leaseToDelete.previousVersionId,
      );
    }

    // Delete current lease
    const deletedLease = await leaseModel.findByIdAndDelete(id);

    // Log deletion
    await AuditLog.create({
      entityType: "Lease",
      entityId: leaseToDelete.originalLeaseId || leaseToDelete._id,
      action: "DELETED",
      performedBy: leaseToDelete.userId,
      timestamp: new Date(),
    });

    // Reactivate previous version
    if (previousVersion) {
      previousVersion.status = "active";
      await previousVersion.save();
      previousVersionReactivated = true;
    }

    return res.status(200).json({
      message: "Lease deleted successfully",
      data: deletedLease,
      previousVersionReactivated,
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
```

---

## 🔐 Admin Access Control Matrix

| Action             | ADMIN          | USER        | SUB_ADMIN      | Notes                     |
| ------------------ | -------------- | ----------- | -------------- | ------------------------- |
| Create Lease       | ✅ Own         | ✅ Own      | ✅ Own         | Creator becomes owner     |
| View All Leases    | ✅ Own + Users | ❌ Own only | ✅ Own + Users | Admins see team           |
| Edit Lease         | ✅ Own + Users | ✅ Own      | ✅ Own + Users | Cannot edit others'       |
| Delete Lease       | ✅ Own + Users | ✅ Own      | ✅ Own + Users | Restores previous version |
| View Audit Logs    | ✅ Yes         | ✅ Own      | ✅ Yes         | Full visibility           |
| Filter by Location | ✅ All         | ✅ Assigned | ✅ Assigned    | Location-based access     |

---

## 📊 State Transition Diagram

```
                    ┌─────────────────┐
                    │     active      │ (default status)
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Update/Modify  │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
       ┌──────▼────────┐          ┌────────▼──────┐
       │   terminated  │          │    closed     │
       │  (via update) │          │  (via update) │
       └──────┬────────┘          └────────┬──────┘
              │                           │
              └──────────────┬────────────┘
                             │
                    ┌────────▼────────┐
                    │ Can return to   │
                    │   "active"      │
                    │ (auto-restores  │
                    │  via update)    │
                    └─────────────────┘

Modified Status (versioning only):
  Original Lease → Status = "modified"
  New Version    → Status = "active"
  (Delete removes version, restores previous)
```

---

## 🎯 Frontend State Management Pattern

```typescript
// Recommended Redux/Zustand store structure
interface LeaseStore {
  // Data
  leases: LeaseGroup[]; // Grouped by originalLeaseId
  selectedLease: Lease | null;
  auditLogs: AuditLog[];

  // Filters
  filters: {
    locationId?: string;
    status?: "active" | "terminated" | "closed";
    dateRange?: [string, string];
  };

  // UI State
  loading: boolean;
  error: string | null;
  editingLeaseId: string | null;

  // Actions
  fetchLeases: (filters?) => Promise<void>;
  createLease: (data: Partial<Lease>) => Promise<void>;
  updateLease: (id: string, data: Partial<Lease>) => Promise<void>;
  modifyLease: (id: string, changes: Partial<Lease>) => Promise<void>;
  deleteLease: (id: string) => Promise<void>;
  fetchAuditLogs: (leaseId: string) => Promise<void>;
  setFilters: (filters: any) => void;
  clearError: () => void;
}
```

This ensures consistent state management across your frontend application.
