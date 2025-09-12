import mongoose, { Schema, Document } from "mongoose";

// Interface for Lease Document
interface ILease extends Document {
  selectedOptions: string[];
  userId: mongoose.Types.ObjectId;
  originalLeaseId?: string;
  previousVersionId?: mongoose.Types.ObjectId;
  versionNumber: number;
  scope?: number;
  lessorName: string;
  natureOfLease: string;
  leaseClosureDate?: string;
  remarks?: string;
  status: "active" | "close" | "modified";
  period: string;
  leasePeriod: string[];
  lockingPeriod: string[];
  leaseWorkingPeriod: string[];
  rentPaymentType: string;
  rentPaymentFrequency: string;
  rentAmount: number;
  rentPaymentDate: number;
  securityDeposit?: number;
  leaseEqualizationPertaining?: number;
  otherAdjustmentInRightOfUse?: number;
  discountingRates?: {
    dateRange: string[];
    rate: number;
  }[];
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
  cutOffSecurityDeposit?: number;
  cutOffDatePrepaidRent?: number;
  leaseModificationDate: string;
}

// Mongoose Schema
const LeaseSchema: Schema = new Schema(
  {
    selectedOptions: {
      type: [String],
    },
    userId: { type: String, required: true },
    originalLeaseId: {
      type: Schema.Types.ObjectId,
      ref: "Lease",
      default: null,
    },
    previousVersionId: {
      type: Schema.Types.ObjectId,
      ref: "Lease",
      default: null,
    },
    versionNumber: { type: Number, required: true },
    scope: { type: Number, required: false },
    lessorName: { type: String, required: true },
    natureOfLease: { type: String, required: true },
    leaseClosureDate: { type: String, required: false },
    remarks: { type: String, required: false },
    status: {
      type: String,
      enum: ["active", "close", "modified"],
      default: "active",
      required: false,
    },
    period: { type: String, required: true },
    leasePeriod: { type: [String], required: true },
    lockingPeriod: { type: [String], required: true },
    leaseWorkingPeriod: { type: [String], required: true },
    rentPaymentType: {
      type: String,
      required: true,
    },
    rentPaymentFrequency: {
      type: String,
      required: true,
    },
    rentAmount: {
      type: Number,
      required: true,
    },
    rentPaymentDate: {
      type: Number,
      required: true,
    },
    securityDeposit: { type: Number, required: false },
    leaseEqualizationPertaining: { type: Number, required: false },
    otherAdjustmentInRightOfUse: { type: Number, required: false },
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
    cutOffDatePrepaidRent: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate;
      },
    },
    leaseModificationDate: { type: String, required: false },
  },
  { timestamps: true }
);
LeaseSchema.index(
  { lessorName: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["active", "close"] },
    },
  }
);

export default mongoose.model<ILease>("Lease", LeaseSchema);
