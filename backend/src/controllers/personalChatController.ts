import { Response } from 'express';
import fs from 'fs';
import User from '../models/User';
import PersonalChat from '../models/PersonalChat';
import Message from '../models/Message';
import Friendship from '../models/Friendship';
import FileModel from '../models/File';
import LastRead from '../models/LastRead';
import { AuthRequest } from '../middleware/authMiddleware';
import { emitToUsers } from '../socketManager';

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

    const chatIds = chats.map(c => c._id);
    const lastReads = await LastRead.find({ user: userId, personalChat: { $in: chatIds } });
    const lastReadMap = new Map(lastReads.map(lr => [lr.personalChat!.toString(), lr.lastReadAt]));

    const orConditions = chats.map(c => ({
      personalChat: c._id,
      createdAt: { $gt: lastReadMap.get(c._id.toString()) || new Date(0) },
      sender: { $ne: userId }
    }));

    const unreadCountMap = new Map<string, number>();
    if (orConditions.length > 0) {
      const counts = await Message.aggregate([
        { $match: { $or: orConditions, sender: { $ne: userId } } },
        { $group: { _id: "$personalChat", count: { $sum: 1 } } }
      ]);
      counts.forEach(c => unreadCountMap.set(c._id.toString(), c.count));
    }

    const chatsWithUnread = chats.map(chat => {
      const chatIdStr = chat._id.toString();
      return {
        ...chat.toObject(),
        unreadCount: unreadCountMap.get(chatIdStr) || 0
      };
    });

    res.json(chatsWithUnread);
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

    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before as string;

    const query: any = { personalChat: id };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('sender', 'username')
      .populate({
        path: 'replyTo',
        populate: { path: 'sender', select: 'username' }
      });

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
    const populatedMessage = await message.populate('sender', 'username');

    // Emit to both participants
    emitToUsers(chat.participants.map(p => p.toString()), 'newMessage', {
      personalChat: id,
      message: populatedMessage
    });

    res.status(201).json(populatedMessage);
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
    const { comment } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    const chat = await PersonalChat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    if (!chat.participants.some(p => p.toString() === userId.toString())) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const isImage = file.mimetype.startsWith('image/');
    
    // Image size limit: 3 MB
    if (isImage && file.size > 3 * 1024 * 1024) {
      fs.unlinkSync(file.path);
      return res.status(400).json({ message: 'Image exceeds 3 MB size limit' });
    }

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
      content: comment || file.originalname,
      type: isImage ? 'image' : 'file',
      file: fileDoc._id
    });
    await message.save();
    const populatedMessage = await message.populate('sender', 'username');

    // Emit to both participants
    emitToUsers(chat.participants.map(p => p.toString()), 'newMessage', {
      personalChat: chatId,
      message: populatedMessage
    });

    res.status(201).json({ message: populatedMessage, file: fileDoc });
  } catch (error) {
    console.error('uploadFile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /personal-chats/:id/messages/:messageId
export const editMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content) return res.status(400).json({ message: 'Content is required' });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only the sender can edit this message' });
    }

    if (message.isDeleted) {
      return res.status(400).json({ message: 'Cannot edit a deleted message' });
    }

    message.content = content;
    message.isEdited = true;
    await message.save();

    res.json(message);
  } catch (error) {
    console.error('editMessage error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /personal-chats/:id/messages/:messageId
export const deleteMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only the sender can delete this message' });
    }

    message.isDeleted = true;
    message.content = '[This message was deleted]';
    await message.save();

    res.json({ message: 'Message deleted' });
  } catch (error) {
    console.error('deleteMessage error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const { id: chatId } = req.params;

    await LastRead.findOneAndUpdate(
      { user: userId, personalChat: chatId },
      { lastReadAt: new Date() },
      { upsert: true, new: true }
    );

    res.json({ message: 'Marked as read' });
  } catch (error) {
    console.error('markAsRead error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
