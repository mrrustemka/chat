import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

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

  const statusColor: Record<PresenceStatus | 'unknown', string> = {
    online: '#22c55e',
    afk: '#f59e0b',
    offline: '#9ca3af',
    unknown: '#9ca3af'
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <h2>Friends</h2>

        {/* Add Friend */}
        <div style={{ marginBottom: 24, padding: 16, border: '1px solid #ccc', borderRadius: 6 }}>
          <h3 style={{ marginTop: 0 }}>Add Friend</h3>
          {message && <p style={{ color: 'green' }}>{message}</p>}
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <form onSubmit={handleSendRequest} style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Enter username..."
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value)}
              required
              style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
            />
            <button type="submit" style={{ padding: '8px 16px', cursor: 'pointer', borderRadius: 4, border: 'none', background: '#3b82f6', color: 'white' }}>
              Send Request
            </button>
          </form>
        </div>

        {/* Pending Requests */}
        {pending.length > 0 && (
          <div style={{ marginBottom: 24, padding: 16, border: '1px solid #f59e0b', borderRadius: 6 }}>
            <h3 style={{ marginTop: 0 }}>Pending Requests</h3>
            {pending.map(req => (
              <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span><strong>{req.from.username}</strong> wants to be your friend</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleAccept(req.id)} style={{ padding: '6px 12px', background: '#22c55e', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Accept</button>
                  <button onClick={() => handleDecline(req.id)} style={{ padding: '6px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Friend List */}
        <div style={{ padding: 16, border: '1px solid #ccc', borderRadius: 6 }}>
          <h3 style={{ marginTop: 0 }}>My Friends ({friends.length})</h3>
          {friends.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No friends yet. Send a request to get started!</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {friends.map(f => {
                const s = f.status ?? 'offline';
                return (
                  <li key={f.friendshipId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor[s], display: 'inline-block' }} title={s} />
                      <span><strong>{f.user.username}</strong></span>
                      <span style={{ fontSize: '0.8em', color: '#6b7280', textTransform: 'capitalize' }}>{s}</span>
                      {f.unreadCount !== undefined && f.unreadCount > 0 && (
                        <span style={{
                          backgroundColor: '#ef4444',
                          color: 'white',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          padding: '1px 6px',
                          borderRadius: '10px',
                        }}>
                          {f.unreadCount}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => navigate(`/personal-chats/${f.chatId || f.user.username}`)}
                        style={{ padding: '4px 10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.85em' }}
                      >
                        Chat
                      </button>
                      <button onClick={() => handleRemove(f.friendshipId)} style={{ padding: '4px 10px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 4, cursor: 'pointer', fontSize: '0.85em' }}>
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

