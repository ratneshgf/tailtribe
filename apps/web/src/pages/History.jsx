import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import { money } from '../components/PetCard.jsx';
import { useApp } from '../App.jsx';

const formatDateTime = (value) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Date unavailable';

export default function History() {
  const { user } = useApp();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/history').then(setItems).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const sellerView = user.role === 'seller';
  return <>
    <section className="panel history-head">
      <div><h2>{sellerView ? 'Sales history' : 'Adoption & purchase history'}</h2><p className="sub">Completed handovers are saved here with the pet, people, amount, date and time.</p></div>
      <span className="history-count"><Icon n="clock" s={16} />{items.length} completed</span>
    </section>
    {loading ? <div className="empty"><Icon n="clock" s={26} /><p>Loading history…</p></div> : error ? <div className="empty"><Icon n="x" s={26} /><p>{error}</p></div> : items.length ? <section className="history-list">{items.map((item) => <article className="history-card" key={item.id}>
      <div className="history-pet-image">{item.pet?.media?.[0]?.url ? <img src={item.pet.media[0].url} alt={item.pet.name} /> : <Icon n="paw" s={30} />}</div>
      <div className="history-main"><div className="history-title"><div><h3>{item.pet?.name || 'Removed listing'}</h3><p>{item.pet?.breed || item.pet?.species || 'Pet'} · {item.type === 'purchase' ? 'Purchase' : 'Adoption'}</p></div><b>{money(item.pet?.price || 0)}</b></div><div className="history-people"><span><small>{sellerView ? 'Buyer' : 'Seller'}</small><b>{sellerView ? item.buyer?.name : item.seller?.name}</b></span><span><small>{sellerView ? 'Seller' : 'Buyer'}</small><b>{sellerView ? item.seller?.name : item.buyer?.name}</b></span><span><small>Completed</small><b>{formatDateTime(item.completedAt)}</b></span></div></div>
      <span className="tag t-ok">Completed</span>
    </article>)}</section> : <div className="empty history-empty"><Icon n="clock" s={28} /><h3>No completed {sellerView ? 'sales' : 'adoptions or purchases'} yet</h3><p>Once a seller completes an accepted handover, its full record will appear here.</p></div>}
  </>;
}
