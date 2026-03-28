import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { emojis } from '../../utils/emojis';
import '../../shared.css';
import './PersonalChat.css';


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

interface Chat {
  _id: string;
  participants: { _id: string; username: string }[];
}

export const PersonalChat: React.FC = () => {
  const { id } = useParams<{ id: string }>(); // Can be chatId or username
  const { user } = useAuth();
  const [chat, setChat] = useState<Chat | null>(null);
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

  const addEmoji = (emoji: string) => {
    setInputText(prev => prev + emoji);
  };

  const fetchChat = useCallback(async () => {
    try {
      // If id looks like a Mongo ID (24 chars hex), try fetching directly, 
      // but get-or-create is safer if we came from a username link.
      let res;
      if (id && id.length === 24 && /^[0-9a-fA-F]+$/.test(id)) {
        // It's likely an ID, but we don't have a direct GET /chat/:id in the backend that populates participants properly for our needs.
        // Actually, listChats returns already populated chats. 
        // For simplicity, let's just use a hidden feature of get-or-create or just list them.
        // Wait, the backend has listChats which we can filter.
        const listRes = await api.get('/personal-chats');
        const found = (listRes.data as any[]).find(c => c._id === id);
        if (found) {
          setChat(found);
          return found._id;
        }
      }

      // Fallback or if it's a username
      res = await api.post(`/personal-chats/get-or-create/${id}`);
      // The backend response for get-or-create doesn't populate participants.
      // We might need to fetch the full list or the target user separately.
      // For now, let's just fetch the list to get names.
      const listRes = await api.get('/personal-chats');
      const found = (listRes.data as any[]).find(c => c._id === res.data._id);
      setChat(found);
      return res.data._id;
    } catch (err) {
      setError('Failed to load chat details');
      return null;
    }
  }, [id]);

  const fetchMessages = useCallback(async (chatId: string, before?: string) => {
    if (before) setIsLoadingMore(true);
    try {
      const res = await api.get(`/personal-chats/${chatId}/messages`, {
        params: { before, limit: 50 }
      });
      const fetched = res.data.reverse() as Message[];

      if (before) {
        if (fetched.length < 50) setHasMore(false);
        const container = scrollContainerRef.current;
        const oldScrollHeight = container?.scrollHeight || 0;
        setMessages(prev => [...fetched, ...prev]);
        setTimeout(() => {
          if (container) container.scrollTop = container.scrollHeight - oldScrollHeight;
        }, 0);
      } else {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m._id));
          const newOnly = fetched.filter(m => !existingIds.has(m._id));
          if (newOnly.length === 0) {
            return prev.map(p => {
              const updated = fetched.find(f => f._id === p._id);
              return updated ? { ...p, ...updated } : p;
            });
          }
          return [...prev, ...newOnly];
        });

        if (isInitialLoad.current) {
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
            isInitialLoad.current = false;
          }, 100);
        }
      }
    } catch (err) { } finally {
      if (before) setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    let interval: any;
    const init = async () => {
      const chatId = await fetchChat();
      if (chatId) {
        api.post(`/personal-chats/${chatId}/read`).catch(console.error);
        fetchMessages(chatId);
        interval = setInterval(() => fetchMessages(chatId), 3000);
      }
    };
    init();
    return () => clearInterval(interval);
  }, [fetchChat, fetchMessages, id]);

  useEffect(() => {
    if (isInitialLoad.current) return;
    const container = scrollContainerRef.current;
    if (container) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
      if (isNearBottom) {
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chat || (!inputText.trim() && !pendingFile)) return;

    try {
      if (pendingFile) {
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', pendingFile);
        if (inputText.trim()) formData.append('comment', inputText.trim());
        if (replyTarget) formData.append('replyTo', replyTarget._id);
        await api.post(`/personal-chats/${chat._id}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setPendingFile(null);
      } else if (editingMessage) {
        await api.patch(`/personal-chats/${chat._id}/messages/${editingMessage._id}`, {
          content: inputText.trim()
        });
        setEditingMessage(null);
      } else {
        await api.post(`/personal-chats/${chat._id}/messages`, {
          content: inputText.trim(),
          replyTo: replyTarget?._id
        });
      }
      setInputText('');
      setReplyTarget(null);
      fetchMessages(chat._id);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send message');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (messageId: string) => {
    if (!chat || !window.confirm('Delete this message?')) return;
    try {
      await api.delete(`/personal-chats/${chat._id}/messages/${messageId}`);
      fetchMessages(chat._id);
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
    if (chat && container && container.scrollTop === 0 && hasMore && !isLoadingMore && messages.length >= 50) {
      fetchMessages(chat._id, messages[0].createdAt);
    }
  };

  const otherUser = chat?.participants.find(p => p._id !== user?.id);

  if (!chat) return <div className="scroll-container">Loading chat... <Link to="/friends" className="link-back">Back</Link></div>;

  return (
    <div className="personal-chat-container">
      <header className="personal-chat-header">
        <div>
          <h2 className="personal-chat-title">{otherUser?.username || 'Private Chat'}</h2>
          <Link to="/friends" className="link-back">← Friends</Link>
        </div>
      </header>

      <div className="personal-chat-area">
        <div className="flex-container-col">
          {error && <div className="error-banner">{error}</div>}

          <div ref={scrollContainerRef} onScroll={handleScroll} className="scroll-container">
            {isLoadingMore && <div className="loading-more">Loading older messages...</div>}
            {messages.length === 0 ? (
              <div className="personal-chat-empty">
                <h3>No messages yet</h3>
                <p>Say hi to {otherUser?.username}! 👋</p>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg._id} className={`message-wrapper ${msg.sender._id === user?.id ? 'sent' : 'received'}`}>
                  <div className={`message-bubble ${msg.sender._id === user?.id ? 'sent' : 'received'}`}>
                    {msg.replyTo && (
                      <div className={`reply-preview ${msg.sender._id === user?.id ? 'sent' : 'received'}`}>
                        <strong>{msg.replyTo.sender.username}</strong>: {msg.replyTo.content}
                      </div>
                    )}
                    {msg.type === 'image' && msg.file ? (
                      <div>
                        <img src={`http://localhost:5000/api/files/${msg.file}?token=${localStorage.getItem('token')}`} alt="attachment" className="image-attachment-preview" onClick={() => window.open(`http://localhost:5000/api/files/${msg.file}?token=${localStorage.getItem('token')}`, '_blank')} />
                        {msg.content !== 'image' && msg.content !== '' && <div className="message-content">{msg.content}</div>}
                      </div>
                    ) : msg.type === 'file' && msg.file ? (
                      <div>
                        <div className="file-attachment-preview">
                          <span className="file-icon">📄</span>
                          <a href={`http://localhost:5000/api/files/${msg.file}?token=${localStorage.getItem('token')}`} target="_blank" rel="noreferrer" className="file-link">{msg.content}</a>
                        </div>
                      </div>
                    ) : (
                      <div className={`message-content ${msg.isDeleted ? 'deleted' : ''}`}>{msg.content}</div>
                    )}
                    <div className="message-footer">
                      <span className="message-time">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {msg.isEdited && !msg.isDeleted && '(edited)'}</span>
                      <button onClick={() => setReplyTarget(msg)} className="btn-msg-action">Reply</button>
                      {!msg.isDeleted && msg.sender._id === user?.id && <button onClick={() => handleStartEdit(msg)} className="btn-msg-action">Edit</button>}
                      {!msg.isDeleted && msg.sender._id === user?.id && <button onClick={() => handleDelete(msg._id)} className="btn-msg-action">Delete</button>}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {replyTarget && (
            <div className="reply-target-bar">
              <div className="reply-target-text">
                Replying to <strong>{replyTarget.sender.username}</strong>: {replyTarget.content}
              </div>
              <button onClick={() => setReplyTarget(null)} className="modal-close modal-close-danger">×</button>
            </div>
          )}

          <footer className="chatroom-footer">
            <form onSubmit={handleSend} className="input-form">
              <div className="input-row">
                <input type="file" hidden ref={fileInputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingFile(f); }} />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="emoji-trigger btn-emoji-trigger-active">📎</button>

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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      setShowEmojiPicker(false);
                      handleSend(e as any);
                    }
                  }}
                  placeholder="Type a message..."
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
              {pendingFile && <div className="pending-file-info">Selected: {pendingFile.name} <span onClick={() => setPendingFile(null)} className="pending-file-remove">Remove</span></div>}
            </form>
          </footer>
        </div>
      </div>
    </div>
  );
};
