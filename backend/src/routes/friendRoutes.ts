import express from 'express';
import { authenticate } from '../middleware/authMiddleware';
import {
  sendRequest,
  acceptRequest,
  declineRequest,
  removeFriend,
  listFriends,
  listPending
} from '../controllers/friendsController';

const router = express.Router();

// All routes require authentication
router.get('/', authenticate as express.RequestHandler, listFriends as express.RequestHandler);
router.get('/pending', authenticate as express.RequestHandler, listPending as express.RequestHandler);
router.post('/request', authenticate as express.RequestHandler, sendRequest as express.RequestHandler);
router.post('/accept/:id', authenticate as express.RequestHandler, acceptRequest as express.RequestHandler);
router.post('/decline/:id', authenticate as express.RequestHandler, declineRequest as express.RequestHandler);
router.delete('/:id', authenticate as express.RequestHandler, removeFriend as express.RequestHandler);

export default router;
