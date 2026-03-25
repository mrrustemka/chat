import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Message {
  _id: string;
  content: string;
  type: 'text' | 'image' | 'file';
  sender: {
    _id: string;
    username: string;
  };
  replyTo?: {
    _id: string;
    content: string;
    sender: {
      username: string;
    };
  };
  isEdited?: boolean;
  isDeleted?: boolean;
  file?: string;
  createdAt: string;
}

interface Room {
  _id: string;
  name: string;
  owner: string | { _id: string; username: string };
  members: { _id: string; username: string }[];
  admins: string[];
}

export const ChatRoom: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const isInitialLoad = useRef(true);

  const fetchRoom = useCallback(async () => {
    try {
      const res = await api.get(`/rooms/${id}`);
      setRoom(res.data);
    } catch (err) {
      setError('Failed to load room details');
    }
  }, [id]);

  const fetchMessages = useCallback(async (before?: string) => {
    if (before) setIsLoadingMore(true);
    try {
      const res = await api.get(`/rooms/${id}/messages`, {
        params: { before, limit: 50 }
      });
      const fetched = res.data.reverse() as Message[]; // Chronological order

      if (before) {
        if (fetched.length < 50) setHasMore(false);
        
        // Save scroll position
        const container = scrollContainerRef.current;
        const oldScrollHeight = container?.scrollHeight || 0;

        setMessages(prev => [...fetched, ...prev]);

        // Restore scroll position after render
        setTimeout(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - oldScrollHeight;
          }
        }, 0);
      } else {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m._id));
          const newOnly = fetched.filter(m => !existingIds.has(m._id));
          
          if (newOnly.length === 0) {
            // Update existing messages (for edits/deletions)
            return prev.map(p => {
              const updated = fetched.find(f => f._id === p._id);
              return updated ? { ...p, ...updated } : p;
            });
          }

          const next = [...prev, ...newOnly];
          // Keep it capped if we want, but for now just append
          return next;
        });
        
        if (isInitialLoad.current) {
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
            isInitialLoad.current = false;
          }, 100);
        }
      }
    } catch (err) {
      // Possible access denied
    } finally {
      if (before) setIsLoadingMore(false);
    }
  }, [id]);

  useEffect(() => {
    api.post(`/rooms/${id}/read`).catch(console.error);
    fetchRoom();
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchRoom, fetchMessages, id]);

  useEffect(() => {
    if (isInitialLoad.current) return;
    
    const container = scrollContainerRef.current;
    if (container) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
      if (isNearBottom) {
        // Use a small delay to ensure DOM has updated
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !pendingFile) return;

    if (inputText.length > 3000) {
      alert('Message is too long (max 3000 characters)');
      return;
    }

    try {
      if (pendingFile) {
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', pendingFile);
        if (inputText.trim()) {
          formData.append('comment', inputText.trim());
        }
        await api.post(`/rooms/${id}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setPendingFile(null);
      } else if (editingMessage) {
        await api.patch(`/rooms/${id}/messages/${editingMessage._id}`, {
          content: inputText.trim()
        });
        setEditingMessage(null);
      } else {
        await api.post(`/rooms/${id}/messages`, {
          content: inputText.trim(),
          replyTo: replyTarget?._id
        });
      }
      setInputText('');
      setReplyTarget(null);
      fetchMessages();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send message');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (messageId: string) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await api.delete(`/rooms/${id}/messages/${messageId}`);
      fetchMessages();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete message');
    }
  };

  const handleStartEdit = (msg: Message) => {
    setEditingMessage(msg);
    setInputText(msg.content);
    setReplyTarget(null);
  };

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (container && container.scrollTop === 0 && hasMore && !isLoadingMore && messages.length >= 50) {
      const oldestMessage = messages[0];
      fetchMessages(oldestMessage.createdAt);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPendingFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) {
          setPendingFile(file);
          break; // Only handle one file at a time for now
        }
      }
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
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', background: '#f0f2f5' }}>
      {/* Header */}
      <header style={{ padding: '15px 20px', background: 'white', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1c1e21' }}>{room.name}</h2>
          <Link to="/rooms" style={{ fontSize: '0.85rem', color: '#1877f2', textDecoration: 'none', fontWeight: 600 }}>← All Rooms</Link>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#65676b' }}>
          {room.members.length} members
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Chat Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {error && <div style={{ background: '#ffebe8', color: '#f02849', padding: 8, textAlign: 'center', fontSize: '0.9rem' }}>{error}</div>}

          <div 
            ref={scrollContainerRef}
            onScroll={handleScroll}
            style={{ flex: 1, overflowY: 'auto', padding: '20px' }}
          >
            {isLoadingMore && (
              <div style={{ textAlign: 'center', padding: '10px 0', fontSize: '0.8rem', color: '#65676b' }}>
                Loading older messages...
              </div>
            )}
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#8a8d91', marginTop: 100 }}>
                <p style={{ fontSize: '1.2rem' }}>No messages yet</p>
                <p>Wave hello to the room! 👋</p>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg._id} style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', alignItems: msg.sender._id === user?.id ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '75%',
                    padding: '8px 12px',
                    borderRadius: 18,
                    background: msg.sender._id === user?.id ? '#0084ff' : '#e4e6eb',
                    color: msg.sender._id === user?.id ? 'white' : '#050505',
                    position: 'relative'
                  }}>
                    {/* Reply Section */}
                    {msg.replyTo && (
                      <div style={{
                        background: 'rgba(0,0,0,0.05)',
                        padding: '4px 8px',
                        borderRadius: 8,
                        fontSize: '0.75rem',
                        marginBottom: 4,
                        borderLeft: `3px solid ${msg.sender._id === user?.id ? 'white' : '#0084ff'}`,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        <strong>{msg.replyTo.sender.username}</strong>: {msg.replyTo.content}
                      </div>
                    )}

                    {msg.sender._id !== user?.id && <div style={{ fontWeight: 600, fontSize: '0.75rem', marginBottom: 2, color: '#65676b' }}>{msg.sender.username}</div>}

                    {/* Message Content by Type */}
                    {msg.type === 'image' && msg.file ? (
                      <div>
                        <img
                          src={`http://localhost:5000/api/files/${msg.file}?token=${localStorage.getItem('token')}`}
                          alt="attachment"
                          style={{ maxWidth: '100%', borderRadius: 8, marginTop: 4, cursor: 'pointer', display: 'block' }}
                          onClick={() => window.open(`http://localhost:5000/api/files/${msg.file}?token=${localStorage.getItem('token')}`, '_blank')}
                        />
                        {msg.content !== 'image' && msg.content !== '' && (
                          <div style={{ marginTop: 8, wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontSize: '0.93rem' }}>
                            {msg.content}
                          </div>
                        )}
                      </div>
                    ) : msg.type === 'file' && msg.file ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: 8, marginTop: 4 }}>
                          <span style={{ fontSize: '1.2rem' }}>📄</span>
                          <a href={`http://localhost:5000/api/files/${msg.file}?token=${localStorage.getItem('token')}`} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline', fontSize: '0.85rem' }}>
                            {msg.content}
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div style={{ 
                        wordBreak: 'break-word', 
                        whiteSpace: 'pre-wrap', 
                        fontSize: '0.93rem',
                        fontStyle: msg.isDeleted ? 'italic' : 'normal',
                        opacity: msg.isDeleted ? 0.6 : 1
                      }}>
                        {msg.content}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, fontSize: '0.65rem' }}>
                      <span style={{ opacity: 0.7 }}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.isEdited && !msg.isDeleted && <span style={{ marginLeft: 4, fontStyle: 'italic' }}>(edited)</span>}
                      </span>
                      <button
                        onClick={() => setReplyTarget(msg)}
                        style={{ background: 'none', border: 'none', color: 'inherit', padding: '0 4px', cursor: 'pointer', opacity: 0.6, fontSize: '0.75rem' }}
                      >
                        Reply
                      </button>
                      
                      {!msg.isDeleted && msg.sender._id === user?.id && (
                        <button
                          onClick={() => handleStartEdit(msg)}
                          style={{ background: 'none', border: 'none', color: 'inherit', padding: '0 4px', cursor: 'pointer', opacity: 0.6, fontSize: '0.75rem' }}
                        >
                          Edit
                        </button>
                      )}

                      {!msg.isDeleted && (
                        msg.sender._id === user?.id || 
                        room.admins?.includes(user?.id || '') || 
                        (typeof room.owner === 'object' ? room.owner._id === user?.id : room.owner === user?.id)
                      ) && (
                        <button
                          onClick={() => handleDelete(msg._id)}
                          style={{ background: 'none', border: 'none', color: 'inherit', padding: '0 4px', cursor: 'pointer', opacity: 0.6, fontSize: '0.75rem' }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply Preview */}
          {replyTarget && (
            <div style={{ padding: '8px 20px', background: '#fff', borderTop: '1px solid #ddd', borderLeft: '4px solid #0084ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: '#65676b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Replying to <strong>{replyTarget.sender.username}</strong>: {replyTarget.content}
              </div>
              <button onClick={() => setReplyTarget(null)} style={{ background: 'none', border: 'none', color: '#f02849', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
            </div>
          )}

          {/* Edit Preview */}
          {editingMessage && (
            <div style={{ padding: '8px 20px', background: '#fff9e6', borderTop: '1px solid #ddd', borderLeft: '4px solid #f0ad4e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: '#856404', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Editing your message: {editingMessage.content}
              </div>
              <button onClick={() => { setEditingMessage(null); setInputText(''); }} style={{ background: 'none', border: 'none', color: '#f02849', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
            </div>
          )}

          {/* Attachment Preview */}
          {pendingFile && (
            <div style={{ padding: '8px 20px', background: '#e7f3ff', borderTop: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem', color: '#1877f2' }}>
                <span>📎 <strong>{pendingFile.name}</strong> ({(pendingFile.size / 1024).toFixed(1)} KB)</span>
                {pendingFile.type.startsWith('image/') && (
                  <img 
                    src={URL.createObjectURL(pendingFile)} 
                    alt="preview" 
                    style={{ height: 30, borderRadius: 4, objectFit: 'cover' }} 
                  />
                )}
              </div>
              <button onClick={() => setPendingFile(null)} style={{ background: 'none', border: 'none', color: '#f02849', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
            </div>
          )}

          {/* Input Area */}
          <form onSubmit={handleSend} style={{ padding: '12px 20px', background: 'white', borderTop: '1px solid #ddd' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <input
                type="file"
                hidden
                ref={fileInputRef}
                onChange={handleFileSelect}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                style={{ background: 'none', border: 'none', color: '#0084ff', cursor: 'pointer', fontSize: '1.5rem', padding: '4px 0' }}
              >
                📎
              </button>

              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e as any);
                  }
                }}
                placeholder={isUploading ? "Uploading..." : "Type a message..."}
                disabled={isUploading}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 20,
                  border: 'none',
                  background: '#f0f2f5',
                  outline: 'none',
                  resize: 'none',
                  maxHeight: 120,
                  fontSize: '0.93rem',
                  fontFamily: 'inherit'
                }}
                rows={1}
              />
              <button
                type="submit"
                disabled={(!inputText.trim() && !pendingFile) || isUploading}
                style={{
                  background: 'none',
                  border: 'none',
                  color: ((inputText.trim() || pendingFile) && !isUploading) ? '#0084ff' : '#bcc0c4',
                  cursor: ((inputText.trim() || pendingFile) && !isUploading) ? 'pointer' : 'default',
                  fontWeight: 600,
                  fontSize: '1rem',
                  padding: '8px 0'
                }}
              >
                Send
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <div style={{ fontSize: '0.65rem', color: '#65676b' }}>
                {inputText.length} / 3000 characters
              </div>
            </div>
          </form>
        </div>

        {/* Sidebar */}
        <aside style={{ width: 280, background: 'white', borderLeft: '1px solid #ddd', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '1rem', color: '#65676b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Room Members</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {room.members.map(member => (
                <li key={member._id} style={{ padding: '8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e4e6eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 600 }}>
                      {member.username[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize: '0.93rem', fontWeight: 500, color: '#050505' }}>
                      {member.username} {member._id === user?.id && '(You)'}
                    </span>
                  </div>
                  {member._id !== user?.id && (
                    <button
                      onClick={() => handleAddFriend(member.username)}
                      title="Add Friend"
                      style={{ background: '#e7f3ff', border: 'none', color: '#1877f2', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1.1rem' }}
                    >
                      +
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
};
