import express from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { upload } from '../middleware/uploadMiddleware';
import {
  getOrCreateChat,
  listChats,
  listMessages,
  sendMessage,
  uploadFile,
  editMessage,
  deleteMessage
} from '../controllers/personalChatController';

const router = express.Router();

router.use(authenticate as express.RequestHandler);

router.post('/get-or-create/:username', getOrCreateChat as express.RequestHandler);
router.get('/', listChats as express.RequestHandler);
router.get('/:id/messages', listMessages as express.RequestHandler);
router.post('/:id/messages', sendMessage as express.RequestHandler);
router.post('/:id/upload', upload.single('file'), uploadFile as express.RequestHandler);
router.patch('/:id/messages/:messageId', editMessage as express.RequestHandler);
router.delete('/:id/messages/:messageId', deleteMessage as express.RequestHandler);

export default router;
