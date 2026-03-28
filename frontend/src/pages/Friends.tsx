import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import './Friends.css';

type PresenceStatus = 'online' | 'afk' | 'offline';

interface FriendUser {
  _id: string;
  username: string;
  email: string;
}

interface Friend {
  friendshipId: string;
  user: FriendUser;
  status?: PresenceStatus;
  unreadCount?: number;
  chatId?: string;
}

interface PendingRequest {
  id: string;
  from: FriendUser;
  createdAt: string;
}

export const Friends: React.FC = () => {
  const navigate = useNavigate();
  const { socket } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [usernameInput, setUsernameInput] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const fetchFriends = useCallback(async () => {
    try {
      const [friendsRes, chatsRes] = await Promise.all([
        api.get('/friends'),
        api.get('/personal-chats')
      ]);

      const friendsData = friendsRes.data as Friend[];
      const chatsData = chatsRes.data as any[];

      const combined = friendsData.map(f => {
        const chat = chatsData.find(c => c.participants.some((p: any) => p._id === f.user._id));
        return {
          ...f,
          chatId: chat?._id,
          unreadCount: chat?.unreadCount || 0
        };
      });

      setFriends(combined);
    } catch (err) {
      console.error('Failed to fetch friends/chats', err);
    }
  }, []);

  const fetchPending = useCallback(async () => {
    const res = await api.get('/friends/pending');
    setPending(res.data);
  }, []);

  useEffect(() => {
    fetchFriends();
    fetchPending();
  }, [fetchFriends, fetchPending]);

  useEffect(() => {
    if (!socket) return;

    const handlePresenceUpdate = (data: { userId: string, status: PresenceStatus }) => {
      setFriends(prev => prev.map(f => f.user._id === data.userId ? { ...f, status: data.status } : f));
    };

    const handleNewMessage = (data: any) => {
      if (data.personalChat) {
        setFriends(prev => prev.map(f => 
          f.chatId === data.personalChat ? { ...f, unreadCount: (f.unreadCount || 0) + 1 } : f
        ));
      }
    };

    socket.on('presenceUpdate', handlePresenceUpdate);
    socket.on('newMessage', handleNewMessage);

    return () => {
      socket.off('presenceUpdate', handlePresenceUpdate);
      socket.off('newMessage', handleNewMessage);
    };
  }, [socket]);

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await api.post('/friends/request', { username: usernameInput });
      setMessage(`Friend request sent to ${usernameInput}!`);
      setUsernameInput('');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to send request');
    }
  };

  const handleAccept = async (id: string) => {
    await api.post(`/friends/accept/${id}`);
    await fetchPending();
    await fetchFriends();
  };

  const handleDecline = async (id: string) => {
    await api.post(`/friends/decline/${id}`);
    await fetchPending();
  };

  const handleRemove = async (friendshipId: string) => {
    await api.delete(`/friends/${friendshipId}`);
    await fetchFriends();
  };

  return (
    <div className="friends-container">
      <div className="friends-content">
        <h2>Friends</h2>

        {/* Add Friend */}
        <div className="friends-card">
          <h3 className="friends-card-header">Add Friend</h3>
          {message && <p className="auth-success">{message}</p>}
          {error && <p className="auth-error">{error}</p>}
          <form onSubmit={handleSendRequest} className="friends-form-row">
            <input
              type="text"
              placeholder="Enter username..."
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value)}
              required
              className="friends-input"
            />
            <button type="submit" className="friends-btn-primary">
              Send Request
            </button>
          </form>
        </div>

        {/* Pending Requests */}
        {pending.length > 0 && (
          <div className="friends-card friends-card-pending">
            <h3 className="friends-card-header">Pending Requests</h3>
            {pending.map(req => (
              <div key={req.id} className="friends-pending-item">
                <span><strong>{req.from.username}</strong> wants to be your friend</span>
                <div className="friends-action-row">
                  <button onClick={() => handleAccept(req.id)} className="friends-btn-accept">Accept</button>
                  <button onClick={() => handleDecline(req.id)} className="friends-btn-decline">Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Friend List */}
        <div className="friends-card">
          <h3 className="friends-card-header">My Friends ({friends.length})</h3>
          {friends.length === 0 ? (
            <p className="friends-empty-text">No friends yet. Send a request to get started!</p>
          ) : (
            <ul className="friends-list">
              {friends.map(f => {
                const s = f.status ?? 'offline';
                return (
                  <li key={f.friendshipId} className="friends-list-item">
                    <div className="friends-item-info">
                      <span className={`status-dot status-dot-${s}`} title={s} />
                      <span><strong>{f.user.username}</strong></span>
                      <span className="friends-status-text">{s}</span>
                      {f.unreadCount !== undefined && f.unreadCount > 0 && (
                        <span className="friends-unread-badge">
                          {f.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="friends-action-row">
                      <button
                        onClick={() => navigate(`/personal-chats/${f.chatId || f.user.username}`)}
                        className="friends-btn-chat"
                      >
                        Chat
                      </button>
                      <button onClick={() => handleRemove(f.friendshipId)} className="friends-btn-remove">
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

