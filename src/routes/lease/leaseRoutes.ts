import express from "express";
import {
  deleteLeaseController,
  getAllLeaseLogsController,
  getLeaseController,
  getLeaseFormovementController,
  getLeaseLogsController,
  leaseController,
  leaseModificationController,
  updateLeaseController,
} from "../../controllers/lease-controllers/leaseController";
import {
  saveMapping,
  getMapping,
} from "../../controllers/lease-controllers/leaseAccountMappingController";
const router = express.Router();

// Lease routes
router.get("/lease", getLeaseController);
// Lease routes for movement
router.get("/lease/movement", getLeaseFormovementController);
router.post("/lease", leaseController);
router.put("/lease/:id", updateLeaseController);
router.delete("/lease/:id", deleteLeaseController);
router.put("/lease-modification/:id", leaseModificationController);
router.get("/lease/all/logs", getAllLeaseLogsController);
router.get("/lease/:id/logs", getLeaseLogsController);

// Lease Account Mapping routes
router.get("/lease_account_mapping", getMapping);
router.post("/lease_account_mapping", saveMapping);

export default router;
