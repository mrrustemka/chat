import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import FileModel from '../models/File';
import Room from '../models/Room';
import PersonalChat from '../models/PersonalChat';
import { AuthRequest } from '../middleware/authMiddleware';

export const downloadFile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { id } = req.params;

    const file = await FileModel.findById(id);
    if (!file) return res.status(404).json({ message: 'File not found' });

    let hasAccess = false;

    if (file.room) {
      const room = await Room.findById(file.room);
      if (room) {
        const isMember = room.members.some(m => m.toString() === userId.toString());
        const isBanned = room.bannedUsers.some(b => b.user.toString() === userId.toString());
        
        if (room.visibility === 'public') {
          hasAccess = !isBanned;
        } else {
          hasAccess = isMember && !isBanned;
        }
      }
    } else if (file.personalChat) {
      const chat = await PersonalChat.findById(file.personalChat);
      if (chat) {
        hasAccess = chat.participants.some(p => p.toString() === userId.toString());
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const filePath = path.join(__dirname, '../../uploads', file.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found on disk' });
    }

    res.download(filePath, file.originalName);
  } catch (error) {
    console.error('downloadFile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
