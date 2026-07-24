import express from "express";
import { chatController } from "../../controllers/agreement-intelligence/chatController";
import { fieldsController } from "../../controllers/agreement-intelligence/fieldsController";
import {
  assessController,
  confirmController,
  approveController,
  regenerateController,
  confirmFinancialController,
} from "../../controllers/agreement-intelligence/assessmentController";

const router = express.Router();

router.post("/chat", chatController);
router.put("/fields", fieldsController);
router.post("/assess", assessController);
router.post("/confirm", confirmController);
router.post("/approve", approveController);
router.post("/regenerate", regenerateController);
router.post("/confirm-financial", confirmFinancialController);

export default router;

