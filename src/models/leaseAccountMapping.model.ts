import mongoose, { Schema, Document } from "mongoose";

interface IMapping {
  account_type: string;
  asset_type: string;
  coc_code: string;
  coc_name: string;
  gl_code: string;
  gl_name: string;
  is_active?: boolean;
}

interface IDisclosureSetting {
  entryNo: string;
  narration: string;
  adjustment_type: string;
  tag: string;
  entry_type: string;
}

interface IOIMapping {
  category: string;
  particular: string;
  asset_type: string;
  oi_code: string;
}

interface ILeaseAccountMapping extends Document {
  userId: string;
  mappings: IMapping[];
  disclosureSettings: IDisclosureSetting[];
  oi_mappings: IOIMapping[];
}

const leaseAccountMappingSchema = new Schema<ILeaseAccountMapping>(
  {
    userId: { type: String, required: true, unique: true },
    mappings: [
      {
        account_type: { type: String, required: true },
        asset_type: { type: String, required: true },
        coc_code: { type: String, default: "" },
        coc_name: { type: String, default: "" },
        gl_code: { type: String, default: "" },
        gl_name: { type: String, default: "" },
        is_active: { type: Boolean, default: false },
      },
    ],
    disclosureSettings: [
      {
        entryNo: { type: String, required: true },
        narration: { type: String, default: "" },
        adjustment_type: { type: String, default: "" },
        tag: { type: String, default: "" },
        entry_type: { type: String, default: "" },
      },
    ],
    oi_mappings: [
      {
        category: { type: String, required: true },
        particular: { type: String, required: true },
        asset_type: { type: String, required: true },
        oi_code: { type: String, default: "" },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<ILeaseAccountMapping>(
  "LeaseAccountMapping",
  leaseAccountMappingSchema
);
