import express from "express";
import { chatController } from "../../controllers/agreement-intelligence/chatController";
import { fieldsController } from "../../controllers/agreement-intelligence/fieldsController";
import {
  assessController,
  confirmController,
  approveController,
  regenerateController,
  confirmFinancialController,
  saveProgressController,
  getProgressController,
  getSavedListController,
  deleteSavedController,
} from "../../controllers/agreement-intelligence/assessmentController";

const router = express.Router();

router.post("/chat", chatController);
router.put("/fields", fieldsController);
router.post("/assess", assessController);
router.post("/confirm", confirmController);
router.post("/approve", approveController);
router.post("/regenerate", regenerateController);
router.post("/confirm-financial", confirmFinancialController);
router.post("/save-progress", saveProgressController);

// Saved assessment sessions endpoints (with aliases for frontend compatibility)
router.get("/saved-list", getSavedListController);
router.get("/saved/list", getSavedListController);

router.get("/progress/:agreementId", getProgressController);
router.get("/resume/:agreementId", getProgressController);
router.get("/saved/:agreementId", getProgressController);

router.delete("/saved/:agreementId", deleteSavedController);
router.delete("/progress/:agreementId", deleteSavedController);

export default router;


