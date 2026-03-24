import { Response } from 'express';
import Room from '../models/Room';
import { AuthRequest } from '../middleware/authMiddleware';

// POST /rooms  { name, description?, type? }
export const createRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, visibility } = req.body;
    const userId = req.user!._id;

    if (!name?.trim()) return res.status(400).json({ message: 'Room name is required' });

    const existing = await Room.findOne({ name: name.trim() });
    if (existing) return res.status(409).json({ message: 'A room with that name already exists' });

    const room = new Room({
      name: name.trim(),
      description: description?.trim(),
      visibility: visibility === 'private' ? 'private' : 'public',
      owner: userId,
      members: [userId],
      admins: [userId],
      bannedUsers: []
    });
    await room.save();

    res.status(201).json(room);
  } catch (error) {
    console.error('createRoom error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /rooms  — list all public rooms + private rooms the user is a member of
export const listRooms = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const rooms = await Room.find({
      $or: [{ visibility: 'public' }, { members: userId }]
    })
      .populate('owner', 'username')
      .sort({ createdAt: -1 });

    res.json(rooms);
  } catch (error) {
    console.error('listRooms error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /rooms/:id
export const getRoom = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const room = await Room.findById(req.params.id).populate('owner', 'username').populate('members', 'username');

    if (!room) return res.status(404).json({ message: 'Room not found' });

    // Private rooms only accessible to members
    if (room.visibility === 'private' && !room.members.some(m => m._id.toString() === userId.toString())) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(room);
  } catch (error) {
    console.error('getRoom error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /rooms/:id  — only the owner can delete
export const deleteRoom = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const room = await Room.findById(req.params.id);

    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (room.owner.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only the room owner can delete it' });
    }

    await Room.findByIdAndDelete(req.params.id);
    res.json({ message: 'Room deleted' });
  } catch (error) {
    console.error('deleteRoom error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /rooms/:id/join
export const joinRoom = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const room = await Room.findById(req.params.id);

    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (room.visibility === 'private') return res.status(403).json({ message: 'Cannot join a private room directly' });
    if (room.members.some(m => m.toString() === userId.toString())) {
      return res.status(400).json({ message: 'Already a member' });
    }
    if (room.bannedUsers.some(m => m.toString() === userId.toString())) {
      return res.status(403).json({ message: 'You are banned from this room' });
    }

    room.members.push(userId);
    await room.save();
    res.json({ message: 'Joined room successfully' });
  } catch (error) {
    console.error('joinRoom error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /rooms/:id/leave
export const leaveRoom = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const room = await Room.findById(req.params.id);

    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (room.owner.toString() === userId.toString()) {
      return res.status(400).json({ message: 'Owner cannot leave. Delete the room instead.' });
    }

    room.members = room.members.filter(m => m.toString() !== userId.toString());
    await room.save();
    res.json({ message: 'Left room successfully' });
  } catch (error) {
    console.error('leaveRoom error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
