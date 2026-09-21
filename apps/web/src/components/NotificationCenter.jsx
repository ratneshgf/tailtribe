import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getToken } from '../lib/api.js';
import { Icon } from './Icon.jsx';

const stamp = (value) => value ? new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
}).format(new Date(value)) : '';

export default function NotificationCenter({ user, navigate, notify }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const unread = items.filter((item) => !item.readAt).length;

  useEffect(() => {
    let active = true;
    api.get('/notifications').then((data) => { if (active) setItems(data.items || []); }).catch(() => {});
    const socketOrigin = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? 'http://localhost:4001' : window.location.origin);
    const socket = io(socketOrigin, { auth: { token: getToken() } });
    socket.on('notification:new', (item) => {
      if (active) setItems((current) => [item, ...current.filter((entry) => String(entry.id || entry._id) !== String(item.id || item._id))].slice(0, 40));
    });
    return () => { active = false; socket.disconnect(); };
  }, [user.id]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    const closeOnEscape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const markAllRead = async () => {
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || readAt })));
    try { await api.patch('/notifications/read-all', {}); }
    catch (error) { notify(error.message); }
  };

  const openItem = async (item) => {
    const id = item.id || item._id;
    if (!item.readAt) {
      setItems((current) => current.map((entry) => String(entry.id || entry._id) === String(id) ? { ...entry, readAt: new Date().toISOString() } : entry));
      api.patch(`/notifications/${id}/read`, {}).catch((error) => notify(error.message));
    }
    setOpen(false);
    navigate(item.targetTab || 'dashboard');
  };

  return (
    <div className="notification-center" ref={root}>
      <button className={`notification-trigger ${open ? 'is-open' : ''}`} onClick={() => setOpen((value) => !value)} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open}>
        <Icon n="bell" s={17} />
        {unread > 0 && <span className="notification-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <section className="notification-popover" aria-label="Notifications">
          <header className="notification-heading">
            <div><b>Notifications</b><small>{unread ? `${unread} unread` : 'You are all caught up'}</small></div>
            {unread > 0 && <button onClick={markAllRead}>Mark all read</button>}
          </header>
          <div className="notification-list">
            {items.length ? items.map((item) => (
              <button className={`notification-item ${item.readAt ? '' : 'unread'}`} key={item.id || item._id} onClick={() => openItem(item)}>
                <span className="notification-dot"><Icon n={item.targetTab === 'messages' ? 'chat' : item.targetTab === 'admin' ? 'shield' : 'paw'} s={15} /></span>
                <span className="notification-copy"><b>{item.title}</b><span>{item.body}</span><small>{stamp(item.createdAt)}</small></span>
                {!item.readAt && <i aria-label="Unread" />}
              </button>
            )) : <div className="notification-empty"><span><Icon n="bell" s={18} /></span><b>No notifications yet</b><small>Updates about listings, requests, and messages will appear here.</small></div>}
          </div>
        </section>
      )}
    </div>
  );
}
