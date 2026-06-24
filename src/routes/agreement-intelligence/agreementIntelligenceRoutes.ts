import express from "express";
import { chatController } from "../../controllers/agreement-intelligence/chatController";
import { fieldsController } from "../../controllers/agreement-intelligence/fieldsController";

const router = express.Router();

router.post("/chat", chatController);
router.put("/fields", fieldsController);

export default router;
