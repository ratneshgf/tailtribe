import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import PetCard from '../components/PetCard.jsx';
import PetDialog from '../components/PetDialog.jsx';
import { Icon } from '../components/Icon.jsx';

const EMPTY = { q: '', species: '', adoptionType: '', vaccination: '', sort: 'new' };

export default function Browse() {
  const [f, setF] = useState(EMPTY);
  const [data, setData] = useState({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    const qs = new URLSearchParams(Object.entries({ ...f, page }).filter(([, v]) => v)).toString();
    setLoading(true);
    api.get(`/pets?${qs}`).then(setData).finally(() => setLoading(false));
  };
  useEffect(load, [f, page]);

  const set = (k) => (e) => { setPage(1); setF({ ...f, [k]: e.target.value }); };
  const pages = Math.max(1, Math.ceil(data.total / 12));

  return (
    <>
      <div className="bar" style={{ marginTop: 20 }}>
        <div className="search"><Icon n="search" s={17} />
          <input placeholder="Breed, name or city" value={f.q} onChange={set('q')} />
        </div>
        <select value={f.species} onChange={set('species')}>
          <option value="">Any species</option>{['Dog', 'Cat', 'Rabbit', 'Bird'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={f.adoptionType} onChange={set('adoptionType')}>
          <option value="">Price & adoption</option><option value="free">Free adoption</option><option value="sale">For sale</option>
        </select>
        <select value={f.vaccination} onChange={set('vaccination')}>
          <option value="">Any vaccination</option><option>Full</option><option>Partial</option><option>None</option>
        </select>
        <select value={f.sort} onChange={set('sort')}>
          <option value="new">Newest</option><option value="price">Price</option><option value="age">Age</option>
        </select>
      </div>

      {loading ? <div className="empty">Loading listings…</div>
        : data.items.length ? (
          <>
            <div className="grid">{data.items.map((p) => <PetCard key={p.id} pet={p} onOpen={setOpen} />)}</div>
            {pages > 1 && (
              <div className="fl" style={{ justifyContent: 'center', margin: '20px 0' }}>
                <button className="btn alt sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
                <span className="sub" style={{ alignSelf: 'center' }}>Page {page} of {pages}</span>
                <button className="btn alt sm" disabled={page === pages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            )}
          </>
        ) : <div className="empty"><Icon n="search" s={26} /><p>No listings match these filters yet.</p></div>}

      {open && <PetDialog pet={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}
