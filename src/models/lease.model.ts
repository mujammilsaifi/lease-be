import mongoose, { Schema, Document } from "mongoose";

// Interface for Lease Document
interface ILease extends Document {
  selectedOptions: string[];
  userId: mongoose.Types.ObjectId;
  adminId?: mongoose.Types.ObjectId;
  locationId?: mongoose.Types.ObjectId;
  originalLeaseId?: mongoose.Types.ObjectId;
  previousVersionId?: mongoose.Types.ObjectId;
  versionNumber: number;
  scope?: number;
  lessorName: string;
  natureOfLease: string;
  leaseClosureDate?: string;
  dateOfSDClosure?: string;
  leaseTerminationDate?: string;
  remarks?: string;
  userName?: string;
  location?: string;
  leaseGroup?: string;
  status: "active" | "terminated" | "closed" | "modified";
  period: string;
  leasePeriod: string[];
  lockingPeriod: string[];
  leaseWorkingPeriod: string[];
  rentPaymentType: string;
  rentPaymentFrequency: string;
  rentAmount: number;
  frequencyForInterestCalculation?: "monthly" | "daily";
  transitionType?: "prospective" | "retrospective";
  transitionDiscountAdjustment?: "no" | "yes";
  rentPaymentDate: number | string;
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
  modificationAdjustmentInROUWithProspective?: number;
  leaseLiabilityCutOff?: number;
  cutOffDateROU?: number;
  agreementBeginningDiscountedSecurityDeposit?: number;
  agreementBeginningPrepaidRent?: number;
  interestIncomeOnSDfromAgreementBeginningTillCutoffDate?: number;
  depreciationExpenseOnPRTillCutOffDate?: number;
  cutOffSecurityDeposit?: number;
  cutOffDatePrepaidRent?: number;
  leaseModificationDate?: string;
  otherLeaseInformations?: {
    extensionOption?: boolean;
    purchaseOption?: boolean;
    terminationOption?: boolean;
  };
  randomPayments?: {
    date: string;
    amount: number;
  }[];
}

// Mongoose Schema
const LeaseSchema: Schema = new Schema(
  {
    selectedOptions: {
      type: [String],
    },
    userId: { type: Schema.Types.ObjectId, required: true },
    adminId: { type: Schema.Types.ObjectId, required: false }, // 🔥 MAIN FIX
    locationId: { type: Schema.Types.ObjectId, required: false }, // for location filter
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
    dateOfSDClosure: { type: String, required: false },
    leaseTerminationDate: { type: String, required: false },
    remarks: { type: String, required: false },
    userName: { type: String, required: false },
    location: { type: String, required: false },
    leaseGroup: { type: String, required: false },
    status: {
      type: String,
      enum: ["active", "terminated", "closed", "modified"],
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
    frequencyForInterestCalculation: {
      type: String,
      enum: ["daily", "monthly"],
      required: false,
    },
    transitionType: {
      type: String,
      enum: ["prospective", "retrospective"],
      required: false, // Make this field optional
    },
    transitionDiscountAdjustment: {
      type: String,
      enum: ["no", "yes"],
      required: false,
    },
    rentPaymentDate: {
      type: Schema.Types.Mixed,
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
        return !!this.cutOffDate && this.transitionType !== "prospective";
      },
    },
    agreementBeginningLeaseLiability: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate && this.transitionType !== "prospective";
      },
    },
    agreementBeginningROU: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate && this.transitionType !== "prospective";
      },
    },
    interestExpenseBeginningTillCutOffDate: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate && this.transitionType !== "prospective";
      },
    },
    rentPaidBeginningTillCutOffDate: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate && this.transitionType !== "prospective";
      },
    },
    depreciationExpenseTillCutOffDate: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate && this.transitionType !== "prospective";
      },
    },
    modificationAdjustmentInROUWithProspective: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate && this.transitionType !== "prospective";
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
        return !!this.cutOffDate && this.transitionType !== "prospective";
      },
    },
    agreementBeginningPrepaidRent: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate && this.transitionType !== "prospective";
      },
    },
    interestIncomeOnSDfromAgreementBeginningTillCutoffDate: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate && this.transitionType !== "prospective";
      },
    },
    depreciationExpenseOnPRTillCutOffDate: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate && this.transitionType !== "prospective";
      },
    },
    cutOffSecurityDeposit: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate && this.transitionType !== "prospective";
      },
    },
    cutOffDatePrepaidRent: {
      type: Number,
      required: function (this: ILease) {
        return !!this.cutOffDate && this.transitionType !== "prospective";
      },
    },
    leaseModificationDate: { type: String, required: false },
    otherLeaseInformations: {
      extensionOption: { type: Boolean, default: false },
      purchaseOption: { type: Boolean, default: false },
      terminationOption: { type: Boolean, default: false },
    },
    randomPayments: [
      {
        date: { type: String, required: true },
        amount: { type: Number, required: true },
      },
    ],
  },
  { timestamps: true },
);
LeaseSchema.index(
  { lessorName: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["active", "terminated"] },
    },
  },
);

export default mongoose.model<ILease>("Lease", LeaseSchema);
