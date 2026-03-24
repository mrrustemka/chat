import express from 'express';
import { authenticate } from '../middleware/authMiddleware';
import {
  getOrCreateChat,
  listChats,
  listMessages,
  sendMessage
} from '../controllers/personalChatController';

const router = express.Router();

router.use(authenticate as express.RequestHandler);

router.post('/get-or-create/:username', getOrCreateChat as express.RequestHandler);
router.get('/', listChats as express.RequestHandler);
router.get('/:id/messages', listMessages as express.RequestHandler);
router.post('/:id/messages', sendMessage as express.RequestHandler);

export default router;
