import express from "express";
import { DeleteLeaseController, GetLeaseController, LeaseController, updateLeaseController } from "../../controllers/lease-controllers/leaseController";
const router = express.Router();


// Lease routes
router.get("/lease", GetLeaseController);
router.post("/lease", LeaseController);
router.put("/lease/:id", updateLeaseController);
router.delete("/lease/:id", DeleteLeaseController);

export default router;
