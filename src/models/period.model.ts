import mongoose, { Document, Schema } from 'mongoose';

// Define TypeScript Interface for Period Document
export interface IPeriod extends Document {
  startDate: String;
  endDate: String;
  status: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PeriodSchema: Schema = new Schema(
  {
    startDate: { type:String, required: true },
    endDate: { type: String, required: true },
    status: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Period = mongoose.model<IPeriod>('Period', PeriodSchema);
