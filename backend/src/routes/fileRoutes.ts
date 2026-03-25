import express from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { downloadFile } from '../controllers/filesController';

const router = express.Router();

router.get('/:id', authenticate as express.RequestHandler, downloadFile as express.RequestHandler);

export default router;
