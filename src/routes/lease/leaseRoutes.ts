import express from "express";
import { deleteLeaseController, deletePeriodController, getLeaseController, getLeaseFormovementController, getPeriodController, leaseController, leaseModificationController, periodController, updateLeaseController, updatePeriodController } from "../../controllers/lease-controllers/leaseController";
import { saveMapping, getMapping } from "../../controllers/lease-controllers/leaseAccountMappingController";
const router = express.Router();


// Lease routes
router.get("/lease", getLeaseController);
// Lease routes for movement
router.get("/lease/movement", getLeaseFormovementController);
router.post("/lease", leaseController);
router.put("/lease/:id", updateLeaseController);
router.delete("/lease/:id", deleteLeaseController);
router.put("/lease-modification/:id", leaseModificationController);

// Lease Account Mapping routes
router.get("/lease_account_mapping", getMapping);
router.post("/lease_account_mapping", saveMapping);

// Period routes
router.get("/period", getPeriodController);
router.post("/period", periodController);
router.put("/period/:id", updatePeriodController);
router.delete("/period/:id", deletePeriodController);

export default router;
