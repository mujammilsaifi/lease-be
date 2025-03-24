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
  natureOfRent: "adhoc-type" | "systematic";
  rentAdhocWise?: {
    date: string;
    rent: number;
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
  cutOffDate?: string;
  cutOffLeasePeriod?: string[];
  agreementBeginningLeaseLiability?: number;
  agreementBeginningROU?: number;
  interestExpenseBeginningTillCutOffDate?: number;
  rentPaidBeginningTillCutOffDate?: number;
  depreciationExpenseTillCutOffDate?: number;
  leaseLiabilityCutOff?: number;
  cutOffDateROU?: number;
  agreementBeginningDiscountedSecurityDeposit?: number;
  agreementBeginningPrepaidRent?: number;
  interestIncomeOnSDfromAgreementBeginningTillCutoffDate?: number;
  depreciationExpenseOnPRTillCutOffDate?: number;
  cutOffSecurityDeposit?:number,
  cutOffDatePrepaidRent?:number
}

// Mongoose Schema
const LeaseSchema: Schema = new Schema(
  {
    lessorName: { type: String, required: true },
    natureOfLease: { type: String, required: true },
    leaseClosureDate: { type: String, required: false },
    remarks: { type: String, required: false },
    status: {
      type: String,
      enum: ["active", "close"],
      default: "active",
      required: false,
    },
    period: { type: String, required: true },
    agreementCode: { type: String, required: true, unique: true },
    leasePeriod: { type: [String], required: true },
    lockingPeriod: { type: [String], required: true },
    leaseWorkingPeriod: { type: [String], required: true },
    rentPaymentType: {
      type: String,
      required: function (this: ILease) {
        return this.natureOfRent === "systematic";
      },
    },
    rentPaymentFrequency: {
      type: String,
      required: function (this: ILease) {
        return this.natureOfRent === "systematic";
      },
    },
    rentAmount: {
      type: Number,
      required: function (this: ILease) {
        return this.natureOfRent === "systematic";
      },
    },
    rentPaymentDate: {
      type: Number,
      required: function (this: ILease) {
        return this.natureOfRent === "systematic";
      },
    },
    securityDeposit: { type: Number, required: false },
    discountingRates: [
      {
        dateRange: { type: [String], required: true },
        rate: { type: Number, required: true },
      },
    ],
    natureOfRent: {
      type: String,
      enum: ["adhoc-type", "systematic"],
      required: true,
    },
    rentAdhocWise: [
      {
        date: {
          type: String,
          required: function (this: ILease) {
            return this.natureOfRent === "adhoc-type";
          },
        },
        rent: {
          type: Number,
          required: function (this: ILease) {
            return this.natureOfRent === "adhoc-type";
          },
        },
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
    cutOffDate: { type: String, required: false },
    cutOffLeasePeriod: {
      type: [String],
      required: function (this: ILease) {
        return !!this.cutOffDate;
      },
    },
    agreementBeginningLeaseLiability: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate;
      },
    },
    agreementBeginningROU: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate;
      },
    },
    interestExpenseBeginningTillCutOffDate: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate;
      },
    },
    rentPaidBeginningTillCutOffDate: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate;
      },
    },
    depreciationExpenseTillCutOffDate: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate;
      },
    },
    leaseLiabilityCutOff: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate;
      },
    },
    cutOffDateROU: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate;
      },
    },
    agreementBeginningDiscountedSecurityDeposit: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate;
      },
    },
    agreementBeginningPrepaidRent: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate;
      },
    },
    interestIncomeOnSDfromAgreementBeginningTillCutoffDate: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate;
      },
    },
    depreciationExpenseOnPRTillCutOffDate: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate;
      },
    },
    cutOffSecurityDeposit: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate;
      },
    },
    cutOffDatePrepaidRent:{
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate;
      },
    },
    
  },
  { timestamps: true }
);

export default mongoose.model<ILease>("Lease", LeaseSchema);
