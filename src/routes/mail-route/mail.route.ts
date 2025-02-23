import express from 'express';
import { sendMailController } from '../../controllers/mail/sendMailController';
import upload from '../../config/multerConfig';
const router = express.Router();

router.post('/upload', upload.single('file'), sendMailController);

export default router;
