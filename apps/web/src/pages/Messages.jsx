import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getToken } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import { useApp } from '../App.jsx';

export default function Messages() {
  const { user, notify } = useApp();
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const socket = useRef(null);
  const end = useRef(null);

  useEffect(() => {
    api.get('/conversations').then(setConvs);
    socket.current = io('http://localhost:4001', { auth: { token: getToken() } });
    socket.current.on('message', (m) => setMessages((prev) => (prev.some((x) => x._id === m._id) ? prev : [...prev, m])));
    return () => socket.current?.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    api.get(`/conversations/${active._id}/messages`).then(setMessages);
    socket.current?.emit('join', active._id);
  }, [active]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!draft.trim()) return;
    try { await api.post(`/conversations/${active._id}/messages`, { body: draft }); setDraft(''); }
    catch (e) { notify(e.message); }
  };

  return (
    <div className="two" style={{ marginTop: 20 }}>
      <div className="panel">
        <h2>Conversations</h2>
        <p className="sub">Phone numbers and email addresses are flagged before a request is accepted.</p>
        {convs.length ? convs.map((c) => {
          const other = c.participantIds.find((p) => p._id !== user.id);
          return (
            <button key={c._id} className="card" style={{ border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%' }}
                    onClick={() => setActive(c)}>
              <div className="cb" style={{ padding: '12px 2px' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <b>{other?.name || 'Rehomer'}</b><span className="sub">{c.petId?.name}</span>
                </div>
              </div>
            </button>
          );
        }) : <div className="empty"><Icon n="chat" s={26} /><p>No conversations yet.</p></div>}
      </div>

      <div className="panel">
        {active ? (
          <>
            <h2 style={{ fontSize: 18 }}>{active.petId?.name}</h2>
            <div className="thread">
              {messages.map((m) => (
                <div key={m._id} className={`msg ${String(m.senderId) === user.id ? 'me' : ''}`}>
                  {m.body}
                  {m.moderationFlags?.includes('contact-details') && (
                    <div className="tag t-warn" style={{ marginTop: 6 }}>Contact details detected</div>
                  )}
                </div>
              ))}
              <div ref={end} />
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <input style={{ flex: 1 }} value={draft} placeholder="Write a message…"
                     onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
              <button className="btn" onClick={send}><Icon n="chat" s={16} />Send</button>
            </div>
            <div className="note" style={{ marginTop: 10 }}><Icon n="shield" s={16} />
              <span>Never send deposits before meeting the animal in person.</span>
            </div>
          </>
        ) : <div className="empty"><Icon n="chat" s={26} /><p>Select a conversation.</p></div>}
      </div>
    </div>
  );
}
