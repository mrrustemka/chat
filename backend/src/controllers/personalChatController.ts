import { Response } from 'express';
import User from '../models/User';
import PersonalChat from '../models/PersonalChat';
import Message from '../models/Message';
import Friendship from '../models/Friendship';
import FileModel from '../models/File';
import { AuthRequest } from '../middleware/authMiddleware';

// POST /personal-chats/get-or-create/:username
export const getOrCreateChat = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { username } = req.params;

    const targetUser = await User.findOne({ username });
    if (!targetUser) return res.status(404).json({ message: 'User not found' });
    if (targetUser._id.toString() === userId.toString()) {
      return res.status(400).json({ message: 'Cannot chat with yourself' });
    }

    // Sort IDs to ensure consistent participant list
    const participants = [userId, targetUser._id].sort();

    let chat = await PersonalChat.findOne({
      participants: { $all: participants, $size: 2 }
    });

    if (!chat) {
      chat = new PersonalChat({ participants });
      await chat.save();
    }

    res.json(chat);
  } catch (error) {
    console.error('getOrCreateChat error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /personal-chats
export const listChats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;

    const chats = await PersonalChat.find({
      participants: userId
    }).populate('participants', 'username email');

    res.json(chats);
  } catch (error) {
    console.error('listChats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /personal-chats/:id/messages
export const listMessages = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { id } = req.params;

    const chat = await PersonalChat.findById(id);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    if (!chat.participants.some(p => p.toString() === userId.toString())) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const messages = await Message.find({ personalChat: id })
      .populate('sender', 'username')
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    console.error('listMessages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /personal-chats/:id/messages
export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { id } = req.params;
    const { content, type, replyTo } = req.body;

    if (!content) return res.status(400).json({ message: 'Content is required' });

    // Max 3 KB
    if (Buffer.byteLength(content, 'utf8') > 3072) {
      return res.status(400).json({ message: 'Message exceeds 3 KB size limit' });
    }

    const chat = await PersonalChat.findById(id);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    if (!chat.participants.some(p => p.toString() === userId.toString())) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const otherMemberId = chat.participants.find(p => p.toString() !== userId.toString());
    if (!otherMemberId) return res.status(400).json({ message: 'Invalid chat participants' });

    // 1. Check Friendship
    const friendship = await Friendship.findOne({
      $or: [
        { requester: userId, recipient: otherMemberId },
        { requester: otherMemberId, recipient: userId }
      ],
      status: 'accepted'
    });

    if (!friendship) {
      return res.status(403).json({ message: 'You must be friends to exchange messages' });
    }

    // 2. Check Bans
    const me = await User.findById(userId);
    const other = await User.findById(otherMemberId);

    if (me?.bannedUsers.some(bid => bid.toString() === otherMemberId.toString())) {
      return res.status(403).json({ message: 'You have banned this user' });
    }
    if (other?.bannedUsers.some(bid => bid.toString() === userId.toString())) {
      return res.status(403).json({ message: 'This user has banned you' });
    }

    const message = new Message({
      personalChat: id,
      sender: userId,
      content,
      type: type || 'text',
      replyTo: replyTo || undefined
    });

    await message.save();
    res.status(201).json(message);
  } catch (error) {
    console.error('sendMessage error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /personal-chats/:id/upload
export const uploadFile = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { id: chatId } = req.params;
    const file = req.file;

    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    const chat = await PersonalChat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    if (!chat.participants.some(p => p.toString() === userId.toString())) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const isImage = file.mimetype.startsWith('image/');

    // 1. Create File record
    const fileDoc = new FileModel({
      originalName: file.originalname,
      filename: file.filename,
      path: file.path,
      personalChat: chatId as any,
      uploader: userId as any,
      size: file.size,
      mimetype: file.mimetype
    });
    await fileDoc.save();

    // 2. Create Message record
    const message = new Message({
      personalChat: chatId,
      sender: userId,
      content: file.originalname,
      type: isImage ? 'image' : 'file'
    });
    await message.save();

    res.status(201).json({ message, file: fileDoc });
  } catch (error) {
    console.error('uploadFile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
