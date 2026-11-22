import { useCallback, useEffect, useState } from 'react';
import './auth.css';

const EMPTY = { name: '', email: '', phone: '', company: '', source: '', status: 'New' };
const STATUSES = ['New', 'Contacted', 'Qualified', 'Lost'];
const SOURCES = ['Website', 'Referral', 'Social media', 'Email campaign', 'Event', 'Other'];

async function request(url, options) {
  const response = await fetch(url, options);
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed.');
    error.fields = data.errors || {};
    throw error;
  }
  return data;
}

function validate(form) {
  const errors = {};
  for (const field of ['name', 'email', 'phone', 'company', 'source']) {
    if (!form[field].trim()) errors[field] = 'This field is required.';
  }
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email.';
  if (form.phone.trim() && !/^[+\d][\d\s().-]{5,24}$/.test(form.phone.trim())) errors.phone = 'Enter a valid phone number.';
  return errors;
}

function Icon({ name, size = 18 }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10"/></>,
    chevron: <path d="m7 10 5 5 5-5"/>,
    filter: <><path d="M4 7h16M7 12h10m-7 5h4"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function LeadDialog({ lead, onClose, onSave }) {
  const [form, setForm] = useState(lead ? { ...lead } : { ...EMPTY });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key, value) => { setForm((prev) => ({ ...prev, [key]: value })); setErrors((prev) => ({ ...prev, [key]: '' })); };
  const submit = async (event) => {
    event.preventDefault();
    const validation = validate(form);
    if (Object.keys(validation).length) { setErrors(validation); return; }
    setBusy(true);
    try { await onSave(form); } catch (error) { setErrors(error.fields || {}); } finally { setBusy(false); }
  };
  const input = (key, label, placeholder, type = 'text') => <label className="field" key={key}>
    <span>{label} <b>*</b></span><input type={type} value={form[key]} placeholder={placeholder} onChange={(e) => set(key, e.target.value)} aria-invalid={!!errors[key]} />{errors[key] && <small>{errors[key]}</small>}
  </label>;
  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="dialog-head"><div><span className="eyebrow">LEAD DETAILS</span><h2 id="dialog-title">{lead ? 'Edit lead' : 'Add a new lead'}</h2><p>Keep your pipeline up to date.</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close"/></button></div>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">{input('name', 'Full name', 'e.g. Asha Rao')}{input('email', 'Email address', 'name@company.com', 'email')}{input('phone', 'Phone number', '+91 98765 43210', 'tel')}{input('company', 'Company', 'Company name')}
          <label className="field"><span>Source <b>*</b></span><select value={form.source} onChange={(e) => set('source', e.target.value)} aria-invalid={!!errors.source}><option value="">Select a source</option>{SOURCES.map((x) => <option key={x}>{x}</option>)}</select>{errors.source && <small>{errors.source}</small>}</label>
          <label className="field"><span>Status</span><select value={form.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map((x) => <option key={x}>{x}</option>)}</select></label>
        </div>
        {Object.keys(errors).some((key) => key === 'status') && <p className="form-error">{errors.status}</p>}
        <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : lead ? 'Save changes' : 'Add lead'}</button></div>
      </form>
    </section>
  </div>;
}

function Badge({ status }) { return <span className={`badge badge-${status.toLowerCase()}`}><i/>{status}</span>; }
function Avatar({ name }) { const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase(); return <span className={`avatar tone-${(initials.charCodeAt(0) || 65) % 5}`}>{initials}</span>; }

function LeadWorkspace({ user, onLogout }) {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ total: 0, counts: Object.fromEntries(STATUSES.map((status) => [status, 0])) });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [dialogLead, setDialogLead] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true); setFailure('');
    try {
      const params = new URLSearchParams(); if (query.trim()) params.set('q', query.trim()); if (statusFilter !== 'All statuses') params.set('status', statusFilter);
      const [data, summary] = await Promise.all([request(`/api/leads?${params}`), request('/api/stats')]); setLeads(data.leads); setStats(summary);
    } catch (error) { setFailure(`${error.message} Check that the API server is running.`); } finally { setLoading(false); }
  }, [query, statusFilter]);
  useEffect(() => { const timer = setTimeout(refresh, 180); return () => clearTimeout(timer); }, [refresh]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3000); return () => clearTimeout(timer); }, [notice]);
  const counts = stats.counts;
  const total = stats.total;
  const save = async (form) => {
    const editing = !!dialogLead;
    await request(editing ? `/api/leads/${dialogLead.id}` : '/api/leads', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setIsAdding(false); setDialogLead(null); setNotice(editing ? 'Lead updated successfully.' : 'Lead added successfully.'); await refresh();
  };
  const remove = async (lead) => {
    if (!window.confirm(`Delete ${lead.name} from your leads? This action cannot be undone.`)) return;
    try { await request(`/api/leads/${lead.id}`, { method: 'DELETE' }); setNotice('Lead deleted.'); await refresh(); }
    catch (error) { setFailure(error.message); }
  };
  const visibleCountText = `${leads.length} ${leads.length === 1 ? 'lead' : 'leads'}`;
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="#top"><span className="brand-mark"><Icon name="users" size={19}/></span><span>meru<span className="brand-dot">.</span></span></a>
      <div className="side-label">WORKSPACE</div><a className="nav-link active" href="#leads"><span className="nav-icon"><Icon name="users"/></span>Leads<span className="nav-count">{total}</span></a>
      <div className="sidebar-foot"><div className="help-card"><span className="help-spark">✳</span><strong>Keep it moving</strong><p>Every great customer relationship starts with a conversation.</p></div><div className="profile"><span className="profile-avatar">{user.name[0]?.toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></div></div>
    </aside>
    <main className="main" id="top"><header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <strong>Leads</strong></div><div className="topbar-right"><span className="online-dot"/><span className="private-label">Private workspace</span><span className="top-divider"/><span className="mini-avatar">{user.name[0]?.toUpperCase()}</span><button className="top-signout" onClick={onLogout}>Sign out</button></div></header>
      <div className="content" id="leads"><div className="page-intro"><div><div className="eyebrow">SALES WORKSPACE <span className="intro-dot">·</span> {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }).toUpperCase()}</div><h1>Your leads</h1><p>Keep every opportunity moving forward.</p></div><button className="button primary add-button" onClick={() => setIsAdding(true)}><Icon name="plus" size={17}/> Add lead</button></div>
        <div className="stats-grid"><div className="stat-card total-card"><div className="stat-top"><span className="stat-icon purple"><Icon name="users"/></span><span className="stat-caption">ALL LEADS</span></div><div className="stat-bottom"><strong>{total}</strong><span className="stat-note">in your pipeline <Icon name="arrow" size={14}/></span></div><div className="stat-accent"/></div>
          {STATUSES.map((status, i) => <div className="stat-card" key={status}><div className="stat-top"><span className={`status-mark mark-${status.toLowerCase()}`}/><span className="stat-caption">{status.toUpperCase()}</span><span className="stat-index">0{i + 1}</span></div><div className="stat-bottom"><strong>{counts[status] || 0}</strong><span className="stat-note">{total ? `${Math.round(((counts[status] || 0) / total) * 100)}% of leads` : 'No leads yet'}</span></div></div>)}
        </div>
        <section className="leads-panel"><div className="panel-heading"><div><h2>All leads <span className="count-pill">{visibleCountText}</span></h2><p>A clear view of every opportunity in your pipeline.</p></div><button className="button primary compact-add" onClick={() => setIsAdding(true)}><Icon name="plus" size={16}/> Add lead</button></div>
          <div className="toolbar"><label className="search-box"><Icon name="search" size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name…" aria-label="Search leads by name"/>{query && <button className="clear-search" onClick={() => setQuery('')} aria-label="Clear search"><Icon name="close" size={14}/></button>}</label>
            <label className="filter-box"><Icon name="filter" size={16}/><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status"><option>All statuses</option>{STATUSES.map((x) => <option key={x}>{x}</option>)}</select><Icon name="chevron" size={15}/></label><span className="result-count">{visibleCountText}</span></div>
          {failure && <div className="error-banner" role="alert">{failure}<button onClick={refresh}>Retry</button></div>}
          <div className="table-wrap"><table><thead><tr><th>LEAD</th><th>COMPANY</th><th>SOURCE</th><th>STATUS</th><th>ADDED</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {loading ? <tr><td colSpan="6" className="table-message"><span className="spinner"/> Loading leads…</td></tr> : leads.length === 0 ? <tr><td colSpan="6"><div className="empty-state"><span className="empty-icon"><Icon name="users" size={23}/></span><strong>{query || statusFilter !== 'All statuses' ? 'No matching leads' : 'Your pipeline starts here'}</strong><p>{query || statusFilter !== 'All statuses' ? 'Try changing your search or filter.' : 'Add your first lead to keep every opportunity in one place.'}</p>{!query && statusFilter === 'All statuses' && <button className="button primary" onClick={() => setIsAdding(true)}><Icon name="plus" size={16}/> Add your first lead</button>}</div></td></tr> : leads.map((lead) => <tr key={lead.id}><td><div className="person-cell"><Avatar name={lead.name}/><div><strong>{lead.name}</strong><span>{lead.email}</span></div></div></td><td className="company-cell">{lead.company}<span className="phone-sub">{lead.phone}</span></td><td><span className="source-label">{lead.source}</span></td><td><Badge status={lead.status}/></td><td className="date-cell">{new Date(`${lead.created_at.replace(' ', 'T')}Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td><td><div className="row-actions"><button className="icon-button small" title="Edit lead" aria-label={`Edit ${lead.name}`} onClick={() => setDialogLead(lead)}><Icon name="edit" size={16}/></button><button className="icon-button small danger-hover" title="Delete lead" aria-label={`Delete ${lead.name}`} onClick={() => remove(lead)}><Icon name="trash" size={16}/></button></div></td></tr>)}
          </tbody></table></div><div className="panel-footer"><span>Showing <strong>{leads.length}</strong> {leads.length === 1 ? 'lead' : 'leads'}</span><span>Lead Manager <span className="footer-dot">·</span> Built for better conversations</span></div>
        </section><footer className="page-footer">Made for teams that put people first <span>✳</span></footer>
      </div>
    </main>
    {(isAdding || dialogLead) && <LeadDialog lead={dialogLead} onClose={() => { setIsAdding(false); setDialogLead(null); }} onSave={save}/>}
    {notice && <div className="toast" role="status"><span>✓</span>{notice}</div>}
  </div>;
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const signup = mode === 'signup';
  const update = (key, value) => { setForm((prev) => ({ ...prev, [key]: value })); setErrors((prev) => ({ ...prev, [key]: '' })); setMessage(''); };
  const submit = async (event) => {
    event.preventDefault(); setMessage('');
    const nextErrors = {};
    if (signup && form.name.trim().length < 2) nextErrors.name = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) nextErrors.email = 'Enter a valid email address.';
    if (form.password.length < 8) nextErrors.password = 'Password must be at least 8 characters.';
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    setBusy(true);
    try {
      const result = await request(`/api/auth/${signup ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, name: form.name.trim(), email: form.email.trim() }) });
      onAuthenticated(result.user);
    } catch (error) { setErrors(error.fields || {}); setMessage(error.fields && Object.keys(error.fields).length ? '' : error.message); }
    finally { setBusy(false); }
  };
  return <main className="auth-page"><section className="auth-story"><a className="auth-brand" href="#"><span className="brand-mark"><Icon name="users" size={19}/></span>meru<span>.</span></a><div className="story-copy"><span className="story-kicker"><i/> YOUR SALES WORKSPACE</span><h1>Good conversations<br/>start <em>somewhere.</em></h1><p>Keep every opportunity close. Build better relationships, one thoughtful follow-up at a time.</p><div className="story-visual"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="story-spark spark-a">✳</div><div className="story-spark spark-b">✦</div><div className="float-card"><div className="float-card-top"><span className="float-avatar">AR</span><span><b>Asha Rao</b><small>New opportunity</small></span><span className="float-more">•••</span></div><div className="float-line"/><div className="float-card-bottom"><span><i/> New lead</span><span>Just now</span></div></div><div className="float-note"><span>↗</span><b>One place for every next step</b></div></div></div><div className="story-foot"><span>MERU TECHNOSOFT</span><span>PEOPLE FIRST. ALWAYS.</span></div></section>
    <section className="auth-panel"><div className="auth-mobile-brand"><span className="brand-mark"><Icon name="users" size={18}/></span><b>meru<span>.</span></b></div><div className="auth-card"><div className="auth-heading"><span className="auth-icon"><Icon name="users" size={19}/></span><span className="eyebrow">{signup ? 'CREATE YOUR WORKSPACE' : 'YOUR WORKSPACE AWAITS'}</span><h2>{signup ? 'Create your account' : 'Welcome back'}</h2><p>{signup ? 'Start your sales workspace in a few steps.' : 'Sign in to pick up where you left off.'}</p></div>
      <form className="auth-form" onSubmit={submit} noValidate>{signup && <label className="field"><span>Your name</span><input autoComplete="name" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Asha Rao" aria-invalid={!!errors.name}/>{errors.name && <small>{errors.name}</small>}</label>}<label className="field"><span>Email address</span><input type="email" autoComplete="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@company.com" aria-invalid={!!errors.email}/>{errors.email && <small>{errors.email}</small>}</label><label className="field"><span>Password</span><div className="password-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="At least 8 characters" aria-invalid={!!errors.password}/><button type="button" onClick={() => setShowPassword((prev) => !prev)}>{showPassword ? 'Hide' : 'Show'}</button></div>{errors.password && <small>{errors.password}</small>}</label>{message && <p className="auth-error" role="alert">{message}</p>}<button className="button primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}<span>→</span></button></form>
      <div className="auth-switch">{signup ? 'Already have an account?' : 'New to Meru?'} <button onClick={() => { setMode(signup ? 'login' : 'signup'); setErrors({}); setMessage(''); }}>{signup ? 'Sign in' : 'Create an account'}</button></div><div className="auth-secure"><span>▣</span> Your leads are private to your account</div>
    </div><footer className="auth-panel-foot">© {new Date().getFullYear()} Meru Technosoft <span>·</span> Secure sign in</footer></section></main>;
}

export default function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => { request('/api/auth/me').then((result) => setUser(result.user)).catch(() => setUser(null)); }, []);
  const logout = async () => { try { await request('/api/auth/logout', { method: 'POST' }); } finally { setUser(null); } };
  if (user === undefined) return <div className="auth-loading"><span className="spinner"/>Opening your private workspace…</div>;
  return user ? <LeadWorkspace user={user} onLogout={logout}/> : <AuthScreen onAuthenticated={setUser}/>;
}
