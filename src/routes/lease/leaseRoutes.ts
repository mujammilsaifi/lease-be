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
  leaseTransferController,
  getAllUsersController,
  requestUndoTransferController,
  cancelUndoTransferController,
  approveUndoTransferController,
  rejectUndoTransferController,
} from "../../controllers/lease-controllers/leaseController";
import {
  saveMapping,
  getMapping,
} from "../../controllers/lease-controllers/leaseAccountMappingController";
import multer from "multer";

const upload = multer({ dest: "uploads/" });
import {
  fetchBulkCaches,
  saveBulkCaches,
} from "../../controllers/lease-controllers/leaseCalculationCacheController";
const router = express.Router();

import { extractProgressController } from "../../controllers/lease-controllers/extractProgressController";

// Lease routes
router.get("/lease/extract-progress", extractProgressController);
router.get("/lease", getLeaseController);
// Lease routes for movement
router.get("/lease/movement", getLeaseFormovementController);
router.post("/lease", leaseController);
router.post(
  "/lease/extract-pdf",
  upload.single("pdfFile"),
  async (req, res, next) => {
    try {
      const { extractPdfController } = await import(
        "../../controllers/lease-controllers/pdfExtractionController"
      );
      return extractPdfController(req, res);
    } catch (error) {
      next(error);
    }
  },
);
router.put("/lease/:id", updateLeaseController);
router.get("/users", getAllUsersController);
router.delete("/lease/:id", deleteLeaseController);
router.put("/lease-modification/:id", leaseModificationController);
router.post("/lease-transfer/:id", leaseTransferController);
router.post("/lease-transfer/request-undo/:id", requestUndoTransferController);
router.post("/lease-transfer/cancel-undo/:id", cancelUndoTransferController);
router.post("/lease-transfer/approve-undo/:id", approveUndoTransferController);
router.post("/lease-transfer/reject-undo/:id", rejectUndoTransferController);
router.get("/lease/all/logs", getAllLeaseLogsController);
router.get("/lease/:id/logs", getLeaseLogsController);

// Lease Account Mapping routes
router.get("/lease_account_mapping", getMapping);
router.post("/lease_account_mapping", saveMapping);

// Caching routes
router.post("/lease-cache/fetch-bulk", fetchBulkCaches);
router.post("/lease-cache/save-bulk", saveBulkCaches);

export default router;
