const BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
let accessToken = null;

export const setTokens = (t) => {
  accessToken = t?.accessToken || null;
  localStorage.removeItem('tt_access');
  localStorage.removeItem('tt_refresh');
};
export const getToken = () => accessToken;

let refreshInFlight = null;
async function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE}/auth/refresh`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    }).then(async (res) => {
      if (!res.ok) throw new Error('Refresh rejected');
      setTokens(await res.json());
      return true;
    }).catch(() => {
      setTokens(null);
      return false;
    }).finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function call(path, { method = 'GET', body } = {}, mayRefresh = true) {
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: { ...(multipart ? {} : { 'Content-Type': 'application/json' }), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
  });
  if (res.status === 401 && mayRefresh && !path.startsWith('/auth/') && await refreshSession()) {
    return call(path, { method, body }, false);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (p) => call(p),
  post: (p, body) => call(p, { method: 'POST', body }),
  patch: (p, body) => call(p, { method: 'PATCH', body }),
};

export async function restoreSession() {
  if (!await refreshSession()) return null;
  return api.get('/users/me');
}
