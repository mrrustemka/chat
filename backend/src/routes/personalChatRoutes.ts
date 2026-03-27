import express from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { upload, handleUploadError } from '../middleware/uploadMiddleware';
import {
  getOrCreateChat,
  listChats,
  listMessages,
  sendMessage,
  uploadFile,
  editMessage,
  deleteMessage,
  markAsRead
} from '../controllers/personalChatController';

const router = express.Router();

router.use(authenticate as express.RequestHandler);

router.post('/get-or-create/:username', getOrCreateChat as express.RequestHandler);
router.get('/', listChats as express.RequestHandler);
router.get('/:id/messages', listMessages as express.RequestHandler);
router.post('/:id/messages', sendMessage as express.RequestHandler);
router.post('/:id/upload', handleUploadError as express.RequestHandler, uploadFile as express.RequestHandler);
router.patch('/:id/messages/:messageId', editMessage as express.RequestHandler);
router.delete('/:id/messages/:messageId', deleteMessage as express.RequestHandler);
router.post('/:id/read', markAsRead as express.RequestHandler);

export default router;
