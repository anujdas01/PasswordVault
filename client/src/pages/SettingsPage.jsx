import React, { useState, useEffect, useCallback, useRef } from 'react';
import { get, post, put, del, postForm, getBlob } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/Modal.jsx';
import { getTheme, applyTheme, initTheme } from '../lib/theme.js';

export default function SettingsPage() {
  const toast = useToast();
  const { lock } = useAuth();
  const [theme, setTheme] = useState(getTheme());
  const [audit, setAudit] = useState([]);
  const [auditAction, setAuditAction] = useState('');
  const [cats, setCats] = useState([]);
  const [changeModal, setChangeModal] = useState({ open: false, cur: '', next: '', confirm: '' });
  const [catModal, setCatModal] = useState(null); // {mode, cat?}
  const [catForm, setCatForm] = useState({ name: '', icon: '📁', color: '#888', sort_order: 0 });
  const importRef = useRef(null);

  const loadAudit = useCallback(async () => {
    try {
      const data = await get(`/audit${auditAction ? '?action=' + encodeURIComponent(auditAction) : ''}`);
      setAudit(data);
    } catch (err) {
      toast.error(err.message);
    }
  }, [auditAction, toast]);

  const loadCats = useCallback(async () => {
    try {
      setCats(await get('/categories'));
    } catch (err) {
      toast.error(err.message);
    }
  }, [toast]);

  useEffect(() => {
    initTheme();
    loadAudit();
    loadCats();
  }, [loadAudit, loadCats]);

  const changePassword = async (e) => {
    e.preventDefault();
    if (changeModal.next.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (changeModal.next !== changeModal.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    try {
      await post('/auth/change', {
        current_password: changeModal.cur,
        new_password: changeModal.next,
      });
      toast.success('Master password changed');
      setChangeModal({ open: false, cur: '', next: '', confirm: '' });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const exportData = async (fmt) => {
    try {
      const res = await getBlob(`/export?format=${fmt}`);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.data.type.includes('csv') ? 'vault-export.csv' : 'vault-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const importData = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await postForm('/import', fd);
      toast.success(`Imported ${r.imported} item(s)`);
      if (r.skipped) toast.info(`${r.skipped} skipped`);
    } catch (err) {
      toast.error(err.message);
    }
    e.target.value = '';
  };

  const breachAudit = async () => {
    try {
      const r = await post('/breach/audit-all');
      const pwned = r.results.filter((x) => x.pwned);
      toast.success(`Checked ${r.results.length} password(s)`);
      if (pwned.length) {
        toast.info(`⚠ ${pwned.length} password(s) appear in breaches`);
      } else {
        toast.info('No passwords found in known breaches');
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const exportAuditCsv = () => {
    const header = ['id', 'action', 'entity_type', 'entity_id', 'detail', 'ip', 'created_at'];
    const lines = [header.join(',')];
    for (const row of audit) {
      lines.push(header.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const openCatCreate = () => {
    setCatForm({ name: '', icon: '📁', color: '#888', sort_order: 0 });
    setCatModal({ mode: 'create' });
  };

  const openCatEdit = (c) => {
    setCatForm({ name: c.name, icon: c.icon, color: c.color, sort_order: c.sort_order });
    setCatModal({ mode: 'edit', cat: c });
  };

  const saveCat = async (e) => {
    e.preventDefault();
    if (!catForm.name.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      if (catModal.mode === 'create') {
        await post('/categories', catForm);
        toast.success('Category created');
      } else {
        await put(`/categories/${catModal.cat.id}`, catForm);
        toast.success('Category updated');
      }
      setCatModal(null);
      loadCats();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const deleteCat = async (c) => {
    if (!window.confirm(`Delete category "${c.name}"? Passwords in it will be uncategorized.`)) return;
    try {
      await del(`/categories/${c.id}`);
      toast.success('Category deleted');
      loadCats();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const clearData = async () => {
    if (!window.confirm('Delete ALL passwords, notes, TOTPs, categories, tags and audit log? This cannot be undone.')) return;
    try {
      await post('/auth/clear?mode=data');
      toast.success('All data cleared');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const factoryReset = async () => {
    if (!window.confirm('Factory reset will delete ALL data AND the master password, returning to setup. Continue?')) return;
    try {
      await post('/auth/clear?mode=factory');
      lock();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  const colorFor = (c) =>
    c === 'create' ? 'var(--color-positive)' : c === 'delete' ? 'var(--color-negative)' : c === 'update' ? 'var(--color-accent)' : 'var(--color-muted)';

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* Security */}
      <Section title="Security">
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span>Theme</span>
            <button onClick={toggleTheme} className="btn-secondary px-2.5 py-1.5">
              {theme === 'dark' ? 'Dark' : 'Light'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span>Lock vault now</span>
            <button onClick={lock} className="btn-secondary px-2.5 py-1.5" data-tooltip="Lock immediately">
              🔒 Lock
            </button>
          </div>
          <button onClick={() => setChangeModal({ open: true, cur: '', next: '', confirm: '' })} className="btn-secondary">
            Change master password…
          </button>
        </div>
      </Section>

      {/* Data */}
      <Section title="Data">
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => exportData('json')} className="btn-secondary">
              Export JSON
            </button>
            <button onClick={() => exportData('csv')} className="btn-secondary">
              Export CSV
            </button>
            <button onClick={() => importRef.current && importRef.current.click()} className="btn-secondary">
              Import…
            </button>
            <input ref={importRef} type="file" accept=".csv,.json" className="hidden" onChange={importData} />
          </div>
          <div className="text-xs text-muted">
            Import accepts a PasswordVault JSON/CSV export or a browser (Edge/Chrome) CSV.
          </div>
          <button onClick={breachAudit} className="btn-secondary">
            Check all passwords against known breaches
          </button>
        </div>
      </Section>

      {/* Categories */}
      <Section
        title="Categories"
        action={
          <button onClick={openCatCreate} className="btn-secondary px-2.5 py-1.5">
            + Add
          </button>
        }
      >
        <div className="space-y-1">
          {cats.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded border border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                <span>{c.icon}</span>
                <span>{c.name}</span>
                <span className="text-xs text-muted">({c.count})</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openCatEdit(c)} className="text-xs text-muted hover:text-text">
                  Edit
                </button>
                <button onClick={() => deleteCat(c)} className="text-xs text-negative">
                  Delete
                </button>
              </div>
            </div>
          ))}
          {cats.length === 0 && <div className="text-xs text-muted">No categories yet.</div>}
        </div>
      </Section>

      {/* Audit log */}
      <Section
        title="Audit Log"
        action={
          <div className="flex gap-2">
            <select className="input !w-auto" value={auditAction} onChange={(e) => setAuditAction(e.target.value)}>
              <option value="">All actions</option>
              {['create', 'update', 'delete', 'view', 'import', 'login', 'setup', 'lock', 'clear'].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <button onClick={loadAudit} className="btn-secondary px-2.5 py-1.5">
              Refresh
            </button>
            <button onClick={exportAuditCsv} className="btn-secondary px-2.5 py-1.5">
              Export CSV
            </button>
          </div>
        }
      >
        {audit.length === 0 ? (
          <div className="text-sm text-muted">No audit events.</div>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-left text-xs uppercase text-muted">
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Detail</th>
                  <th className="hidden px-3 py-2 md:table-cell">IP</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2" style={{ color: colorFor(r.action) }}>
                      {r.action}
                    </td>
                    <td className="px-3 py-2 text-muted">{r.entity_type}</td>
                    <td className="px-3 py-2">{r.detail}</td>
                    <td className="hidden px-3 py-2 text-muted md:table-cell">{r.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Danger zone */}
      <Section title="Danger Zone">
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between rounded border border-negative/30 p-3">
            <div>
              <div className="font-medium">Clear all data</div>
              <div className="text-xs text-muted">Deletes passwords, notes, TOTPs, categories, tags, audit log. Keeps master password.</div>
            </div>
            <button onClick={clearData} className="btn-secondary border-negative/40 text-negative" data-tooltip="Clear all vault data">
              Clear…
            </button>
          </div>
          <div className="flex items-center justify-between rounded border border-negative/30 p-3">
            <div>
              <div className="font-medium">Factory reset</div>
              <div className="text-xs text-muted">Deletes everything including the master password. Vault returns to setup.</div>
            </div>
            <button onClick={factoryReset} className="btn-danger" data-tooltip="Factory reset vault">
              Reset…
            </button>
          </div>
        </div>
      </Section>

      {changeModal.open && (
        <Modal title="Change Master Password" onClose={() => setChangeModal({ ...changeModal, open: false })}>
          <form onSubmit={changePassword} className="space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs text-muted">Current password</label>
              <input type="password" className="input" value={changeModal.cur} onChange={(e) => setChangeModal({ ...changeModal, cur: e.target.value })} autoComplete="current-password" required />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">New password (min 8)</label>
              <input type="password" className="input" value={changeModal.next} onChange={(e) => setChangeModal({ ...changeModal, next: e.target.value })} autoComplete="new-password" required />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Confirm new password</label>
              <input type="password" className="input" value={changeModal.confirm} onChange={(e) => setChangeModal({ ...changeModal, confirm: e.target.value })} autoComplete="new-password" required />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setChangeModal({ ...changeModal, open: false })} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Change
              </button>
            </div>
          </form>
        </Modal>
      )}

      {catModal && (
        <Modal
          title={catModal.mode === 'create' ? 'Add Category' : 'Edit Category'}
          onClose={() => setCatModal(null)}
          footer={
            <>
              <button onClick={() => setCatModal(null)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={saveCat} className="btn-primary">
                Save
              </button>
            </>
          }
        >
          <form onSubmit={saveCat} className="space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs text-muted">Name *</label>
              <input className="input" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted">Icon</label>
                <input className="input" value={catForm.icon} onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Color</label>
                <input type="color" className="h-9 w-full cursor-pointer rounded border border-border bg-surface" value={catForm.color} onChange={(e) => setCatForm({ ...catForm, color: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Sort order</label>
                <input type="number" className="input" value={catForm.sort_order} onChange={(e) => setCatForm({ ...catForm, sort_order: Number(e.target.value) || 0 })} />
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
