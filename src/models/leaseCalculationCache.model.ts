import mongoose, { Schema, Document } from "mongoose";

export interface ILeaseCalculationCache extends Document {
  leaseVersionId: mongoose.Types.ObjectId;
  originalLeaseId: mongoose.Types.ObjectId;
  presentationPeriod: string; // Format: YYYY-MM-DD_YYYY-MM-DD
  detailsData: any; // Month-by-month array
  summaryData: any; // generateLeaseSummary output
}

const LeaseCalculationCacheSchema = new Schema<ILeaseCalculationCache>(
  {
    leaseVersionId: { type: Schema.Types.ObjectId, ref: "Lease", required: true },
    originalLeaseId: { type: Schema.Types.ObjectId, ref: "Lease", required: true },
    presentationPeriod: { type: String, required: true },
    detailsData: { type: Schema.Types.Mixed, required: true },
    summaryData: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

// Compound index for fast lookup and strict uniqueness
LeaseCalculationCacheSchema.index({ leaseVersionId: 1, presentationPeriod: 1 }, { unique: true });
LeaseCalculationCacheSchema.index({ originalLeaseId: 1 });

export default mongoose.model<ILeaseCalculationCache>("LeaseCalculationCache", LeaseCalculationCacheSchema);
