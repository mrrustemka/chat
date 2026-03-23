import { Response } from 'express';
import User from '../models/User';
import Friendship from '../models/Friendship';
import { AuthRequest } from '../middleware/authMiddleware';

// POST /friends/request  { username }
export const sendRequest = async (req: AuthRequest, res: Response) => {
  try {
    const requesterId = req.user!._id;
    const { username } = req.body;

    if (!username) return res.status(400).json({ message: 'Username is required' });

    const recipient = await User.findOne({ username });
    if (!recipient) return res.status(404).json({ message: 'User not found' });
    if (recipient._id.toString() === requesterId.toString()) {
      return res.status(400).json({ message: 'Cannot send request to yourself' });
    }

    // Check no existing relationship in either direction
    const existing = await Friendship.findOne({
      $or: [
        { requester: requesterId, recipient: recipient._id },
        { requester: recipient._id, recipient: requesterId }
      ]
    });
    if (existing) {
      return res.status(409).json({ message: `Friendship already exists with status: ${existing.status}` });
    }

    const friendship = new Friendship({ requester: requesterId, recipient: recipient._id });
    await friendship.save();

    res.status(201).json({ message: 'Friend request sent', id: friendship._id });
  } catch (error) {
    console.error('sendRequest error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /friends/accept/:id
export const acceptRequest = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const friendship = await Friendship.findById(req.params.id);

    if (!friendship) return res.status(404).json({ message: 'Request not found' });
    if (friendship.recipient.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    if (friendship.status !== 'pending') {
      return res.status(400).json({ message: 'Request is not pending' });
    }

    friendship.status = 'accepted';
    await friendship.save();
    res.json({ message: 'Friend request accepted' });
  } catch (error) {
    console.error('acceptRequest error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /friends/decline/:id
export const declineRequest = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const friendship = await Friendship.findById(req.params.id);

    if (!friendship) return res.status(404).json({ message: 'Request not found' });
    if (friendship.recipient.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    friendship.status = 'declined';
    await friendship.save();
    res.json({ message: 'Friend request declined' });
  } catch (error) {
    console.error('declineRequest error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /friends/:id  (id = Friendship _id)
export const removeFriend = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;
    const friendship = await Friendship.findById(req.params.id);

    if (!friendship) return res.status(404).json({ message: 'Friendship not found' });

    const isParty =
      friendship.requester.toString() === userId.toString() ||
      friendship.recipient.toString() === userId.toString();

    if (!isParty) return res.status(403).json({ message: 'Not authorized' });

    await Friendship.findByIdAndDelete(req.params.id);
    res.json({ message: 'Friend removed' });
  } catch (error) {
    console.error('removeFriend error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /friends  — returns accepted friends
export const listFriends = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;

    const friendships = await Friendship.find({
      $or: [{ requester: userId }, { recipient: userId }],
      status: 'accepted'
    }).populate('requester', 'username email').populate('recipient', 'username email');

    const friends = friendships.map(f => {
      const isRequester = f.requester._id.toString() === userId.toString();
      const friend = isRequester ? f.recipient : f.requester;
      return {
        friendshipId: f._id,
        user: friend
      };
    });

    res.json(friends);
  } catch (error) {
    console.error('listFriends error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /friends/pending — returns incoming pending requests
export const listPending = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!._id;

    const pending = await Friendship.find({
      recipient: userId,
      status: 'pending'
    }).populate('requester', 'username email');

    res.json(pending.map(f => ({
      id: f._id,
      from: f.requester,
      createdAt: f.createdAt
    })));
  } catch (error) {
    console.error('listPending error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
