import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Message {
  _id: string;
  content: string;
  sender: {
    _id: string;
    username: string;
  };
  createdAt: string;
}

interface Room {
  _id: string;
  name: string;
  members: { _id: string; username: string }[];
}

export const ChatRoom: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchRoom = useCallback(async () => {
    try {
      const res = await api.get(`/rooms`);
      const target = res.data.find((r: any) => r._id === id);
      if (target) setRoom(target);
    } catch (err) {
      setError('Failed to load room details');
    }
  }, [id]);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await api.get(`/rooms/${id}/messages`);
      setMessages(res.data);
    } catch (err) {
      // Might not be a member yet or banned
    }
  }, [id]);

  useEffect(() => {
    fetchRoom();
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000); // Polling for now
    return () => clearInterval(interval);
  }, [fetchRoom, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    try {
      await api.post(`/rooms/${id}/messages`, { content: inputText.trim() });
      setInputText('');
      fetchMessages();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send message');
    }
  };

  const handleAddFriend = async (username: string) => {
    const text = window.prompt(`Send friend request to ${username}? (Message optional):`);
    if (text === null) return;
    try {
      await api.post('/friends/request', { username, message: text });
      alert(`Friend request sent to ${username}`);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to send friend request');
    }
  };

  if (!room) return <div style={{ padding: 20 }}>Loading room... <Link to="/rooms">Back</Link></div>;

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', background: '#f9fafb' }}>
      {/* Header */}
      <header style={{ padding: '15px 20px', background: 'white', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>{room.name}</h2>
          <Link to="/rooms" style={{ fontSize: '0.9em', color: '#3b82f6', textDecoration: 'none' }}>← Back to Rooms</Link>
        </div>
        <div style={{ fontSize: '0.9em', color: '#6b7280' }}>
          {room.members.length} participants
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Chat Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {error && <div style={{ background: '#fee2e2', color: '#ef4444', padding: 10, textAlign: 'center' }}>{error}</div>}
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {messages.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9ca3af', marginTop: 50 }}>No messages yet. Start the conversation!</p>
            ) : (
              messages.map(msg => (
                <div key={msg._id} style={{ marginBottom: 15, display: 'flex', flexDirection: 'column', alignItems: msg.sender._id === user?.id ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '70%', padding: '10px 15px', borderRadius: 12, background: msg.sender._id === user?.id ? '#3b82f6' : 'white', color: msg.sender._id === user?.id ? 'white' : '#1f2937', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: msg.sender._id === user?.id ? 'none' : '1px solid #e5e7eb' }}>
                    {msg.sender._id !== user?.id && <div style={{ fontWeight: 'bold', fontSize: '0.8em', marginBottom: 4, color: '#6b7280' }}>{msg.sender.username}</div>}
                    <div style={{ wordBreak: 'break-word' }}>{msg.content}</div>
                    <div style={{ fontSize: '0.7em', marginTop: 4, opacity: 0.7, textAlign: 'right' }}>
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSend} style={{ padding: 20, background: 'white', borderTop: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Type a message..."
                style={{ flex: 1, padding: '12px 16px', borderRadius: 8, border: '1px solid #d1d5db', outline: 'none' }}
              />
              <button type="submit" style={{ padding: '0 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>
                Send
              </button>
            </div>
          </form>
        </div>

        {/* Sidebar */}
        <aside style={{ width: 260, background: 'white', borderLeft: '1px solid #e5e7eb', padding: 20, overflowY: 'auto' }}>
          <h3 style={{ marginTop: 0, fontSize: '1em', color: '#374151' }}>Members</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {room.members.map(member => (
              <li key={member._id} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9em', color: '#1f2937' }}>
                  {member.username} {member._id === user?.id && '(You)'}
                </span>
                {member._id !== user?.id && (
                  <button onClick={() => handleAddFriend(member.username)} style={{ background: 'none', border: '1px solid #3b82f6', color: '#3b82f6', borderRadius: 4, padding: '2px 6px', fontSize: '0.75em', cursor: 'pointer' }}>
                    + Friend
                  </button>
                )}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
};
