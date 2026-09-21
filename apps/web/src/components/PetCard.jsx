import { HUE } from '../lib/ui.js';
import { Icon } from './Icon.jsx';

export const money = (p) => (p ? '₹' + p.toLocaleString('en-IN') : 'Free adoption');
export const stateTag = (s) => ({
  Published: 't-ok', Reserved: 't-info', 'Pending Review': 't-warn',
  Rejected: 't-bad', 'Sold/Adopted': 't-info',
}[s] || '');

export function VerifiedBadge({ owner }) {
  return owner?.kycStatus === 'Approved'
    ? <span className="tag t-ok"><Icon n="shield" s={13} />ID verified</span>
    : <span className="tag t-warn"><Icon n="clock" s={13} />Unverified</span>;
}

export default function PetCard({ pet, onOpen }) {
  return (
    <article className="marketplace-card">
      <button className="marketplace-photo" onClick={() => onOpen(pet)} aria-label={`View ${pet.name} full details`} style={{ background: HUE[pet.species] }}>
        {pet.media?.[0]?.url ? <img src={pet.media[0].url} alt={`${pet.name}, ${pet.breed}`} loading="lazy" /> : <Icon n="paw" s={52} st={1.6} />}
        {pet.status === 'Reserved' && <span className="marketplace-photo-tag">On hold</span>}
        <span className="marketplace-photo-action">View details</span>
      </button>
      <div className="marketplace-copy">
        <div className="marketplace-title-row">
          <div className="marketplace-title"><h3>{pet.name}</h3><span>{pet.breed || pet.species}</span></div>
          <b className={`marketplace-price ${pet.price ? '' : 'free'}`}>{money(pet.price)}</b>
        </div>
        <div className="marketplace-meta">{pet.ageYears} yr · {pet.gender}</div>
        <div className="marketplace-meta marketplace-location"><Icon n="pin" s={14} />{pet.city} {pet.pincode}</div>
        <div className="marketplace-badges">
          <VerifiedBadge owner={pet.owner} />
          <span className="tag"><Icon n="syringe" s={13} />{pet.vaccination} vax</span>
        </div>
        <button className="marketplace-details-button" onClick={() => onOpen(pet)}>See full pet details <Icon n="arrow" s={14} /></button>
      </div>
    </article>
  );
}
