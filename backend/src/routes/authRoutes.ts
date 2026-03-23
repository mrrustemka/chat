import express from 'express';
import { 
  register, 
  login, 
  logout, 
  changePassword, 
  resetPassword,
  resetPasswordConfirm
} from '../controllers/authController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', authenticate as any, logout as any);
router.post('/change-password', authenticate as any, changePassword as any);
router.post('/reset-password', resetPassword);
router.post('/reset-password-confirm', resetPasswordConfirm);

// Simple route to check if token is valid and return current user
router.get('/me', authenticate as any, (req: any, res) => {
  if (req.user) {
    res.json({ 
      id: req.user._id, 
      username: req.user.username, 
      email: req.user.email 
    });
  } else {
    res.status(401).json({ message: 'Not authenticated' });
  }
});

export default router;
