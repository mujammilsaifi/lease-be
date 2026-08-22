import mongoose, { Schema, Document } from "mongoose";

export interface ILeaseAssessmentQuestion {
  questionId: string; // Q1 to Q9 or FQ_...
  title: string;
  status: "automated" | "confirmed" | "pending";
  answer: string | null;
  confidence: number;
  explanation: string;
  promptText?: string;
  inputType?: "date" | "number" | "boolean" | "select" | "text";
  options?: string[];
  aiUnderstanding?: string;
  whyAsked?: string;
}

export interface IFinancialClarification {
  questions: ILeaseAssessmentQuestion[];
  status: "pending" | "completed";
  resolvedFacts: Record<string, any>;
}

export interface ILeaseAssessment extends Document {
  agreementId: string; // AGR-...
  fileName: string;
  stage?: "assessment" | "financial-data";
  rawText: string;
  questions: ILeaseAssessmentQuestion[];
  recommendation: "Lease" | "Service Contract" | "Exempt Lease" | null;
  overallConfidence: number;
  recommendationNarrative: string;
  managementInputs?: string[];
  status: "in_progress" | "accepted_lease" | "accepted_service" | "overridden";
  overrideReason?: string;
  financialDataExtracted: boolean;
  financialClarifications: IFinancialClarification;
  extractedFields?: any[];
  rawFinancialData?: any;
  createdAt: Date;
  updatedAt: Date;
}

const LeaseAssessmentQuestionSchema = new Schema({
  questionId: { type: String, required: true },
  title: { type: String, default: "" },
  status: {
    type: String,
    enum: ["automated", "confirmed", "pending"],
    default: "pending",
  },
  answer: { type: String, default: null },
  confidence: { type: Number, default: 0 },
  explanation: { type: String, default: "" },
  promptText: { type: String },
  inputType: {
    type: String,
    enum: ["date", "number", "boolean", "select", "text"],
    default: "select",
  },
  options: { type: [String] },
  aiUnderstanding: { type: String },
  whyAsked: { type: String },
});

const LeaseAssessmentSchema = new Schema(
  {
    agreementId: { type: String, required: true, unique: true, index: true },
    fileName: { type: String, required: true },
    stage: {
      type: String,
      enum: ["assessment", "financial-data"],
      default: "assessment",
    },
    rawText: { type: String, required: true },
    questions: { type: [LeaseAssessmentQuestionSchema], default: [] },
    recommendation: {
      type: String,
      enum: ["Lease", "Service Contract", "Exempt Lease", null],
      default: null,
    },
    overallConfidence: { type: Number, default: 0 },
    recommendationNarrative: { type: String, default: "" },
    managementInputs: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["in_progress", "accepted_lease", "accepted_service", "overridden"],
      default: "in_progress",
    },
    overrideReason: { type: String },
    financialDataExtracted: { type: Boolean, default: false },
    financialClarifications: {
      questions: { type: [LeaseAssessmentQuestionSchema], default: [] },
      status: { type: String, enum: ["pending", "completed"], default: "completed" },
      resolvedFacts: { type: Schema.Types.Mixed, default: {} }
    },
    extractedFields: { type: [Schema.Types.Mixed], default: [] },
    rawFinancialData: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

export default mongoose.model<ILeaseAssessment>(
  "LeaseAssessment",
  LeaseAssessmentSchema
);