import express from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { createRoom, listRooms, getRoom, deleteRoom, joinRoom, leaveRoom, inviteToRoom } from '../controllers/roomsController';

const router = express.Router();

router.get('/', authenticate as express.RequestHandler, listRooms as express.RequestHandler);
router.post('/', authenticate as express.RequestHandler, createRoom as express.RequestHandler);
router.get('/:id', authenticate as express.RequestHandler, getRoom as express.RequestHandler);
router.delete('/:id', authenticate as express.RequestHandler, deleteRoom as express.RequestHandler);
router.post('/:id/join', authenticate as express.RequestHandler, joinRoom as express.RequestHandler);
router.post('/:id/leave', authenticate as express.RequestHandler, leaveRoom as express.RequestHandler);
router.post('/:id/invite', authenticate as express.RequestHandler, inviteToRoom as express.RequestHandler);

export default router;
