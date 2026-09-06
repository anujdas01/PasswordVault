import React, { useState, useEffect, useCallback } from 'react';
import { get, post, put, del } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/Modal.jsx';
import { strengthRating, STRENGTH_COLORS, STRENGTH_LABELS } from '../lib/strength.js';

const emptyPassword = () => ({
  title: '',
  username: '',
  password: '',
  url: '',
  notes: '',
  category_id: null,
  tags: [],
});

export default function VaultPage() {
  const toast = useToast();
  const searchRef = React.useRef(null);
  const [list, setList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [modal, setModal] = useState(null); // {mode:'create'|'edit'|'open', pwd?}
  const [form, setForm] = useState(emptyPassword());
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (tag) params.set('tag', tag);
    const query = params.toString();
    try {
      const [pwds, cats] = await Promise.all([get(`/passwords${query ? '?' + query : ''}`), get('/categories')]);
      setList(pwds);
      setCategories(cats);
    } catch (err) {
      toast.error(err.message);
    }
  }, [q, category, tag, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (modal) return;
    get('/tags')
      .then(setAllTags)
      .catch(() => {});
  }, [modal]);

  useEffect(() => {
    const onKey = (e) => {
      const target = e.target;
      const tag = target && (target.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;
      if (e.key === '/' && searchRef.current) {
        e.preventDefault();
        searchRef.current.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openCreate = () => {
    setForm({ ...emptyPassword(), category_id: category ? Number(category) : null });
    setShowPw(false);
    setModal({ mode: 'create' });
  };

  const openEdit = (pwd) => {
    setForm({
      title: pwd.title,
      username: pwd.username,
      password: '',
      url: pwd.url,
      notes: '',
      category_id: pwd.category_id,
      tags: pwd.tags,
    });
    setShowPw(false);
    setModal({ mode: 'edit', pwd });
  };

  const openView = async (pwd) => {
    try {
      const full = await get(`/passwords/${pwd.id}`);
      setModal({ mode: 'open', pwd: full });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (modal.mode === 'create') {
        await post('/passwords', form);
        toast.success('Password created');
      } else {
        await put(`/passwords/${modal.pwd.id}`, form);
        toast.success('Password updated');
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleFavorite = async (pwd) => {
    try {
      await post(`/passwords/${pwd.id}/favorite`, { favorite: !pwd.favorite });
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const copyUsername = async (pwd) => {
    if (pwd.username) {
      await copy(pwd.username, 'Username');
    } else {
      toast.error('No username');
    }
  };

  const copyPassword = async (pwd) => {
    try {
      const full = pwd.password ? pwd : await get(`/passwords/${pwd.id}`);
      if (full.password) {
        await copy(full.password, 'Password');
      } else {
        toast.error('No password saved');
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const [menuFor, setMenuFor] = useState(null);
  const menuRef = React.useRef(null);

  const closeMenu = useCallback(() => setMenuFor(null), []);

  useEffect(() => {
    if (!menuFor) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) closeMenu();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuFor, closeMenu]);

  const removePassword = async (pwd) => {
    if (!window.confirm(`Delete password "${pwd.title}"?`)) return;
    try {
      await del(`/passwords/${pwd.id}`);
      toast.success('Deleted');
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Copy failed');
    }
  };

  const toggleTag = (name) => {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(name) ? f.tags.filter((t) => t !== name) : [...f.tags, name],
    }));
  };

  const [label, rating] = strengthRating(form.password);
  const editing = modal && modal.mode !== 'open';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Password Vault</h1>
        <button onClick={openCreate} className="btn-primary">
          + Add Password
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={searchRef}
          className="input max-w-xs"
          placeholder="Search… ( / )"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input max-w-[10rem]" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <select className="input max-w-[10rem]" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {list.length === 0 ? (
        <div className="card text-center text-sm text-muted">No passwords yet.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted">
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Username</th>
                <th className="hidden px-3 py-2 md:table-cell">URL</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-surfaceAlt" onClick={() => openView(p)}>
                  <td className="px-3 py-2.5">
                    <span className="mr-1">{p.favorite ? '★' : ''}</span>
                    {p.title}
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {p.tags.map((t) => (
                        <span key={t} className="rounded bg-surfaceAlt px-1.5 text-xs text-muted">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">{p.username}</td>
                  <td className="hidden px-3 py-2.5 text-muted md:table-cell">{p.url}</td>
                  <td className="px-3 py-2.5">
                    {p.category_name ? (
                      <span className="inline-flex items-center gap-1">
                        <span>{p.category_icon}</span>
                        {p.category_name}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => copyUsername(p)} className="p-1 text-muted hover:text-text" data-tooltip="Copy username" aria-label="Copy username">
                        👤
                      </button>
                      <button onClick={() => copyPassword(p)} className="p-1 text-muted hover:text-text" data-tooltip="Copy password" aria-label="Copy password">
                        🔑
                      </button>
                      <button onClick={() => toggleFavorite(p)} className="p-1 text-muted hover:text-amber-400" data-tooltip={p.favorite ? 'Unfavorite' : 'Favorite'} aria-label={p.favorite ? 'Unfavorite' : 'Favorite'}>
                        {p.favorite ? '★' : '☆'}
                      </button>
                      <button onClick={() => openEdit(p)} className="p-1 text-muted hover:text-text" data-tooltip="Edit" aria-label="Edit">
                        ✏️
                      </button>
                      <button onClick={() => removePassword(p)} className="p-1 text-muted hover:text-negative" data-tooltip="Delete" aria-label="Delete">
                        🗑️
                      </button>
                      <div className="relative" ref={menuRef}>
                        <button
                          onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                          className="rounded p-1 text-muted hover:bg-surfaceAlt hover:text-text"
                          data-tooltip="More actions"
                          aria-label="More actions"
                          aria-expanded={menuFor === p.id}
                        >
                          ⋯
                        </button>
                        {menuFor === p.id && (
                          <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-md border border-border bg-surface shadow-lg">
                            <MenuBtn onClick={() => { openView(p); closeMenu(); }}>👁️ View details</MenuBtn>
                            <MenuBtn onClick={() => { copyUsername(p); closeMenu(); }}>👤 Copy username</MenuBtn>
                            <MenuBtn onClick={() => { copyPassword(p); closeMenu(); }}>🔑 Copy password</MenuBtn>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && modal.mode === 'open' && (
        <Modal title={modal.pwd.title} onClose={() => setModal(null)}>
          <div className="space-y-3 text-sm">
            {modal.pwd.username && <Row label="Username" value={modal.pwd.username} onCopy={() => copy(modal.pwd.username, 'Username')} />}
            <div>
              <div className="mb-1 text-xs text-muted">Password</div>
              <div className="flex items-center gap-2 rounded border border-border bg-surfaceAlt px-3 py-2">
                <span className="flex-1 font-mono">{showPw ? modal.pwd.password : '•'.repeat(Math.min(modal.pwd.password.length, 20))}</span>
                <button onClick={() => setShowPw((v) => !v)} className="text-xs text-muted hover:text-text">
                  {showPw ? 'Hide' : 'Show'}
                </button>
                <button onClick={() => copy(modal.pwd.password, 'Password')} className="text-xs text-muted hover:text-text">
                  Copy
                </button>
              </div>
            </div>
            {modal.pwd.url && <Row label="URL" value={modal.pwd.url} onCopy={() => copy(modal.pwd.url, 'URL')} />}
            <div>
              <div className="mb-1 text-xs text-muted">Notes</div>
              <div className="whitespace-pre-wrap rounded border border-border bg-surfaceAlt px-3 py-2">
                {modal.pwd.notes_cipher || modal.pwd.notes || '—'}
              </div>
            </div>
            {modal.pwd.category_name && (
              <Row label="Category" value={`${modal.pwd.category_icon} ${modal.pwd.category_name}`} />
            )}
          </div>
        </Modal>
      )}

      {modal && editing && (
        <Modal
          title={modal.mode === 'create' ? 'Add Password' : 'Edit Password'}
          onClose={() => setModal(null)}
          footer={
            <>
              {modal.mode === 'edit' && (
                <button onClick={() => removePassword(modal.pwd)} className="btn-danger mr-auto">
                  Delete
                </button>
              )}
              <button onClick={() => setModal(null)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={submit} className="btn-primary" disabled={busy}>
                Save
              </button>
            </>
          }
        >
          <form onSubmit={submit} className="space-y-3 text-sm">
            <Field label="Title *">
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>
            <Field label="Username">
              <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </Field>
            <Field label="Password">
              <div className="flex gap-2">
                <input type={showPw ? 'text' : 'password'} className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="btn-secondary shrink-0">
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-surfaceAlt">
                  <div className="h-full" style={{ width: `${(rating / 4) * 100}%`, backgroundColor: STRENGTH_COLORS[rating] }} />
                </div>
                <span className="text-xs" style={{ color: STRENGTH_COLORS[rating] }}>
                  {STRENGTH_LABELS[rating]}
                </span>
              </div>
            </Field>
            <Field label="URL">
              <input className="input" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </Field>
            <Field label="Notes">
              <textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <Field label="Category">
              <select className="input" value={form.category_id ?? ''} onChange={(e) => setForm({ ...form, category_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tags">
              <div className="flex flex-wrap gap-2">
                {allTags.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => toggleTag(t.name)}
                    className={`rounded px-2 py-1 text-xs ${
                      form.tags.includes(t.name) ? 'bg-primary text-white' : 'bg-surfaceAlt text-muted'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
                {allTags.length === 0 && <span className="text-xs text-muted">No tags yet</span>}
              </div>
            </Field>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted">{label}</label>
      {children}
    </div>
  );
}

function MenuBtn({ children, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surfaceAlt ${
        danger ? 'text-negative hover:text-negative' : 'text-text'
      }`}
    >
      {children}
    </button>
  );
}

function Row({ label, value, onCopy }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <div className="text-xs text-muted">{label}</div>
        <div className="font-mono">{value}</div>
      </div>
      {onCopy && (
        <button onClick={() => onCopy()} className="btn-secondary px-2 py-1 text-xs">
          Copy
        </button>
      )}
    </div>
  );
}
