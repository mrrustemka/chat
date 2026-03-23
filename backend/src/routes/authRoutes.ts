import express from 'express';
import { 
  register, 
  login, 
  logout, 
  changePassword, 
  resetPassword,
  resetPasswordConfirm,
  getSessions,
  logoutSession
} from '../controllers/authController';
import { authenticate, AuthRequest } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', authenticate as express.RequestHandler, logout as express.RequestHandler);
router.post('/change-password', authenticate as express.RequestHandler, changePassword as express.RequestHandler);
router.post('/reset-password', resetPassword);
router.post('/reset-password-confirm', resetPasswordConfirm);

router.get('/sessions', authenticate as express.RequestHandler, getSessions as express.RequestHandler);
router.delete('/sessions/:id', authenticate as express.RequestHandler, logoutSession as express.RequestHandler);

// Simple route to check if token is valid and return current user
router.get('/me', authenticate as express.RequestHandler, (req: express.Request, res) => {
  const authReq = req as AuthRequest;
  if (authReq.user) {
    res.json({ 
      id: authReq.user._id, 
      username: authReq.user.username, 
      email: authReq.user.email 
    });
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});

export default router;
