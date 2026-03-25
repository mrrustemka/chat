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

  if (!chat) return <div style={{ padding: 20 }}>Loading chat... <Link to="/friends">Back</Link></div>;

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', background: '#f0f2f5' }}>
      <header style={{ padding: '15px 20px', background: 'white', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1c1e21' }}>{otherUser?.username || 'Private Chat'}</h2>
          <Link to="/friends" style={{ fontSize: '0.85rem', color: '#1877f2', textDecoration: 'none', fontWeight: 600 }}>← Friends</Link>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {error && <div style={{ background: '#ffebe8', color: '#f02849', padding: 8, textAlign: 'center', fontSize: '0.9rem' }}>{error}</div>}

          <div ref={scrollContainerRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {isLoadingMore && <div style={{ textAlign: 'center', padding: '10px 0', fontSize: '0.8rem', color: '#65676b' }}>Loading older messages...</div>}
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#8a8d91', marginTop: 100 }}>
                <p style={{ fontSize: '1.2rem' }}>No messages yet</p>
                <p>Say hi to {otherUser?.username}! 👋</p>
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
                    {msg.replyTo && (
                      <div style={{ background: 'rgba(0,0,0,0.05)', padding: '4px 8px', borderRadius: 8, fontSize: '0.75rem', marginBottom: 4, borderLeft: `3px solid ${msg.sender._id === user?.id ? 'white' : '#0084ff'}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <strong>{msg.replyTo.sender.username}</strong>: {msg.replyTo.content}
                      </div>
                    )}
                    {msg.type === 'image' && msg.file ? (
                      <div>
                        <img src={`http://localhost:5000/api/files/${msg.file}?token=${localStorage.getItem('token')}`} alt="attachment" style={{ maxWidth: '100%', borderRadius: 8, marginTop: 4, cursor: 'pointer', display: 'block' }} onClick={() => window.open(`http://localhost:5000/api/files/${msg.file}?token=${localStorage.getItem('token')}`, '_blank')} />
                        {msg.content !== 'image' && msg.content !== '' && <div style={{ marginTop: 8, wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontSize: '0.93rem' }}>{msg.content}</div>}
                      </div>
                    ) : msg.type === 'file' && msg.file ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: 8, marginTop: 4 }}>
                        <span>📄</span>
                        <a href={`http://localhost:5000/api/files/${msg.file}?token=${localStorage.getItem('token')}`} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline', fontSize: '0.85rem' }}>{msg.content}</a>
                      </div>
                    ) : (
                      <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontSize: '0.93rem', fontStyle: msg.isDeleted ? 'italic' : 'normal', opacity: msg.isDeleted ? 0.6 : 1 }}>{msg.content}</div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, fontSize: '0.65rem' }}>
                      <span style={{ opacity: 0.7 }}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {msg.isEdited && !msg.isDeleted && '(edited)'}</span>
                      <button onClick={() => setReplyTarget(msg)} style={{ background: 'none', border: 'none', color: 'inherit', padding: '0 4px', cursor: 'pointer', opacity: 0.6, fontSize: '0.75rem' }}>Reply</button>
                      {!msg.isDeleted && msg.sender._id === user?.id && <button onClick={() => handleStartEdit(msg)} style={{ background: 'none', border: 'none', color: 'inherit', padding: '0 4px', cursor: 'pointer', opacity: 0.6, fontSize: '0.75rem' }}>Edit</button>}
                      {!msg.isDeleted && msg.sender._id === user?.id && <button onClick={() => handleDelete(msg._id)} style={{ background: 'none', border: 'none', color: 'inherit', padding: '0 4px', cursor: 'pointer', opacity: 0.6, fontSize: '0.75rem' }}>Delete</button>}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSend} style={{ padding: '12px 20px', background: 'white', borderTop: '1px solid #ddd' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#f0f2f5', padding: '4px 12px', borderRadius: 20 }}>
              <input type="file" hidden ref={fileInputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingFile(f); }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} style={{ background: 'none', border: 'none', color: '#0084ff', cursor: 'pointer', fontSize: '1.2rem' }}>📎</button>
              <textarea value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); } }} placeholder="Type a message..." style={{ flex: 1, padding: '8px 0', border: 'none', background: 'transparent', outline: 'none', resize: 'none', maxHeight: 100, fontSize: '0.93rem' }} rows={1} />
              <button type="submit" disabled={(!inputText.trim() && !pendingFile) || isUploading} style={{ background: 'none', border: 'none', color: (inputText.trim() || pendingFile) ? '#0084ff' : '#bcc0c4', fontWeight: 600, cursor: 'pointer' }}>Send</button>
            </div>
            {pendingFile && <div style={{ fontSize: '0.75rem', marginTop: 4, color: '#1877f2' }}>Selected: {pendingFile.name} <span onClick={() => setPendingFile(null)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>Remove</span></div>}
          </form>
        </div>
      </div>
    </div>
  );
};
