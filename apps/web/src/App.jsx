import { useEffect, useState, createContext, useContext } from 'react';
import { api, setTokens, restoreSession } from './lib/api.js';
import { Icon } from './components/Icon.jsx';
import NotificationCenter from './components/NotificationCenter.jsx';
import Browse from './pages/Browse.jsx';
import Seller from './pages/Seller.jsx';
import Admin from './pages/Admin.jsx';
import Messages from './pages/Messages.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Auth from './pages/Auth.jsx';
import History from './pages/History.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const TABS = {
  buyer: [['dashboard', 'Overview', 'grid'], ['browse', 'Find a pet', 'search'], ['messages', 'Messages', 'chat'], ['history', 'History', 'clock']],
  seller: [['dashboard', 'Overview', 'grid'], ['seller', 'My listings', 'paw'], ['browse', 'Marketplace', 'search'], ['messages', 'Messages', 'chat'], ['history', 'History', 'clock']],
  admin: [['dashboard', 'Overview', 'grid'], ['admin', 'Moderation', 'shield'], ['browse', 'Marketplace', 'search']],
};
const PAGES = { dashboard: Dashboard, browse: Browse, seller: Seller, admin: Admin, messages: Messages, history: History };

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [toast, setToast] = useState('');
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    restoreSession().then(setUser).catch(() => setTokens(null)).finally(() => setBooting(false));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const signOut = () => {
    api.post('/auth/logout').catch(() => {});
    setTokens(null); setUser(null); setTab('dashboard');
  };
  const tabs = TABS[user?.role || 'buyer'];
  const active = tabs.some((t) => t[0] === tab) ? tab : tabs[0][0];
  const Page = PAGES[active];

  if (booting) return <main className="boot-screen"><span className="brand-mark"><Icon n="paw" s={19} /></span><span>Getting TailTribe ready…</span></main>;

  return (
    <Ctx.Provider value={{ user, setUser, notify: setToast, navigate: setTab }}>
      {!user ? <div className="auth-page"><div className="auth-brand"><span className="brand-mark"><Icon n="paw" s={19} /></span><b>tailtribe<span className="brand-dot">.</span></b><span className="auth-brand-label">A kinder way to find home</span></div><Auth onDone={(u) => { setUser(u); setTab('dashboard'); }} /></div> : (
        <div className={`app-shell app-page-${active}`}>
          <aside className="sidebar">
            <button className="brand" onClick={() => setTab('dashboard')} aria-label="TailTribe overview">
              <span className="brand-mark"><Icon n="paw" s={19} /></span><span>tailtribe<span className="brand-dot">.</span></span>
            </button>
            <div className="side-label">WORKSPACE</div>
            <nav className="side-nav" aria-label="Main navigation">
              {tabs.map(([key, label, icon]) => (
                <button key={key} className={`side-link ${active === key ? 'selected' : ''}`} onClick={() => setTab(key)}>
                  <Icon n={icon} s={18} /><span>{label}</span>
                  {key === 'admin' && <span className="side-dot" />}
                </button>
              ))}
            </nav>
            <div className="sidebar-spacer" />
            <div className="safety-card"><span className="safety-icon"><Icon n="shield" s={17} /></span><b>Meet safely</b><p>Keep chats here and meet before any payment.</p></div>
            <div className="side-profile">
              <span className="avatar">{user.name?.slice(0, 1).toUpperCase()}</span>
              <span className="profile-copy"><b>{user.name}</b><small>{user.role === 'admin' ? 'Platform admin' : user.role === 'seller' ? 'Rehomer account' : 'Adopter account'}</small></span>
              <button className="signout" onClick={signOut} title="Sign out" aria-label="Sign out"><Icon n="logout" s={17} /></button>
            </div>
          </aside>
          <div className="workspace">
            <header className="workspace-top">
              <div className="mobile-brand"><span className="brand-mark"><Icon n="paw" s={18} /></span><b>tailtribe<span className="brand-dot">.</span></b></div>
              {active === 'dashboard'
                ? <button className="landing-nav-brand" onClick={() => setTab('dashboard')}><span className="brand-mark"><Icon n="paw" s={18} /></span><b>tailtribe<span className="brand-dot">.</span></b></button>
                : <div className="breadcrumb"><span>Workspace</span><i>/</i><b>{tabs.find((t) => t[0] === active)?.[1]}</b></div>}
              <div className="top-actions">
                <span className={`account-pill ${user.kycStatus === 'Approved' ? 'verified' : ''}`} title={user.kycStatus === 'Approved' ? 'Identity checked' : 'Verification pending'} aria-label={user.kycStatus === 'Approved' ? 'Identity checked' : 'Verification pending'}><Icon n="shield" s={16} /><span>{user.kycStatus === 'Approved' ? 'Identity checked' : 'Verification pending'}</span></span>
                <NotificationCenter user={user} navigate={setTab} notify={setToast} />
                <button className="avatar top-avatar" onClick={signOut} title={`${user.name} · Sign out`} aria-label={`${user.name}, sign out`}><Icon n="user" s={17} /></button>
              </div>
            </header>
            <main className={`page-content page-${active}`}><Page /></main>
            <footer className="workspace-footer"><span>TailTribe</span><span>Identity checks verify the person, not the animal’s health or transaction outcome.</span></footer>
          </div>
        </div>
      )}
      <div className={`toast ${toast ? 'on' : ''}`} role="status">{toast}</div>
    </Ctx.Provider>
  );
}
