import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { emojis } from '../../utils/emojis';
import '../../shared.css';
import './ChatRoom.css';


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

  if (!room) return <div className="scroll-container">Loading room... <Link to="/rooms" className="link-back">Back</Link></div>;

  return (
    <div className="chatroom-container">
      {/* Header */}
      <header className="chatroom-header">
        <div>
          <h2 className="chatroom-title">{room.name}</h2>
          <div className="chatroom-actions">
            <Link to="/rooms" className="link-back">← All Rooms</Link>
            {(room.owner === user?.id || (typeof room.owner === 'object' && room.owner._id === user?.id) || room.admins.some(a => (typeof a === 'string' ? a === user?.id : a._id === user?.id))) && (
              <button 
                onClick={() => setShowSettingsModal(true)} 
                className="btn btn-secondary btn-settings"
              >
                ⚙️ Settings
              </button>
            )}
          </div>
        </div>
        <div className="chatroom-stats">
          {room.members.length} members
        </div>
      </header>

      <div className="flex-container-hidden">
        {/* Chat Area */}
        <div className="chat-area">
          {error && <div className="error-banner">{error}</div>}

          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="scroll-container"
          >
            {isLoadingMore && (
              <div className="loading-more">
                Loading older messages...
              </div>
            )}
            {messages.length === 0 ? (
              <div className="empty-chat">
                <h3>No messages yet</h3>
                <p>Wave hello to the room! 👋</p>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg._id} className={`message-wrapper ${msg.sender._id === user?.id ? 'sent' : 'received'}`}>
                  <div className={`message-bubble ${msg.sender._id === user?.id ? 'sent' : 'received'}`}>
                    {/* Reply Section */}
                    {msg.replyTo && (
                      <div className={`reply-preview ${msg.sender._id === user?.id ? 'sent' : 'received'}`}>
                        <strong>{msg.replyTo.sender.username}</strong>: {msg.replyTo.content}
                      </div>
                    )}

                    {msg.sender._id !== user?.id && <div className="message-sender-name">{msg.sender.username}</div>}

                    {/* Message Content by Type */}
                    {msg.type === 'image' && msg.file ? (
                      <div>
                        <img
                          src={`http://localhost:5000/api/files/${msg.file}?token=${localStorage.getItem('token')}`}
                          alt="attachment"
                          className="image-attachment-preview"
                          onClick={() => window.open(`http://localhost:5000/api/files/${msg.file}?token=${localStorage.getItem('token')}`, '_blank')}
                        />
                        {msg.content !== 'image' && msg.content !== '' && (
                          <div className="message-content">
                            {msg.content}
                          </div>
                        )}
                      </div>
                    ) : msg.type === 'file' && msg.file ? (
                      <div>
                        <div className="file-attachment-preview">
                          <span className="file-icon">📄</span>
                          <a href={`http://localhost:5000/api/files/${msg.file}?token=${localStorage.getItem('token')}`} target="_blank" rel="noreferrer" className="file-link">
                            {msg.content}
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className={`message-content ${msg.isDeleted ? 'deleted' : ''}`}>
                        {msg.content}
                      </div>
                    )}

                    <div className="message-footer">
                      <span className="message-time">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.isEdited && !msg.isDeleted && <span className="msg-edited-text">(edited)</span>}
                      </span>
                      <button
                        onClick={() => setReplyTarget(msg)}
                        className="btn-msg-action"
                      >
                        Reply
                      </button>

                      {!msg.isDeleted && msg.sender._id === user?.id && (
                        <button
                          onClick={() => handleStartEdit(msg)}
                          className="btn-msg-action"
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
                            className="btn-msg-action"
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
            <div className="reply-target-bar">
              <div className="reply-target-text">
                Replying to <strong>{replyTarget.sender.username}</strong>: {replyTarget.content}
              </div>
              <button onClick={() => setReplyTarget(null)} className="modal-close modal-close-danger">×</button>
            </div>
          )}

          {/* Edit Preview */}
          {editingMessage && (
            <div className="reply-target-bar edit-preview-wrapper">
              <div className="edit-preview-text">
                Editing your message: {editingMessage.content}
              </div>
              <button onClick={() => { setEditingMessage(null); setInputText(''); }} className="modal-close modal-close-danger">×</button>
            </div>
          )}

          {/* Attachment Preview */}
          {pendingFile && (
            <div className="preview-bar">
              <div className="file-preview-content">
                <span>📎 <strong>{pendingFile.name}</strong> ({(pendingFile.size / 1024).toFixed(1)} KB)</span>
                {pendingFile.type.startsWith('image/') && (
                  <img
                    src={URL.createObjectURL(pendingFile)}
                    alt="preview"
                    className="file-preview-image"
                  />
                )}
              </div>
              <button onClick={() => setPendingFile(null)} className="modal-close modal-close-danger">×</button>
            </div>
          )}

          {/* Input Area */}
          <footer className="chatroom-footer">
            <form onSubmit={handleSend} className="input-form">
              <div className="input-row">
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
                  className={`emoji-trigger ${pendingFile ? 'btn-emoji-trigger-active' : 'btn-emoji-trigger-disabled'}`}
                >
                  📎
                </button>

                <div className="input-actions-wrapper">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="emoji-trigger"
                  >
                    😀
                  </button>
                  {showEmojiPicker && (
                    <div className="emoji-picker-popover">
                      <div className="emoji-list">
                        {emojis.map(e => (
                          <button key={e} type="button" onClick={() => addEmoji(e)} className="emoji-btn">{e}</button>
                        ))}
                      </div>
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
                  className="message-textarea"
                  rows={Math.min(5, inputText.split('\n').length || 1)}
                />
                <button
                  type="submit"
                  disabled={(!inputText.trim() && !pendingFile) || isUploading}
                  className={`btn-send ${((inputText.trim() || pendingFile) && !isUploading) ? 'btn-send-active' : 'btn-send-disabled'}`}
                >
                  Send
                </button>
              </div>
              <div className="character-count">
                <div className="character-count-text">
                  {inputText.length} / 3000 characters
                </div>
              </div>
            </form>
          </footer>
          {/* MODALS */}
          {showSettingsModal && room && (
            <div className="modal-overlay">
              <div className="modal-content modal-content-lg">
                <div className="modal-header">
                  <h2 className="modal-title">Room Settings</h2>
                  <button onClick={() => setShowSettingsModal(false)} className="modal-close">×</button>
                </div>
                
                <div className="settings-tabs">
                  <button onClick={() => setIsAdminView(false)} className={`settings-tab ${!isAdminView ? 'active' : 'inactive'}`}>Members ({room.members.length})</button>
                  <button onClick={() => setIsAdminView(true)} className={`settings-tab ${isAdminView ? 'active' : 'inactive'}`}>Banned Users ({room.bannedUsers.length})</button>
                </div>

                {!isAdminView ? (
                  <div className="settings-list-container">
                    <ul className="settings-list">
                      {room.members.map(member => {
                        const isMemberAdmin = room.admins.some(a => (typeof a === 'string' ? a === member._id : a._id === member._id));
                        const isMemberOwner = (typeof room.owner === 'string' ? room.owner === member._id : room.owner._id === member._id);
                        return (
                          <li key={member._id} className="settings-list-item">
                            <div>
                              <span className="settings-list-name">{member.username}</span>
                              {isMemberOwner && <span className="badge badge-owner badge-owner-margin">Owner</span>}
                              {isMemberAdmin && !isMemberOwner && <span className="badge badge-admin badge-owner-margin">Admin</span>}
                            </div>
                            {member._id !== user?.id && !isMemberOwner && (
                              <button 
                                onClick={() => setSelectedMember(member)} 
                                className="settings-btn-manage"
                              >
                                Manage
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {(room.owner === user?.id || (typeof room.owner === 'object' && room.owner._id === user?.id)) && (
                      <div className="settings-danger-zone">
                        <button onClick={handleDeleteRoom} className="btn btn-danger">Delete Room</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="settings-list-container">
                    {room.bannedUsers.length === 0 ? <p className="settings-empty">No banned users.</p> : (
                      <ul className="settings-list">
                        {room.bannedUsers.map(b => (
                          <li key={b.user._id} className="settings-list-item">
                            <div>
                              <strong className="settings-list-name-strong">{b.user.username}</strong>
                              <div className="settings-list-subtext">Banned by {b.bannedBy.username} on {new Date(b.bannedAt).toLocaleDateString()}</div>
                            </div>
                            <button onClick={() => handleUnban(b.user.username)} className="settings-btn-manage">Unban</button>
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
            <div className="modal-overlay">
              <div className="modal-content modal-content-sm">
                <div className="modal-header">
                  <h3 className="modal-title">Manage {selectedMember.username}</h3>
                  <button onClick={() => setSelectedMember(null)} className="modal-close">×</button>
                </div>
                
                <div className="manage-actions-column">
                  {/* Owner actions */}
                  {(room.owner === user?.id || (typeof room.owner === 'object' && room.owner._id === user?.id)) && (
                    <button 
                      onClick={() => handleToggleAdmin(
                        selectedMember._id, 
                        selectedMember.username, 
                        room.admins.some(a => (typeof a === 'string' ? a === selectedMember._id : a._id === selectedMember._id))
                      )} 
                      className="btn btn-secondary btn-action-left"
                    >
                      {room.admins.some(a => (typeof a === 'string' ? a === selectedMember._id : a._id === selectedMember._id)) ? '🚫 Remove Admin' : '⭐ Make Admin'}
                    </button>
                  )}
                  
                  {/* Admin actions */}
                  {(room.owner === user?.id || (typeof room.owner === 'object' && room.owner._id === user?.id) || room.admins.some(a => (typeof a === 'string' ? a === user?.id : a._id === user?.id))) && selectedMember._id !== (typeof room.owner === 'string' ? room.owner : room.owner._id) && (
                    <>
                      <div className="manage-action-info">Remove: kicks user, can rejoin if public.</div>
                      <button onClick={() => handleRemoveMember(selectedMember._id)} className="btn btn-secondary btn-action-left">🚪 Remove Member</button>
                      
                      <div className="manage-action-info-danger">Ban: kicks user and prevents rejoining.</div>
                      <button onClick={() => handleBan(selectedMember.username)} className="btn btn-danger btn-action-left">🔨 Ban from Room</button>
                    </>
                  )}
                  
                  <button onClick={() => setSelectedMember(null)} className="btn btn-outline btn-action-mt">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
