import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import Session from '../models/Session';

export const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev_change_in_production';

export interface AuthRequest extends Request {
  user?: IUser;
  sessionId?: string;
  token?: string;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token as string;
    }

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string, sessionId: string };

    // Check if session exists in database (handles single-session logout)
    const session = await Session.findById(decoded.sessionId);
    if (!session || session.token !== token) {
      return res.status(401).json({ message: 'Session is invalid or expired' });
    }

    // Find user
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    req.sessionId = session.id;
    req.token = token;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
