import { useCallback, useEffect, useRef, useState } from 'react';
import { api, setTokens } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';

export default function Auth({ onDone }) {
  const [mode, setMode] = useState(() => new URLSearchParams(window.location.search).has('resetToken') ? 'reset' : 'login');
  const [adminLogin, setAdminLogin] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'buyer', setupKey: '' });
  const [err, setErr] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const adminRegistration = mode === 'admin-register';

  const submit = async () => {
    setErr('');
    if (['login', 'register', 'admin-register', 'forgot'].includes(mode) && !form.email.trim()) return setErr('Enter your email address');
    if (['login', 'register', 'admin-register', 'reset'].includes(mode) && !form.password) return setErr('Enter your password');
    if (['register', 'admin-register'].includes(mode) && !form.name.trim()) return setErr('Your name is required');
    if (adminRegistration && !form.setupKey.trim()) return setErr('Enter the admin setup key');
    setBusy(true);
    try {
      if (mode === 'forgot') {
        setNotice((await api.post('/auth/forgot-password', { email: form.email.trim() })).message);
      } else if (mode === 'reset') {
        const token = new URLSearchParams(window.location.search).get('resetToken');
        setNotice((await api.post('/auth/reset-password', { token, password: form.password })).message);
        setForm({ ...form, password: '' }); setMode('login'); window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        const path = mode === 'login' ? '/auth/login' : adminRegistration ? '/auth/register-admin' : '/auth/register';
        const payload = mode === 'login' ? { email: form.email.trim(), password: form.password } : { ...form, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() };
        const { user, accessToken } = await api.post(path, payload);
        if (mode === 'login' && adminLogin && user.role !== 'admin') {
          await api.post('/auth/logout').catch(() => {});
          return setErr('This email does not have administrator access. Use your admin account.');
        }
        setTokens({ accessToken }); onDone(user);
      }
    } catch (error) { setErr(error.message); } finally { setBusy(false); }
  };
  const switchMode = () => { setErr(''); setNotice(''); setMode(mode === 'login' ? 'register' : 'login'); setAdminLogin(false); };
  const googleSignIn = useCallback(async (credential) => {
    setErr(''); setBusy(true);
    try { const { user, accessToken } = await api.post('/auth/google', { credential }); setTokens({ accessToken }); onDone(user); }
    catch (error) { setErr(error.message); } finally { setBusy(false); }
  }, [onDone]);
  const heading = mode === 'login' ? (adminLogin ? 'Admin sign in' : 'Sign in') : mode === 'register' ? 'Create an account' : adminRegistration ? 'Create administrator account' : mode === 'forgot' ? 'Forgot password?' : 'Choose a new password';
  const subtext = mode === 'login' ? (adminLogin ? 'Use the email and password assigned to your TailTribe administrator account.' : 'Welcome back. Sign in to continue securely.') : mode === 'register' ? 'Create your secure TailTribe account.' : adminRegistration ? 'Create the first administrator account using your private setup key.' : mode === 'forgot' ? 'Enter your account email and we’ll send a secure reset link.' : 'Set a new password for your account.';

  return <section className="hero"><div><h1>Adopt with <em>evidence</em>,<br />not guesswork.</h1><p>Every rehomer is identity-checked, every listing is moderated before it goes public, and contact details stay private until both sides agree.</p><div className="trust">{[['shield', 'KYC-verified rehomers'], ['doc', 'Moderated listings'], ['chat', 'Private in-app chat'], ['clock', 'Reservation holds']].map(([name, text]) => <span className="chipline" key={text}><Icon n={name} s={15} />{text}</span>)}</div></div>
    <div className="panel"><h2>{heading}</h2><p className="sub">{subtext}</p>
      {mode === 'login' && <div className="auth-login-type" aria-label="Choose sign-in type"><button type="button" className={!adminLogin ? 'active' : ''} onClick={() => { setAdminLogin(false); setErr(''); }}>Member sign in</button><button type="button" className={adminLogin ? 'active' : ''} onClick={() => { setAdminLogin(true); setErr(''); }}>Admin login</button></div>}
      {['register', 'admin-register'].includes(mode) && <><div className="field"><label>Name</label><input autoComplete="name" value={form.name} onChange={set('name')} /></div>{mode === 'register' && <div className="field"><label>I want to</label><select value={form.role} onChange={set('role')}><option value="buyer">Adopt or buy</option><option value="seller">Rehome a pet</option></select></div>}<div className="field"><label>Phone <span className="muted">(optional)</span></label><input type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} /></div></>}
      {['login', 'register', 'admin-register', 'forgot'].includes(mode) && <div className="field"><label>Email</label><input type="email" autoComplete="email" value={form.email} onChange={set('email')} onKeyDown={(event) => event.key === 'Enter' && !busy && submit()} /></div>}
      {['login', 'register', 'admin-register', 'reset'].includes(mode) && <div className="field"><label>Password</label><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={set('password')} onKeyDown={(event) => event.key === 'Enter' && !busy && submit()} /></div>}
      {adminRegistration && <div className="field"><label>Admin setup key</label><input type="password" autoComplete="off" value={form.setupKey} onChange={set('setupKey')} onKeyDown={(event) => event.key === 'Enter' && !busy && submit()} /></div>}
      {['register', 'admin-register', 'reset'].includes(mode) && <p className="auth-hint">Use at least 8 characters with uppercase, lowercase and a number.</p>}{notice && <div className="tag t-ok" style={{ marginBottom: 10 }}>{notice}</div>}{err && <div className="tag t-bad" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="fl"><button className="btn coral" disabled={busy} onClick={submit}>{busy ? 'Please wait…' : mode === 'login' ? (adminLogin ? 'Admin sign in' : 'Sign in') : ['register', 'admin-register'].includes(mode) ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Update password'}</button>{['login', 'register'].includes(mode) && <button className="btn alt" disabled={busy} onClick={switchMode}>{mode === 'login' ? 'Create account' : 'I have an account'}</button>}</div>
      {['login', 'register'].includes(mode) && !adminLogin && <GoogleButton onCredential={googleSignIn} onError={setErr} disabled={busy} />}{mode === 'login' && <button className="auth-link" onClick={() => { setErr(''); setNotice(''); setMode('forgot'); }}>Forgot password?</button>}{mode === 'login' && adminLogin && <button className="auth-link admin-create-link" onClick={() => { setErr(''); setNotice(''); setMode('admin-register'); }}>Create first admin account</button>}{mode === 'admin-register' && <button className="auth-link" onClick={() => { setErr(''); setNotice(''); setMode('login'); setAdminLogin(true); }}>Back to Admin login</button>}{mode === 'forgot' && <button className="auth-link" onClick={() => { setErr(''); setNotice(''); setMode('login'); }}>Back to sign in</button>}
    </div></section>;
}

function GoogleButton({ onCredential, onError, disabled }) {
  const target = useRef(null); const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  useEffect(() => { if (!clientId || !target.current) return undefined; const render = () => { if (!window.google?.accounts?.id || !target.current) return; target.current.replaceChildren(); window.google.accounts.id.initialize({ client_id: clientId, callback: ({ credential }) => onCredential(credential), ux_mode: 'popup' }); window.google.accounts.id.renderButton(target.current, { theme: 'outline', size: 'large', width: 360, text: 'continue_with', shape: 'rectangular', logo_alignment: 'left' }); }; const existing = document.querySelector('script[data-tailtribe-google]'); if (existing) { existing.addEventListener('load', render); render(); return () => existing.removeEventListener('load', render); } const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.defer = true; script.dataset.tailtribeGoogle = 'true'; script.onload = render; script.onerror = () => onError('Google sign-in could not load. Check your connection and try again.'); document.head.appendChild(script); return () => { script.onload = null; script.onerror = null; }; }, [clientId, onCredential, onError]);
  if (!clientId) return <p className="google-setup-note">Google sign-in needs a Google Client ID in the project environment.</p>;
  return <div className={`google-signin ${disabled ? 'is-disabled' : ''}`} ref={target} aria-label="Continue with Google" />;
}
