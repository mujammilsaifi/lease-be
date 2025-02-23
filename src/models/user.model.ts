import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config();

export const MASTER_ROLE = 'MASTER';
export const ADMIN_ROLE = 'ADMIN';
export const SUB_ADMIN_ROLE = 'SUB_ADMIN';
export const USER_ROLE = 'USER';
export const GUEST_ROLE = 'GUEST';

export const roleEnum = [USER_ROLE, ADMIN_ROLE, SUB_ADMIN_ROLE, MASTER_ROLE, GUEST_ROLE];

export interface User extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  fullName: string;
  password: string;
  role: string;
  status: boolean;
  creatorId?: mongoose.Types.ObjectId | null;
  avatar?: string;
  location?: string;
  user_limit?: number;
  coverImage?: string;
  refreshToken?: string;
}

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    creatorId: {
      type: mongoose.Types.ObjectId,
      default: null,
    },
    role: {
      type: String,
      enum: roleEnum,
      default: GUEST_ROLE,
      required: true,
    },
    avatar: {
      type: String,
    },
    user_limit: {
      type: Number,
      default: 0,
    },
    location: {
      type: String,
    },
    status: {
      type: Boolean,
      default: true,
    },
    coverImage: {
      type: String,
    },
    password: {
      type: String,
      required: [true, 'Password is required.'],
    },
    refreshToken: {
      type: String,
    },
  },
  { timestamps: true },
);

// Method to check if user is active
userSchema.methods.isActive = function (): boolean {
  return this.status;
};

export const User = mongoose.model<User>('User', userSchema);
