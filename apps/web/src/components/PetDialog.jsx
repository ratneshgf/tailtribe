import { useEffect, useRef, useState } from 'react';
import { HUE } from '../lib/ui.js';
import { api } from '../lib/api.js';
import { Icon } from './Icon.jsx';
import { money, stateTag, VerifiedBadge } from './PetCard.jsx';
import { useApp } from '../App.jsx';

const REASONS = ['Animal welfare concern', 'Misleading information', 'Suspected scam', 'Prohibited listing', 'Other'];

export default function PetDialog({ pet, onClose, onChanged }) {
  const ref = useRef(null);
  const { user, notify, navigate } = useApp();
  const [requests, setRequests] = useState([]);
  const [reporting, setReporting] = useState(false);
  const [meetingLocation, setMeetingLocation] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => { api.get('/requests').then(setRequests).catch(() => {}); }, [pet.id]);

  const mine = requests.find((r) => r.petId?._id === pet.id || r.petId === pet.id);
  const isOwner = pet.owner?.id === user.id;
  const canAct = user.role === 'buyer' && user.status === 'Active' && !isOwner && pet.status === 'Published';

  const run = async (fn, msg) => {
    try { await fn(); notify(msg); onChanged?.(); onClose(); }
    catch (e) { notify(e.message); }
  };
  const viewMeetingLocation = async () => {
    setLoadingLocation(true);
    try { setMeetingLocation(await api.get(`/pets/${pet.id}/meeting-location`)); }
    catch (e) { notify(e.message); }
    finally { setLoadingLocation(false); }
  };
  const openConversation = async () => {
    try {
      await api.post('/conversations', { petId: pet.id });
      notify('Conversation opened.');
      onChanged?.();
      onClose();
      navigate('messages');
    } catch (e) { notify(e.message); }
  };
  const toggleSaved = async () => {
    try {
      const { saved } = await api.post(`/favorites/${pet.id}`);
      notify(saved ? 'Pet saved to your shortlist.' : 'Pet removed from your shortlist.');
      onChanged?.();
    } catch (e) { notify(e.message); }
  };

  return (
    <dialog ref={ref} onClose={onClose}>
      <div className="dlg">
        <div className="dlghd">
          <div>
            <h2 style={{ fontSize: 24 }}>{pet.name}</h2>
            <div className="sub">{pet.breed} · {pet.ageYears} years · {pet.gender}</div>
          </div>
          <button className="x" onClick={onClose}><Icon n="x" s={16} /></button>
        </div>

        <div className="pet-detail-layout">
          <div className="pet-detail-photo" style={{ background: HUE[pet.species] }}>
            {pet.media?.[0]?.url ? <img src={pet.media[0].url} alt={`${pet.name}, ${pet.breed}`} /> : <Icon n="paw" s={52} st={1.6} />}
          </div>

          <div className="pet-detail-content">
            <div className="row pet-detail-price-row">
              <span className={`price ${pet.price ? '' : 'free'}`}>{money(pet.price)}</span>
              <span className={`tag ${stateTag(pet.status)}`}>{pet.status}</span>
            </div>
            {pet.about && <p className="pet-detail-about">{pet.about}</p>}
            <div className="pet-detail-facts">
              <div className="kv"><span>Age & gender</span><b>{pet.ageYears} years · {pet.gender}</b></div>
              <div className="kv"><span>Vaccination</span><b>{pet.vaccination}</b></div>
              <div className="kv"><span>Health</span><b>{pet.health || 'Not provided'} <small>({pet.healthVerified ? 'verified' : 'owner-provided'})</small></b></div>
              <div className="kv"><span>Approximate location</span><b>{pet.city} {pet.pincode}</b></div>
              <div className="kv"><span>Listed by</span><b>{pet.owner?.name || 'TailTribe rehomer'}</b></div>
            </div>
            <div className="pet-detail-badges"><VerifiedBadge owner={pet.owner} /></div>
            <div className="note pet-detail-safety"><Icon n="shield" s={16} />
              <span>Identity checks confirm the rehomer, not the pet's health. Keep messages in-app and meet before arranging payment.</span>
            </div>

            {reporting ? (
              <div className="pet-detail-report">
                <div className="field"><label>Reason</label>
                  <select id="rr">{REASONS.map((x) => <option key={x}>{x}</option>)}</select>
                </div>
                <button className="btn" onClick={() => run(
                  () => api.post('/reports', { petId: pet.id, reason: document.getElementById('rr').value }),
                  'Report sent to moderation.')}>Submit report</button>
              </div>
            ) : (
              <div className="fl pet-detail-actions">
                {isOwner && <span className="sub">You own this listing.</span>}
                {canAct && !mine && (
                  <button className="btn coral" onClick={() => run(
                    () => api.post(`/pets/${pet.id}/requests`, { message: 'Interested - I can share home details.' }),
                    'Request sent to the rehomer.')}>
                    <Icon n="paw" s={16} />Request {pet.price ? 'purchase' : 'adoption'}
                  </button>
                )}
                {mine && <span className="tag t-info">Request {mine.status}</span>}
                {canAct && mine?.status === 'Accepted' && (
                  <button className="btn" onClick={() => run(
                    () => api.post(`/pets/${pet.id}/reservations`, {}), 'Hold placed.')}>
                    <Icon n="clock" s={16} />Request hold
                  </button>
                )}
                {!isOwner && mine?.status === 'Accepted' && !meetingLocation && (
                  <button className="btn" disabled={loadingLocation} onClick={viewMeetingLocation}>
                    <Icon n="pin" s={16} />{loadingLocation ? 'Opening location…' : 'View meeting location'}
                  </button>
                )}
                {!isOwner && user.role !== 'admin' && (
                  <button className="btn alt" disabled={user.status !== 'Active'} onClick={openConversation} title={user.status !== 'Active' ? 'Complete identity verification to use messaging' : undefined}>
                    <Icon n="chat" s={16} />Message
                  </button>
                )}
                {!isOwner && (
                  <>
                    <button className="btn alt" onClick={toggleSaved}><Icon n="heart" s={16} />Save</button>
                    <button className="btn alt" onClick={() => setReporting(true)}><Icon n="flag" s={16} />Report</button>
                  </>
                )}
              </div>
            )}

            {meetingLocation && (
              <section className="meeting-location-card">
                <div><span className="meeting-location-eyebrow"><Icon n="pin" s={14} />Meeting location</span><b>{meetingLocation.address}</b>{meetingLocation.landmark && <span>Near: {meetingLocation.landmark}</span>}<span>{meetingLocation.city} {meetingLocation.pincode}</span></div>
                <a className="btn sm" href={meetingLocation.mapsUrl} target="_blank" rel="noreferrer"><Icon n="pin" s={14} />Open directions</a>
              </section>
            )}

            {user.status !== 'Active' && (
              <p className="sub pet-detail-account-status">Your account is {user.status} - complete verification to send requests.</p>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
