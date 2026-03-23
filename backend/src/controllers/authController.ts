import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Session from '../models/Session';
import { JWT_SECRET, AuthRequest } from '../middleware/authMiddleware';

export const register = async (req: Request, res: Response) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      if (existingUser.email === email) {
      	return res.status(409).json({ message: 'Email already exists' });
      } else {
      	return res.status(409).json({ message: 'Username already exists' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = new User({ email, username, passwordHash });
    await newUser.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // We generate a unique ID for the session first using Mongoose.
    const newSession = new Session({
      userId: user._id,
      token: 'temp', 
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days expiration
    });

    const token = jwt.sign(
      { userId: user._id, sessionId: newSession._id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    newSession.token = token;
    await newSession.save();

    res.json({
      message: 'Logged in successfully',
      token,
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

export const logout = async (req: AuthRequest, res: Response) => {
  try {
    // Only logs out the current session since we delete by sessionId
    if (req.sessionId) {
      await Session.findByIdAndDelete(req.sessionId);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error during logout' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    // Verify old password
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect old password' });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error changing password' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      // Return 200 anyway to prevent email enumeration
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    // In a real app we'd send an email. We just return a temporary reset token.
    const resetToken = jwt.sign({ userId: user._id, purpose: 'reset' }, JWT_SECRET, { expiresIn: '1h' });
    
    // Simulating sending email
    console.log(`\n=== PASSWORD RESET LINK ===\nhttp://localhost:5173/reset-password?token=${resetToken}\n===========================\n`);

    res.json({ 
      message: 'If that email exists, a reset link has been sent.',
      // Providing it in response for easy testing
      _testOnlyResetToken: resetToken 
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const resetPasswordConfirm = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string, purpose: string };
    if (decoded.purpose !== 'reset') {
      return res.status(400).json({ message: 'Invalid token purpose' });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();

    // Delete all existing sessions on password reset for security
    await Session.deleteMany({ userId: user._id });

    res.json({ message: 'Password reset successfully. All sessions have been logged out.' });
  } catch (error) {
    return res.status(400).json({ message: 'Invalid or expired reset token' });
  }
};
