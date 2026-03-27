import express from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { upload, handleUploadError } from '../middleware/uploadMiddleware';
import { createRoom, listRooms, getRoom, deleteRoom, joinRoom, leaveRoom, inviteToRoom, banUser, unbanUser, removeMember, addAdmin, removeAdmin, deleteMessage, editMessage, listMessages, sendMessage, uploadFile, markAsRead } from '../controllers/roomsController';

const router = express.Router();

router.get('/', authenticate as express.RequestHandler, listRooms as express.RequestHandler);
router.post('/', authenticate as express.RequestHandler, createRoom as express.RequestHandler);
router.get('/:id', authenticate as express.RequestHandler, getRoom as express.RequestHandler);
router.get('/:id/messages', authenticate as express.RequestHandler, listMessages as express.RequestHandler);
router.post('/:id/messages', authenticate as express.RequestHandler, sendMessage as express.RequestHandler);
router.post('/:id/upload', authenticate as express.RequestHandler, handleUploadError as express.RequestHandler, uploadFile as express.RequestHandler);
router.delete('/:id', authenticate as express.RequestHandler, deleteRoom as express.RequestHandler);
router.post('/:id/join', authenticate as express.RequestHandler, joinRoom as express.RequestHandler);
router.post('/:id/leave', authenticate as express.RequestHandler, leaveRoom as express.RequestHandler);
router.post('/:id/invite', authenticate as express.RequestHandler, inviteToRoom as express.RequestHandler);
router.post('/:id/ban', authenticate as express.RequestHandler, banUser as express.RequestHandler);
router.post('/:id/unban', authenticate as express.RequestHandler, unbanUser as express.RequestHandler);
router.delete('/:id/members/:userId', authenticate as express.RequestHandler, removeMember as express.RequestHandler);
router.post('/:id/admins', authenticate as express.RequestHandler, addAdmin as express.RequestHandler);
router.delete('/:id/admins/:adminId', authenticate as express.RequestHandler, removeAdmin as express.RequestHandler);
router.patch('/:id/messages/:messageId', authenticate as express.RequestHandler, editMessage as express.RequestHandler);
router.delete('/:id/messages/:messageId', authenticate as express.RequestHandler, deleteMessage as express.RequestHandler);
router.post('/:id/read', authenticate as express.RequestHandler, markAsRead as express.RequestHandler);

export default router;
