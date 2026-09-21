import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import { money } from '../components/PetCard.jsx';
import { useApp } from '../App.jsx';

export default function Admin() {
  const { notify } = useApp();
  const [stats, setStats] = useState(null);
  const [queue, setQueue] = useState([]);
  const [kyc, setKyc] = useState([]);
  const [reports, setReports] = useState([]);
  const [logs, setLogs] = useState([]);

  const load = () => {
    api.get('/admin/dashboard').then(setStats);
    api.get('/admin/listings').then(setQueue);
    api.get('/admin/kyc').then(setKyc);
    api.get('/admin/reports').then(setReports);
    api.get('/admin/audit-logs').then(setLogs);
  };
  useEffect(load, []);

  const act = async (fn, msg) => {
    try { await fn(); notify(msg); load(); } catch (e) { notify(e.message); }
  };

  const openKycDocument = async (submission) => {
    const tab = window.open('about:blank', '_blank');
    try {
      const { url } = await api.get(`/admin/kyc/${submission._id}/document`);
      if (tab) tab.location.href = url;
      else notify('Allow pop-ups to open the private review document.');
    } catch (e) { tab?.close(); notify(e.message); }
  };

  const CARDS = stats ? [
    ['Active users', stats.activeUsers, true], ['Pending KYC', stats.pendingKyc],
    ['Pending listings', stats.pendingListings], ['Active listings', stats.activeListings],
    ['Open reports', stats.openReports], ['Reservations', stats.activeReservations],
  ] : [];

  return (
    <>
      <div className="stats" style={{ marginTop: 20 }}>
        {CARDS.map(([label, value, accent]) => (
          <div className={`stat ${accent ? 'acc' : ''}`} key={label}><b>{value}</b><span>{label}</span></div>
        ))}
      </div>

      <div className="panel">
        <h2>Listing moderation</h2>
        <p className="sub">Rejections require a reason and are written to the audit log.</p>
        {queue.length ? (
          <table style={{ marginTop: 10 }}><tbody>
            <tr><th>Pet</th><th>Seller</th><th>Detail</th><th /></tr>
            {queue.map((p) => (
              <tr key={p.id}>
                <td><b>{p.name}</b></td><td>{p.owner?.name}</td>
                <td className="sub">{p.breed} · {money(p.price)} · {p.city} {p.pincode}</td>
                <td className="fl">
                  <button className="btn sm" onClick={() => act(() => api.patch(`/pets/${p.id}/status`, { status: 'Published' }), 'Published.')}>
                    <Icon n="check" s={14} />Approve
                  </button>
                  <button className="btn sm alt" onClick={() => {
                    const reason = prompt('Rejection reason (required):');
                    if (reason) act(() => api.patch(`/pets/${p.id}/status`, { status: 'Rejected', reason }), 'Rejected with reason.');
                  }}><Icon n="x" s={14} />Reject</button>
                </td>
              </tr>
            ))}
          </tbody></table>
        ) : <p className="sub" style={{ marginTop: 8 }}>Queue clear.</p>}
      </div>

      <div className="panel">
        <h2>KYC queue</h2>
        {kyc.length ? (
          <table style={{ marginTop: 10 }}><tbody>
            <tr><th>User</th><th>Role</th><th>Document</th><th /></tr>
            {kyc.map((k) => (
              <tr key={k._id}>
                <td><b>{k.userId?.name}</b></td><td className="sub">{k.userId?.role}</td>
                <td className="sub"><Icon n="doc" s={14} /> {k.documentType}<br />
                  {k.documentRef?.startsWith('tailtribe/kyc/') ? <button className="text-action" onClick={() => openKycDocument(k)}>View private document <Icon n="arrow" s={14} /></button> : <span className="tag t-warn">No uploaded file in demo record</span>}
                </td>
                <td className="fl">
                  <button className="btn sm" onClick={() => act(() => api.patch(`/admin/kyc/${k._id}`, { status: 'Approved' }), 'KYC approved.')}>Approve</button>
                  <button className="btn sm alt" onClick={() => {
                    const reason = prompt('Reason (required):');
                    if (reason) act(() => api.patch(`/admin/kyc/${k._id}`, { status: 'Rejected', reason }), 'KYC rejected.');
                  }}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody></table>
        ) : <p className="sub" style={{ marginTop: 8 }}>No submissions awaiting review.</p>}
      </div>

      <div className="panel">
        <h2>Reports</h2>
        {reports.length ? (
          <table style={{ marginTop: 10 }}><tbody>
            <tr><th>Listing</th><th>Reason</th><th>Status</th><th /></tr>
            {reports.map((r) => (
              <tr key={r._id}>
                <td>{r.petId?.name}</td><td className="sub">{r.reason}</td>
                <td><span className={`tag ${r.status === 'Open' ? 't-warn' : 't-ok'}`}>{r.status}</span></td>
                <td>{r.status === 'Open' && (
                  <button className="btn sm alt" onClick={() => act(
                    () => api.patch(`/admin/reports/${r._id}`, { status: 'Resolved', unpublish: true, resolution: 'Unpublished pending review' }),
                    'Unpublished and resolved.')}>Unpublish & resolve</button>
                )}</td>
              </tr>
            ))}
          </tbody></table>
        ) : <p className="sub" style={{ marginTop: 8 }}>No reports filed.</p>}
      </div>

      <div className="panel">
        <h2>Audit log</h2>
        <p className="sub">Immutable record of verification, moderation, reservation and report actions.</p>
        <table style={{ marginTop: 10 }}><tbody>
          <tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th></tr>
          {logs.map((l) => (
            <tr key={l._id}>
              <td className="sub">{new Date(l.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</td>
              <td>{l.actorId?.name || 'system'}</td>
              <td><b>{l.action}</b> <span className="sub">{l.detail || ''}</span></td>
              <td className="sub">{l.entityType}</td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </>
  );
}
