import mongoose, { Schema, Document } from "mongoose";

export interface IAuditLog extends Document {
  entityType: string;
  entityId: mongoose.Types.ObjectId;
  entityName?: string; // e.g. Lessor Name
  action: "CREATED" | "UPDATED" | "DELETED" | "MODIFIED";
  changes: Record<string, { old: any; new: any }>;
  performedBy: string;
  timestamp: Date;
}

const AuditLogSchema: Schema = new Schema(
  {
    entityType: { type: String, required: true, index: true },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },
    entityName: { type: String },
    action: { type: String, required: true },
    changes: { type: Schema.Types.Mixed, default: {} },
    performedBy: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
