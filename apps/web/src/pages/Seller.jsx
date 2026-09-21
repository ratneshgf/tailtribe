import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { HUE } from '../lib/ui.js';
import { Icon } from '../components/Icon.jsx';
import { money, stateTag } from '../components/PetCard.jsx';
import PetDialog from '../components/PetDialog.jsx';
import { useApp } from '../App.jsx';

const BLANK = { name: '', species: 'Dog', breed: '', ageYears: 1, gender: 'Female', city: '', pincode: '', meetingAddress: '', meetingLandmark: '', price: 0, vaccination: 'Full', health: '' };

export default function Seller() {
  const { user, notify } = useApp();
  const [pets, setPets] = useState([]);
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState(null);
  const [selectedPet, setSelectedPet] = useState(null);
  const [images, setImages] = useState([]);
  const [saving, setSaving] = useState(false);
  const imageUrls = useRef([]);

  useEffect(() => () => imageUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const load = () => {
    api.get('/pets/mine').then(setPets);
    api.get('/requests').then((r) => setRequests(r.filter((x) => String(x.sellerId?._id || x.sellerId) === user.id)));
  };
  useEffect(load, []);

  const move = async (pet, status) => {
    try { await api.patch(`/pets/${pet.id}/status`, { status }); notify(`Listing ${status}.`); load(); }
    catch (e) { notify(e.message); }
  };
  const decide = async (req, status) => {
    try { await api.patch(`/requests/${req._id}`, { status }); notify(`Request ${status.toLowerCase()}.`); load(); }
    catch (e) { notify(e.message); }
  };
  const create = async () => {
    if (!form || saving) return;
    setSaving(true);
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.append(key, value ?? ''));
      images.forEach(({ file }) => payload.append('images', file));
      await api.post('/pets', payload);
      notify('Submitted for moderation.');
      images.forEach(({ preview }) => URL.revokeObjectURL(preview));
      imageUrls.current = [];
      setImages([]); setForm(null); load();
    } catch (e) { notify(e.message); }
    finally { setSaving(false); }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const closeForm = () => {
    images.forEach(({ preview }) => URL.revokeObjectURL(preview));
    imageUrls.current = [];
    setImages([]); setForm(null);
  };
  const pickImages = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const remaining = Math.max(0, 6 - images.length);
    if (files.length > remaining) notify('You can add up to 6 photos per listing.');
    const chosen = files.slice(0, remaining);
    const allowed = chosen.filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 5 * 1024 * 1024);
    if (allowed.length !== chosen.length) notify('Photos must be JPEG, PNG, or WebP and 5 MB or smaller.');
    const additions = allowed.map((file) => ({ file, preview: URL.createObjectURL(file) }));
    imageUrls.current.push(...additions.map(({ preview }) => preview));
    setImages((current) => [...current, ...additions]);
  };
  const removeImage = (index) => {
    const removed = images[index];
    if (removed) URL.revokeObjectURL(removed.preview);
    imageUrls.current = imageUrls.current.filter((url) => url !== removed?.preview);
    setImages(images.filter((_, i) => i !== index));
  };

  return (
    <>
      <div className="panel" style={{ marginTop: 20 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div><h2>My listings</h2><p className="sub">Listings enter moderation before they become public.</p></div>
          <button className="btn coral" onClick={() => setForm(BLANK)}><Icon n="plus" s={16} />New listing</button>
        </div>
        {user.kycStatus !== 'Approved' && (
          <div className="note" style={{ marginTop: 12 }}><Icon n="shield" s={16} />
            <span>Identity verification is pending — you can draft listings, but publishing is blocked until an admin approves your KYC.</span>
          </div>
        )}
      </div>

      {form && (
        <div className="panel">
          <h2 style={{ fontSize: 17 }}>Create listing</h2>
          <div className="two">
            <div>
              <div className="field"><label>Pet name</label><input value={form.name} onChange={set('name')} /></div>
              <div className="field"><label>Species</label>
                <select value={form.species} onChange={set('species')}>{['Dog', 'Cat', 'Rabbit', 'Bird'].map((s) => <option key={s}>{s}</option>)}</select>
              </div>
              <div className="field"><label>Breed</label><input value={form.breed} onChange={set('breed')} /></div>
              <div className="field"><label>Age (years)</label><input type="number" min="0" value={form.ageYears} onChange={set('ageYears')} /></div>
            </div>
            <div>
              <div className="field"><label>Gender</label>
                <select value={form.gender} onChange={set('gender')}><option>Female</option><option>Male</option></select>
              </div>
              <div className="field"><label>City</label><input value={form.city} onChange={set('city')} /></div>
              <div className="field"><label>PIN code</label><input value={form.pincode} onChange={set('pincode')} placeholder="474002" /></div>
              <div className="field"><label>Price (0 = free adoption)</label><input type="number" min="0" value={form.price} onChange={set('price')} /></div>
            </div>
          </div>
          <div className="field"><label>Health disclosure (owner-provided)</label>
            <textarea rows="2" value={form.health} onChange={set('health')} placeholder="Deworming, sterilisation, known conditions…" />
          </div>
          <div className="meeting-location-form">
            <div className="meeting-location-title"><Icon n="pin" s={16} /><div><b>Private meeting location</b><span>Shared only after you accept a buyer’s request.</span></div></div>
            <div className="field"><label>Meeting address</label><textarea rows="2" value={form.meetingAddress} onChange={set('meetingAddress')} placeholder="House/building, street, area" /></div>
            <div className="field"><label>Landmark <span className="sub">Optional</span></label><input value={form.meetingLandmark} onChange={set('meetingLandmark')} placeholder="Near the metro station or landmark" /></div>
          </div>
          <div className="field photo-field"><label>Pet photos <span className="sub">Optional · up to 6 photos, 5 MB each</span></label>
            <div className="photo-picker-row">
              {images.map((image, index) => <div className="photo-preview" key={image.preview}><img src={image.preview} alt={`Pet photo ${index + 1} preview`} /><button type="button" className="photo-remove" onClick={() => removeImage(index)} aria-label={`Remove photo ${index + 1}`}><Icon n="x" s={13} /></button></div>)}
              {images.length < 6 && <label className="photo-add"><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={pickImages} /><Icon n="plus" s={18} /><span>Add photos</span></label>}
            </div>
            <span className="photo-help">JPEG, PNG, and WebP only. Photos upload securely when you submit the listing.</span>
          </div>
          <div className="note"><Icon n="shield" s={16} /><span>Only city and PIN are public. Your meeting address is released only to buyers whose request you accept.</span></div>
          <div className="fl" style={{ marginTop: 14 }}>
            <button className="btn coral" onClick={create} disabled={saving}>{saving ? 'Uploading photos…' : 'Submit for review'}</button>
            <button className="btn alt" onClick={closeForm} disabled={saving}>Cancel</button>
          </div>
        </div>
      )}
      {pets.length ? (
        <div className="seller-listing-grid">
          {pets.map((p) => (
            <article className="seller-listing-card" key={p.id}>
              <button className="seller-listing-photo" onClick={() => setSelectedPet(p)} aria-label={`View ${p.name} listing details`} style={{ background: HUE[p.species] }}>
                {p.media?.[0]?.url ? <img src={p.media[0].url} alt={`${p.name}, ${p.breed}`} loading="lazy" /> : <Icon n="paw" s={44} st={1.6} />}
                <span>View details</span>
              </button>
              <div className="seller-listing-body">
                <div className="seller-listing-heading">
                  <div><h3>{p.name}</h3><span className="meta">{p.breed || p.species}</span></div>
                  <span className={`tag ${stateTag(p.status)}`}>{p.status}</span>
                </div>
                <div className="seller-listing-facts"><span>{p.ageYears} yr · {p.gender}</span><b>{money(p.price)}</b></div>
                <div className="meta seller-listing-location"><Icon n="pin" s={14} />{p.city} {p.pincode}</div>
                <p className={`seller-listing-status status-${String(p.status).toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                  {p.status === 'Pending Review' && 'Waiting for an admin to review this listing.'}
                  {p.status === 'Published' && 'Live in the Marketplace.'}
                  {p.status === 'Rejected' && (p.rejectionReason || 'Needs an update before resubmission.')}
                  {p.status === 'Draft' && 'Not submitted for review yet.'}
                  {p.status === 'Paused' && 'Hidden from the Marketplace while paused.'}
                  {p.status === 'Reserved' && 'Reserved while the request is in progress.'}
                  {p.status === 'Sold/Adopted' && 'Marked as rehomed.'}
                </p>
                <div className="fl seller-listing-actions">
                  <button className="btn sm alt" onClick={() => setSelectedPet(p)}>Full details</button>
                  {['Draft', 'Rejected'].includes(p.status) && <button className="btn sm" onClick={() => move(p, 'Pending Review')}>Submit for review</button>}
                  {p.status === 'Published' && <button className="btn sm alt" onClick={() => move(p, 'Paused')}>Pause</button>}
                  {p.status === 'Paused' && <button className="btn sm" onClick={() => move(p, 'Published')}>Publish</button>}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="empty"><Icon n="paw" s={26} /><p>No listings yet.</p></div>}

      {selectedPet && <PetDialog pet={selectedPet} onClose={() => setSelectedPet(null)} onChanged={load} />}
      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Incoming requests</h2>
        <p className="sub">Accepting does not transfer the animal — arrange a meeting through in-app chat.</p>
        {requests.length ? (
          <table style={{ marginTop: 10 }}>
            <tbody>
              <tr><th>Pet</th><th>From</th><th>Message</th><th>Status</th><th /></tr>
              {requests.map((r) => (
                <tr key={r._id}>
                  <td><b>{r.petId?.name}</b></td>
                  <td>{r.buyerId?.name}</td>
                  <td className="sub">{r.message || '—'}</td>
                  <td><span className={`tag ${r.status === 'Accepted' ? 't-ok' : r.status === 'Declined' ? 't-bad' : 't-warn'}`}>{r.status}</span></td>
                  <td className="fl">
                    {['Submitted', 'Under Review'].includes(r.status) && (
                      <>
                        <button className="btn sm" onClick={() => decide(r, 'Accepted')}><Icon n="check" s={14} />Accept</button>
                        <button className="btn sm alt" onClick={() => decide(r, 'Declined')}><Icon n="x" s={14} />Decline</button>
                      </>
                    )}
                    {r.status === 'Accepted' && <button className="btn sm" onClick={() => decide(r, 'Completed')}><Icon n="check" s={14} />Complete handover</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="sub" style={{ marginTop: 8 }}>No requests yet.</p>}
      </div>
    </>
  );
}
