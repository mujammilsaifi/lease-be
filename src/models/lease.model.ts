import mongoose, { Schema, Document } from "mongoose";

// Interface for Lease Document
interface ILease extends Document {
  lessorName: string;
  natureOfLease: string;
  leaseClosureDate?: string;  
  remarks?: string;           
  status: "active" | "close";
  period: string;
  agreementCode: string;
  leasePeriod: string[];
  lockingPeriod: string[];
  leaseWorkingPeriod: string[];
  rentPaymentType: string;
  rentPaymentFrequency: string;
  rentAmount: number;
  rentPaymentDate: number;
  securityDeposit?: number; 
  discountingRates?: {
    dateRange: string[];
    rate: number;
  }[];
  systematicEscalations?: {
    dateRange: string;
    frequency: string;
    percentage: number;
  }[];
  adhocEscalations?: {
    dateRange: string[];
    frequency: string;
    amount: number;
  }[];
  rentFreePeriods?: {
    dateRange: string[];
    percentage: number;
  }[];
}

// Mongoose Schema
const LeaseSchema: Schema = new Schema({
  lessorName: { type: String, required: true },
  natureOfLease: { type: String, required: true },
  leaseClosureDate: { type: String, required: false},
  remarks: { type: String, required: false},
  status: {
    type: String,
    enum: ["active", "close"], 
    default: "active",
    required: false
  },
  period: { type:String, required: true },
  agreementCode: { type: String, required: true, unique: true },
  leasePeriod: { type: [String], required: true },
  lockingPeriod: { type: [String], required: true },
  leaseWorkingPeriod: { type: [String], required: true },
  rentPaymentType: { type: String, required: true },
  rentPaymentFrequency: { type: String, required: true },
  rentAmount: { type: Number, required: true },
  rentPaymentDate: { type: Number, required: true },
  securityDeposit: { type: Number, required: false }, 
  discountingRates: [
    {
      dateRange: { type: [String], required: true },
      rate: { type: Number, required: true },
    },
  ],
  systematicEscalations: [
    {
      dateRange: { type: String, required: true },
      frequency: { type: String, required: true },
      percentage: { type: Number, required: true },
    },
  ],
  adhocEscalations: [
    {
      dateRange: { type: [String], required: true },
      frequency: { type: String, required: true },
      amount: { type: Number, required: true },
    },
  ],
  rentFreePeriods: [
    {
      dateRange: { type: [String], required: true },
      percentage: { type: Number, required: true },
    },
  ],
},{timestamps:true});

export default mongoose.model<ILease>("Lease", LeaseSchema);
