import express from "express";
import { restrictTo } from "../../middlewares/authMiddleware";
import { adminLogoutController, adminSignInController, adminSignUpController, deleteAdminController, getAllAdminsController, updateAdminController } from "../../controllers/user-controllers/adminsControllers";
import {  updateUserController, userSignUpController } from "../../controllers/user-controllers/userControllers";

const router = express.Router();

// Public routes
router.post("/login", adminSignInController);
router.get("/logout", adminLogoutController); 

// Add MASTER, ADMIN, SUB_ADMIN only routes
router.get("/admin", restrictTo(["MASTER","ADMIN"]), getAllAdminsController);
router.post("/admin",restrictTo(["MASTER","ADMIN"]), adminSignUpController);
router.put("/admin/:id", restrictTo(["MASTER","ADMIN"]), updateAdminController);
router.delete("/admin/:id", restrictTo(["MASTER","ADMIN"]), deleteAdminController);

// Add USER-only routes
router.get("/user", restrictTo(["SUB_ADMIN"]), getAllAdminsController);
router.post("/user",restrictTo(["SUB_ADMIN"]), userSignUpController);
router.put("/user/:id", restrictTo(["SUB_ADMIN"]), updateUserController);
router.delete("/user/:id", restrictTo(["SUB_ADMIN"]), deleteAdminController);

export default router;
