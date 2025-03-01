import express from "express";
import { DeleteLeaseController, DeletePeriodController, GetLeaseController, GetPeriodController, LeaseController, PeriodController, updateLeaseController, updatePeriodController } from "../../controllers/lease-controllers/leaseController";
const router = express.Router();


// Lease routes
router.get("/lease", GetLeaseController);
router.post("/lease", LeaseController);
router.put("/lease/:id", updateLeaseController);
router.delete("/lease/:id", DeleteLeaseController);

// Period routes
router.get("/period", GetPeriodController);
router.post("/period", PeriodController);
router.put("/period/:id", updatePeriodController);
router.delete("/period/:id", DeletePeriodController);

export default router;
