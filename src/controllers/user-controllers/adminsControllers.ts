import { RequestHandler } from "express";
import { User } from "../../models/user.model";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { getUser, setUser } from "../../services/auth";

dotenv.config();

/**
 * Admin Signup Controller
 * Handles new admin creation with role, password hashing, and user limit validation.
 */
export const adminSignUpController: RequestHandler = async (req, res) => {
  try {
    const { email, fullName, password, status, user_limit } = req.body;
    const token = req.headers.authorization?.split("Bearer ")[1] || "";
    const creator = token ? await getUser(token) : null;

    if (!email || !fullName || !password) {
      return res.status(400).json({ success: false, message: "Please provide all fields!" });
    }

    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }

    if (creator?.user_limit) {
      const adminCount = await User.countDocuments({ creatorId: creator._id });
      if (adminCount >= creator.user_limit && creator.role !== "MASTER") {
        return res.status(403).json({ error: "Admin limit reached for this account" });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new User({
      email,
      fullName,
      password: hashedPassword,
      role:
        creator?.role === "MASTER"
          ? "ADMIN"
          : creator?.role === "ADMIN"
          ? "SUB_ADMIN"
          : creator?.role === "SUB_ADMIN"
          ? "USER"
          : "GUEST",
      creatorId: creator?._id || null,
      status: status || true,
      user_limit: user_limit || 0,
    });

    await newAdmin.save();

    return res.status(201).json({
      message: "Admin created successfully",
      admin: {
        id: newAdmin._id,
        role: newAdmin.role,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * Admin Update Controller
 * Allows updating admin information, retaining the password if not provided.
 */
export const updateAdminController: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, fullName, password, status, user_limit } = req.body;
    const admin = await User.findById(id);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const updatedFields: Partial<typeof admin> = {
      email,
      fullName,
      status,
      user_limit,
    };

    if (password) {
      updatedFields.password = await bcrypt.hash(password, 10);
    }

    Object.assign(admin, updatedFields);
    await admin.save();

    return res.status(200).json({
      message: "Admin updated successfully",
      admin,
    });
  } catch (error) {
    console.error("Update admin error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Admin Delete Controller
 * Deletes an admin by ID.
 */
export const deleteAdminController: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedAdmin = await User.findByIdAndDelete(id);

    if (!deletedAdmin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    return res.status(200).json({ message: "Admin deleted successfully" });
  } catch (error) {
    console.error("Delete admin error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


/**
 * Admin Login Controller
 * Handles admin authentication and token generation.
 */
export const adminSignInController: RequestHandler = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find the admin trying to log in
    const admin = await User.findOne({ email });

    if (!admin) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check the status of the parent hierarchy
    let currentUser = admin;
    while (currentUser.creatorId) {
      const parentUser = await User.findOne({ _id: currentUser.creatorId });
      if (!parentUser) {
        return res.status(404).json({ error: "Parent account not found" });
      }
      if (!parentUser.status) {
        return res.status(403).json({ error: "Parent account is inactive" });
      }
      currentUser = parentUser;
    }

    // Verify password
    const isMatched = await bcrypt.compare(password, admin.password);
    if (!isMatched) {
      return res.status(400).json({ error: "Invalid password!" });
    }

    // Generate token
    const token = setUser(admin);

    return res.status(200).json({
      message: "Login successful",
      role: admin.role,
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};


/**
 * Admin Logout Controller
 * Clears the token cookie for admin logout.
 */
export const adminLogoutController: RequestHandler = (req, res) => {
  res.clearCookie("access_token");
  return res.status(200).json({ message: "Logout successful" });
};

/**
 * Get All Admins
 * Retrieves all admins created by the authenticated admin.
 */
export const getAllAdminsController: RequestHandler = async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const creator = await getUser(token);
    if (!creator) {
      return res.status(401).json({ error: "Creator not found or unauthorized" });
    }

    const admins = await User.find({ creatorId: creator._id }).select("-password");

    return res.status(200).json({ data: admins });
  } catch (error) {
    console.error("Get admins error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
