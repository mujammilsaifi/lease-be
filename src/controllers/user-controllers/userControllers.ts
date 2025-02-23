import { RequestHandler } from "express";
import { User } from "../../models/user.model";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { getUser} from "../../services/auth";

dotenv.config();

/**
 * User Signup Controller
 * Handles new user creation with role, password hashing, and adding location field.
 */
export const userSignUpController: RequestHandler = async (req, res) => {
  try {
    const { email, fullName, password, status, location } = req.body;
    const token = req.headers.authorization?.split("Bearer ")[1] || "";
    const creator = token ? await getUser(token) : null;

    if (!email || !fullName || !password || !location) {
      return res.status(400).json({ success: false, message: "Please provide all fields!" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      email,
      fullName,
      password: hashedPassword,
      role:"USER" ,
      creatorId: creator?._id || null,
      status: status || true,
      location, // Add location here
    });

    await newUser.save();

    return res.status(201).json({
      message: "User created successfully",
      user: {
        id: newUser._id,
        role: newUser.role,
        location: newUser.location, // Return location
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * User Update Controller
 * Allows updating user information, retaining the password if not provided.
 */
export const updateUserController: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, fullName, password, status, location } = req.body;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const updatedFields: Partial<typeof user> = {
      email,
      fullName,
      status,
      location, 
    };

    if (password) {
      updatedFields.password = await bcrypt.hash(password, 10);
    }

    Object.assign(user, updatedFields);
    await user.save();

    return res.status(200).json({
      message: "User updated successfully",
      user,
    });
  } catch (error) {
    console.error("Update user error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

