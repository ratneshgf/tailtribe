import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Icon } from '../components/Icon.jsx';
import { money, stateTag } from '../components/PetCard.jsx';
import { useApp } from '../App.jsx';

const dateLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = (value) => value ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(value)) : 'Recently';

function Metric({ icon, label, value, note, tone = '' }) {
  return <div className="metric-card"><span className={`metric-icon ${tone}`}><Icon n={icon} s={18} /></span><span className="metric-label">{label}</span><b className="metric-value">{value}</b><span className="metric-note">{note}</span></div>;
}
function PanelHeading({ title, detail, action, onAction }) {
  return <div className="panel-heading"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action && <button className="text-action" onClick={onAction}>{action}<Icon n="arrow" s={15} /></button>}</div>;
}
function EmptyLine({ icon, title, body, action, onAction }) {
  return <div className="empty-state"><span className="empty-icon"><Icon n={icon} s={20} /></span><div><b>{title}</b><p>{body}</p></div>{action && <button className="btn sm alt" onClick={onAction}>{action}</button>}</div>;
}

export default function Dashboard() {
  const { user, setUser, navigate, notify } = useApp();
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (user.role === 'admin') {
        const [stats, logs] = await Promise.all([api.get('/admin/dashboard'), api.get('/admin/audit-logs')]);
        setData({ stats, logs });
      } else if (user.role === 'seller') {
        const [pets, allRequests] = await Promise.all([api.get('/pets/mine'), api.get('/requests')]);
        const requests = allRequests.filter((r) => String(r.sellerId?._id || r.sellerId) === user.id);
        setData({ pets, requests });
      } else {
        const [listings, favorites, requests, conversations] = await Promise.all([
          api.get('/pets?limit=6&sort=new'), api.get('/favorites'), api.get('/requests'), api.get('/conversations'),
        ]);
        setData({ listings: listings.items, total: listings.total, favorites, requests: requests.filter((r) => String(r.buyerId?._id || r.buyerId) === user.id), conversations });
      }
    } catch (e) { setError(e.message || 'Could not load your workspace.'); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const firstName = user.name?.trim().split(/\s+/)[0] || 'there';
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  if (loading) return <div className="dashboard-loading"><span className="loading-paw"><Icon n="paw" s={20} /></span><span>Loading your workspace…</span></div>;

  return <div className="dashboard">
    <section className="dashboard-landing" aria-label="TailTribe introduction">
      <div className="landing-orbit orbit-one" aria-hidden="true" />
      <div className="landing-orbit orbit-two" aria-hidden="true" />
      <div className="landing-copy">
        <span className="landing-eyebrow">Welcome to your TailTribe</span>
        <h1>Making new best<br />friends feel <em>safe.</em></h1>
        <p>Discover thoughtful matches, verified rehomers and a safer journey from first hello to forever home.</p>
        <div className="landing-actions">
          <button className="landing-primary" onClick={() => navigate(user.role === 'admin' ? 'admin' : user.role === 'seller' ? 'seller' : 'browse')}>
            {user.role === 'admin' ? 'Open moderation' : user.role === 'seller' ? 'Manage listings' : 'Find a pet'} <Icon n="arrow" s={16} />
          </button>
          <button className="landing-scroll" onClick={() => document.getElementById('workspace-overview')?.scrollIntoView({ behavior: 'smooth' })}>
            View dashboard <Icon n="chevron" s={15} />
          </button>
        </div>
      </div>
      <div className="landing-puppies" aria-hidden="true">
        <video autoPlay muted loop playsInline preload="auto">
          <source src="/puppies-hero.mp4?v=1" type="video/mp4" />
        </video>
      </div>
      <button className="landing-down" onClick={() => document.getElementById('workspace-overview')?.scrollIntoView({ behavior: 'smooth' })} aria-label="Scroll to dashboard">
        <span>Scroll to your workspace</span><Icon n="chevron" s={16} />
      </button>
    </section>

    <section id="workspace-overview" className={`welcome-banner ${user.role === 'admin' ? 'admin-welcome' : ''}`}>
      <div className="welcome-copy"><span className="eyebrow">{dateLabel.format(new Date())}</span><h1>{greeting}, {firstName}<span className="welcome-comma">.</span></h1>
        <p>{user.role === 'admin' ? 'Here’s the live pulse of your marketplace and the work that needs review.' : user.role === 'seller' ? 'Your rehoming workspace is ready. Keep your listings up to date and every conversation moving.' : 'A thoughtful match starts with the right introduction. Pick up where you left off.'}</p>
        <div className="welcome-actions">
          {user.role === 'buyer' && <button className="btn coral" onClick={() => navigate('browse')}><Icon n="search" s={16} />Explore pets</button>}
          {user.role === 'seller' && <button className="btn coral" onClick={() => navigate('seller')}><Icon n="plus" s={16} />Create a listing</button>}
          {user.role === 'admin' && <button className="btn coral" onClick={() => navigate('admin')}><Icon n="shield" s={16} />Open review queue</button>}
          {user.role !== 'admin' && <span className="welcome-trust"><Icon n="shield" s={15} />A safer way to rehome</span>}
        </div>
      </div>
      <div className="welcome-art" aria-hidden="true"><div className="art-sun"/><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-paw"><Icon n="paw" s={64} st={1.45} /></div><span className="art-spark spark-one">✳</span><span className="art-spark spark-two">✦</span></div>
    </section>

    {error && <div className="error-banner"><span>{error}</span><button className="btn sm alt" onClick={load}>Try again</button></div>}

    {!error && user.role !== 'admin' && user.kycStatus !== 'Approved' && <KycSubmission user={user} setUser={setUser} notify={notify} />}
    {!error && user.role === 'admin' && <AdminOverview data={data} navigate={navigate} />}
    {!error && user.role === 'seller' && <SellerOverview data={data} user={user} navigate={navigate} />}
    {!error && user.role === 'buyer' && <BuyerOverview data={data} navigate={navigate} />}

    <div className="dashboard-footnote"><Icon n="shield" s={15} /><span>Identity verification confirms account identity only. Always meet the animal before arranging a handover.</span></div>
  </div>;
}

function KycSubmission({ user, setUser, notify }) {
  const [documentType, setDocumentType] = useState('Government ID');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (user.kycStatus === 'Submitted') return <div className="kyc-status-card"><span className="kyc-status-icon"><Icon n="clock" s={19} /></span><div><b>Identity check in review</b><p>Your document is stored privately. An admin will review it before you can use verified features.</p></div><span className="tag t-warn">Submitted</span></div>;

  const submit = async () => {
    if (!file || saving) { notify('Choose a verification document first.'); return; }
    if (file.size > 10 * 1024 * 1024) { notify('Choose a document smaller than 10 MB.'); return; }
    setError('');
    setSaving(true);
    try {
      const body = new FormData();
      body.append('documentType', documentType);
      body.append('document', file);
      await api.post('/kyc', body);
      setUser({ ...user, kycStatus: 'Submitted' });
      notify('Verification document submitted for review.');
    } catch (error) { setError(error.message); notify(error.message); }
    finally { setSaving(false); }
  };

  return <section className="surface kyc-submission">
    <div className="kyc-intro"><span className="kyc-status-icon"><Icon n="shield" s={19} /></span><div><b>Verify your identity</b><p>{user.kycStatus === 'Rejected' ? 'The last document was not approved. Submit a new one to continue.' : 'Submit an ID document for a private admin review.'}</p></div></div>
    <div className="kyc-fields"><label className="field"><span>Document type</span><select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option>Government ID</option><option>Passport</option><option>Driving licence</option><option>Other</option></select></label>
      <label className={`kyc-file ${file ? 'has-file' : ''}`}><input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] || null)} /><Icon n="doc" s={18} /><span>{file ? file.name : 'Choose PDF, JPEG, or PNG'}</span><small>Max 10 MB · private upload</small></label>
      <button className="btn coral" onClick={submit} disabled={!file || saving}>{saving ? 'Submitting…' : 'Submit for review'}</button>
    </div>
    {error && <p className="kyc-error" role="alert">{error}</p>}
    <p className="kyc-privacy"><Icon n="shield" s={14} />Only authorized admins can open this document. Review links expire after 5 minutes.</p>
  </section>;
}

function SellerOverview({ data, user, navigate }) {
  const pets = data.pets || [], requests = data.requests || [];
  const pending = pets.filter((p) => p.status === 'Pending Review').length;
  const live = pets.filter((p) => ['Published', 'Reserved'].includes(p.status)).length;
  const openRequests = requests.filter((r) => ['Submitted', 'Under Review', 'More Info Required'].includes(r.status));
  return <>
    {user.kycStatus !== 'Approved' && <div className="verification-banner"><span className="verification-mark"><Icon n="clock" s={18} /></span><div><b>Finish identity verification</b><p>Your account is {user.status.toLowerCase()}. Verified sellers can publish listings after review.</p></div><span className="tag t-warn">{user.kycStatus}</span></div>}
    <div className="metric-grid">
      <Metric icon="paw" label="My listings" value={pets.length} note={`${live} live or reserved`} tone="peach" />
      <Metric icon="clock" label="In review" value={pending} note={pending ? 'Awaiting moderation' : 'Nothing in the queue'} tone="yellow" />
      <Metric icon="chat" label="New requests" value={openRequests.length} note={`${requests.length} total conversations`} tone="mint" />
      <Metric icon="heart" label="Successful matches" value={pets.filter((p) => p.status === 'Sold/Adopted').length} note="Marked rehomed by you" tone="lilac" />
    </div>
    <div className="overview-columns">
      <section className="surface overview-main"><PanelHeading title="Your listings" detail="Track each pet through review and rehoming." action="Manage listings" onAction={() => navigate('seller')} />
        {pets.length ? <div className="activity-list">{pets.slice(0, 5).map((pet) => <button className="listing-row" key={pet.id} onClick={() => navigate('seller')}>
          <span className={`pet-avatar ${pet.species?.toLowerCase()}`}><Icon n="paw" s={18} /></span><span className="listing-copy"><b>{pet.name}</b><small>{pet.breed} · {pet.city} · {money(pet.price)}</small></span><span className={`tag ${stateTag(pet.status)}`}>{pet.status}</span><span className="row-date">{shortDate(pet.createdAt)}</span>
        </button>)}</div> : <EmptyLine icon="paw" title="Your first listing starts here" body="Introduce a pet and share what makes them special." action="Create listing" onAction={() => navigate('seller')} />}
      </section>
      <section className="surface overview-side"><PanelHeading title="Incoming requests" detail="Reply to adopters and buyers." action="View all" onAction={() => navigate('seller')} />
        {openRequests.length ? <div className="request-stack">{openRequests.slice(0, 4).map((r) => <div className="request-card" key={r._id}><span className="request-avatar"><Icon n="user" s={16} /></span><div><b>{r.buyerId?.name || 'New adopter'}</b><p>Interested in {r.petId?.name || 'your pet'}</p><small>{shortDate(r.createdAt)}</small></div><span className="request-new">New</span></div>)}</div> : <EmptyLine icon="chat" title="No pending requests" body="New messages and requests will show up here." />}
        <button className="wide-link" onClick={() => navigate('messages')}>Go to messages <Icon n="arrow" s={15} /></button>
      </section>
    </div>
  </>;
}

function BuyerOverview({ data, navigate }) {
  const favorites = data.favorites || [], requests = data.requests || [], listings = data.listings || [];
  const active = requests.filter((r) => !['Declined', 'Cancelled', 'Completed'].includes(r.status));
  return <>
    <div className="metric-grid">
      <Metric icon="heart" label="Saved pets" value={favorites.length} note="Your shortlist for later" tone="peach" />
      <Metric icon="doc" label="My requests" value={requests.length} note={`${active.length} still active`} tone="yellow" />
      <Metric icon="chat" label="Conversations" value={data.conversations?.length || 0} note="Talk directly in TailTribe" tone="mint" />
      <Metric icon="grid" label="Marketplace listings" value={data.total ?? 0} note="Published or currently held" tone="lilac" />
    </div>
    {active.length > 0 && <section className="surface buyer-requests"><PanelHeading title="Your adoption journey" detail="A clear view of the requests you have sent." action="Browse pets" onAction={() => navigate('browse')} />
      <div className="request-journey">{active.slice(0, 3).map((r) => <div className="journey-row" key={r._id}><span className="journey-check"><Icon n={r.status === 'Accepted' ? 'check' : 'clock'} s={16} /></span><span><b>{r.petId?.name || 'Pet request'}</b><small>{r.type === 'purchase' ? 'Purchase' : 'Adoption'} request · {shortDate(r.createdAt)}</small></span><span className={`tag ${r.status === 'Accepted' ? 't-ok' : 't-warn'}`}>{r.status}</span></div>)}</div>
    </section>}
    <section className="surface pet-discover"><PanelHeading title="Recently listed" detail={`${data.total ?? listings.length} pets currently looking for a home.`} action="See all pets" onAction={() => navigate('browse')} />
      {listings.length ? <div className="discover-grid">{listings.slice(0, 4).map((pet, i) => <button className="discover-card" key={pet.id} onClick={() => navigate('browse')}>
        <div className={`discover-art art-${i % 4}`}><span>{pet.species}</span>{pet.media?.[0]?.url ? <img src={pet.media[0].url} alt={`${pet.name}, ${pet.breed}`} loading="lazy" /> : <Icon n="paw" s={33} st={1.55} />}</div><div className="discover-info"><div><b>{pet.name}</b><span>{money(pet.price)}</span></div><small>{pet.breed} · {pet.city}</small></div>
      </button>)}</div> : <EmptyLine icon="search" title="No pets listed right now" body="Check back soon. New listings appear here after moderation." />}
    </section>
    <section className="surface saved-pets-panel" id="saved-pets"><PanelHeading title="Your saved pets" detail={favorites.length ? `${favorites.length} pet${favorites.length === 1 ? '' : 's'} in your shortlist.` : 'Save pets you love and compare them here.'} action="Find more pets" onAction={() => navigate('browse')} />
      {favorites.length ? <div className="saved-pet-list">{favorites.slice(0, 4).map((pet) => <div className="saved-pet-row" key={pet.id}><span className={`pet-avatar ${pet.species?.toLowerCase()}`}><Icon n="heart" s={16} /></span><span className="saved-pet-copy"><b>{pet.name}</b><small>{pet.breed} · {pet.city}</small></span><span className="saved-pet-price">{money(pet.price)}</span><span className={`tag ${stateTag(pet.status)}`}>{pet.status}</span></div>)}</div> : <EmptyLine icon="heart" title="Your shortlist is waiting" body="Save a listing while browsing and it will appear here." action="Browse pets" onAction={() => navigate('browse')} />}
    </section>
  </>;
}

function AdminOverview({ data, navigate }) {
  const s = data.stats || {};
  const tasks = [
    { label: 'Listing reviews', count: s.pendingListings || 0, icon: 'paw', text: 'New listings awaiting moderation' },
    { label: 'Identity checks', count: s.pendingKyc || 0, icon: 'shield', text: 'Seller documents awaiting review' },
    { label: 'Open reports', count: s.openReports || 0, icon: 'flag', text: 'Community reports to investigate' },
  ];
  return <>
    <div className="metric-grid admin-metrics">
      <Metric icon="user" label="Active accounts" value={s.activeUsers ?? 0} note="Accounts ready to use TailTribe" tone="peach" />
      <Metric icon="paw" label="Live listings" value={s.activeListings ?? 0} note="Published and accepting requests" tone="mint" />
      <Metric icon="clock" label="Active holds" value={s.activeReservations ?? 0} note="Temporary holds placed by adopters" tone="yellow" />
      <Metric icon="flag" label="Needs attention" value={(s.pendingListings || 0) + (s.pendingKyc || 0) + (s.openReports || 0)} note="Open reviews and reports" tone="lilac" />
    </div>
    <div className="overview-columns admin-overview-columns">
      <section className="surface overview-main"><PanelHeading title="Review queue" detail="Prioritize work that is waiting for a decision." action="Open moderation" onAction={() => navigate('admin')} />
        <div className="task-list">{tasks.map((task) => <button className="task-row" key={task.label} onClick={() => navigate('admin')}><span className="task-icon"><Icon n={task.icon} s={18} /></span><span className="task-copy"><b>{task.label}</b><small>{task.text}</small></span><span className={`task-count ${task.count ? 'has-work' : ''}`}>{task.count}</span><Icon n="chevron" s={16} /></button>)}</div>
        <button className="wide-link" onClick={() => navigate('admin')}>Go to moderation workspace <Icon n="arrow" s={15} /></button>
      </section>
      <section className="surface overview-side"><PanelHeading title="Recent activity" detail="Latest entries from the audit log." />
        {data.logs?.length ? <div className="audit-list">{data.logs.slice(0, 5).map((log) => <div className="audit-row" key={log._id}><span className="audit-dot" /><div><b>{log.action}</b><p>{log.actorId?.name || 'System'}{log.detail ? ` · ${log.detail}` : ''}</p><small>{shortDate(log.createdAt)}</small></div></div>)}</div> : <EmptyLine icon="doc" title="No activity yet" body="Moderation and account actions will appear here." />}
      </section>
    </div>
  </>;
}
