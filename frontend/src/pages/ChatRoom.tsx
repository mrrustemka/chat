import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { emojis } from '../utils/emojis';


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
  description?: string;
  visibility: 'public' | 'private';
  owner: { _id: string; username: string } | string;
  members: { _id: string; username: string }[];
  admins: ({ _id: string; username: string } | string)[];
  bannedUsers: {
    user: { _id: string; username: string };
    bannedBy: { _id: string; username: string };
    bannedAt: string;
  }[];
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<{ _id: string; username: string } | null>(null);
  const [isAdminView, setIsAdminView] = useState(false); // To toggle between members and banned users in settings

  const addEmoji = (emoji: string) => {
    setInputText(prev => prev + emoji);
  };

  const fetchRoom = useCallback(async () => {
    try {
      const res = await api.get(`/rooms/${id}`);
      setRoom(res.data);
    } catch (_err) {
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
    } catch (_err) {
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

  const handleBan = async (username: string) => {
    if (!room) return;
    try {
      await api.post(`/rooms/${room._id}/ban`, { username });
      fetchRoom();
      setSelectedMember(null);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to ban user');
    }
  };

  const handleUnban = async (username: string) => {
    if (!room) return;
    try {
      await api.post(`/rooms/${room._id}/unban`, { username });
      fetchRoom();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to unban user');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!room) return;
    try {
      await api.delete(`/rooms/${room._id}/members/${userId}`);
      fetchRoom();
      setSelectedMember(null);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to remove member');
    }
  };

  const handleToggleAdmin = async (userId: string, username: string, isAdmin: boolean) => {
    if (!room) return;
    try {
      if (isAdmin) {
        await api.delete(`/rooms/${room._id}/admins/${userId}`);
      } else {
        await api.post(`/rooms/${room._id}/admins`, { username });
      }
      fetchRoom();
      setSelectedMember(null);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to toggle admin status');
    }
  };

  const handleDeleteRoom = async () => {
    if (!room || !window.confirm('Are you sure you want to delete this room and all its messages? This cannot be undone.')) return;
    try {
      await api.delete(`/rooms/${room._id}`);
      window.location.href = '/rooms';
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete room');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!room || !window.confirm('Delete this message?')) return;
    try {
      await api.delete(`/rooms/${room._id}/messages/${messageId}`);
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, isDeleted: true, content: '[This message was deleted]' } : m));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete message');
    }
  };

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
        if (replyTarget) {
          formData.append('replyTo', replyTarget._id);
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

  if (!room) return <div style={{ padding: 20 }}>Loading room... <Link to="/rooms">Back</Link></div>;

  return (
    <div style={{ display: 'flex', height: '100%', flex: 1, flexDirection: 'column', background: '#f0f2f5' }}>
      {/* Header */}
      <header style={{ padding: '15px 20px', background: 'white', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1c1e21' }}>{room.name}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <Link to="/rooms" style={{ fontSize: '0.85rem', color: '#1877f2', textDecoration: 'none', fontWeight: 600 }}>← All Rooms</Link>
            {(room.owner === user?.id || (typeof room.owner === 'object' && room.owner._id === user?.id) || room.admins.some(a => (typeof a === 'string' ? a === user?.id : a._id === user?.id))) && (
              <button 
                onClick={() => setShowSettingsModal(true)} 
                style={{ background: '#f0f2f5', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem', color: '#65676b', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                ⚙️ Settings
              </button>
            )}
          </div>
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
                        room.admins.some(a => (typeof a === 'string' ? a === user?.id : a._id === user?.id)) ||
                        (typeof room.owner === 'object' ? room.owner._id === user?.id : room.owner === user?.id)
                      ) && (
                          <button
                            onClick={() => handleDeleteMessage(msg._id)}
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

              <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', padding: '4px 0' }}
                >
                  😀
                </button>
                {showEmojiPicker && (
                  <div style={{ position: 'absolute', bottom: '100%', left: 0, background: 'white', border: '1px solid #ddd', borderRadius: 8, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5, boxShadow: '0 -2px 10px rgba(0,0,0,0.1)', zIndex: 10, width: 220, maxHeight: 200, overflowY: 'auto' }}>
                    {emojis.map(e => (
                      <span key={e} onClick={() => addEmoji(e)} style={{ cursor: 'pointer', fontSize: '1.2rem', padding: 4, textAlign: 'center' }}>{e}</span>
                    ))}
                  </div>
                )}
              </div>

              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    setShowEmojiPicker(false);
                    handleSend(e as any);
                  }
                }}
                placeholder={isUploading ? "Uploading..." : "Type a message..."}
                disabled={isUploading}
                style={{
                  flex: 1,
                  padding: '10px 15px',
                  borderRadius: 20,
                  border: 'none',
                  background: '#f0f2f5',
                  outline: 'none',
                  resize: 'none',
                  maxHeight: 150,
                  fontSize: '0.93rem',
                  fontFamily: 'inherit',
                  lineHeight: '1.4'
                }}
                rows={Math.min(5, inputText.split('\n').length || 1)}
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
          {/* MODALS */}
          {showSettingsModal && room && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div style={{ background: 'white', width: 500, borderRadius: 8, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: 10, marginBottom: 15 }}>
                  <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Room Settings</h2>
                  <button onClick={() => setShowSettingsModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#65676b' }}>×</button>
                </div>
                
                <div style={{ display: 'flex', gap: 20, marginBottom: 15, borderBottom: '1px solid #eee' }}>
                  <button onClick={() => setIsAdminView(false)} style={{ paddingBottom: 8, border: 'none', background: 'none', borderBottom: !isAdminView ? '3px solid #1877f2' : 'none', color: !isAdminView ? '#1877f2' : '#65676b', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>Members ({room.members.length})</button>
                  <button onClick={() => setIsAdminView(true)} style={{ paddingBottom: 8, border: 'none', background: 'none', borderBottom: isAdminView ? '3px solid #1877f2' : 'none', color: isAdminView ? '#1877f2' : '#65676b', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>Banned Users ({room.bannedUsers.length})</button>
                </div>

                {!isAdminView ? (
                  <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {room.members.map(member => {
                        const isMemberAdmin = room.admins.some(a => (typeof a === 'string' ? a === member._id : a._id === member._id));
                        const isMemberOwner = (typeof room.owner === 'string' ? room.owner === member._id : room.owner._id === member._id);
                        return (
                          <li key={member._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f2f5' }}>
                            <div>
                              <span style={{ fontWeight: 500, color: '#050505' }}>{member.username}</span>
                              {isMemberOwner && <span style={{ marginLeft: 8, fontSize: '0.7rem', background: '#e7f3ff', color: '#1877f2', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>Owner</span>}
                              {isMemberAdmin && !isMemberOwner && <span style={{ marginLeft: 8, fontSize: '0.7rem', background: '#f0f2f5', color: '#65676b', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>Admin</span>}
                            </div>
                            {member._id !== user?.id && !isMemberOwner && (
                              <button 
                                onClick={() => setSelectedMember(member)} 
                                style={{ color: '#1877f2', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                              >
                                Manage
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {(room.owner === user?.id || (typeof room.owner === 'object' && room.owner._id === user?.id)) && (
                      <div style={{ marginTop: 20, borderTop: '1px solid #eee', paddingTop: 15 }}>
                        <button onClick={handleDeleteRoom} style={{ background: '#f02849', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>Delete Room</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                    {room.bannedUsers.length === 0 ? <p style={{ textAlign: 'center', color: '#65676b', padding: '20px 0' }}>No banned users.</p> : (
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {room.bannedUsers.map(b => (
                          <li key={b.user._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f2f5' }}>
                            <div>
                              <strong style={{ color: '#050505' }}>{b.user.username}</strong>
                              <div style={{ fontSize: '0.7rem', color: '#65676b', marginTop: 2 }}>Banned by {b.bannedBy.username} on {new Date(b.bannedAt).toLocaleDateString()}</div>
                            </div>
                            <button onClick={() => handleUnban(b.user.username)} style={{ color: '#1877f2', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Unban</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedMember && room && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
              <div style={{ background: 'white', width: 350, borderRadius: 8, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: 10, marginBottom: 15 }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Manage {selectedMember.username}</h3>
                  <button onClick={() => setSelectedMember(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#65676b' }}>×</button>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Owner actions */}
                  {(room.owner === user?.id || (typeof room.owner === 'object' && room.owner._id === user?.id)) && (
                    <button 
                      onClick={() => handleToggleAdmin(
                        selectedMember._id, 
                        selectedMember.username, 
                        room.admins.some(a => (typeof a === 'string' ? a === selectedMember._id : a._id === selectedMember._id))
                      )} 
                      style={{ padding: '10px 12px', background: '#f0f2f5', border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left', fontWeight: 500, fontSize: '0.9rem' }}
                    >
                      {room.admins.some(a => (typeof a === 'string' ? a === selectedMember._id : a._id === selectedMember._id)) ? '🚫 Remove Admin' : '⭐ Make Admin'}
                    </button>
                  )}
                  
                  {/* Admin actions */}
                  {(room.owner === user?.id || (typeof room.owner === 'object' && room.owner._id === user?.id) || room.admins.some(a => (typeof a === 'string' ? a === user?.id : a._id === user?.id))) && selectedMember._id !== (typeof room.owner === 'string' ? room.owner : room.owner._id) && (
                    <>
                      <div style={{ padding: '4px 0', fontSize: '0.75rem', color: '#65676b' }}>Remove: kicks user, can rejoin if public.</div>
                      <button onClick={() => handleRemoveMember(selectedMember._id)} style={{ padding: '10px 12px', background: '#f0f2f5', border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left', fontWeight: 500, fontSize: '0.9rem' }}>🚪 Remove Member</button>
                      
                      <div style={{ padding: '4px 0', fontSize: '0.75rem', color: '#65676b', marginTop: 4 }}>Ban: kicks user and prevents rejoining.</div>
                      <button onClick={() => handleBan(selectedMember.username)} style={{ padding: '10px 12px', background: '#f02849', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left', fontWeight: 600, fontSize: '0.9rem' }}>🔨 Ban from Room</button>
                    </>
                  )}
                  
                  <button onClick={() => setSelectedMember(null)} style={{ padding: '10px 12px', background: 'none', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', marginTop: 4, fontWeight: 500, fontSize: '0.9rem' }}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
