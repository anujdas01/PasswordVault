import React, { useState, useEffect, useCallback } from 'react';
import { get, post, del } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/Modal.jsx';

export default function TotpPage() {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [codes, setCodes] = useState({}); // id -> {code, remaining, period}
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', secret: '', issuer: '', account: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await get('/totp');
      setList(data);
    } catch (err) {
      toast.error(err.message);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll codes every 1s while on page
  useEffect(() => {
    const tick = async () => {
      if (!list.length) return;
      const next = {};
      await Promise.all(
        list.map(async (t) => {
          try {
            const c = await get(`/totp/${t.id}/code`);
            next[t.id] = c;
          } catch {
            // ignore
          }
        })
      );
      setCodes(next);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [list]);

  const openCreate = () => {
    setForm({ name: '', secret: '', issuer: '', account: '' });
    setModal(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post('/totp', form);
      toast.success('TOTP added');
      setModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete TOTP "${t.name}"?`)) return;
    try {
      await del(`/totp/${t.id}`);
      toast.success('Deleted');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Code copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Authenticator (TOTP)</h1>
        <button onClick={openCreate} className="btn-primary">
          + Add TOTP
        </button>
      </div>

      {list.length === 0 ? (
        <div className="card text-center text-sm text-muted">
          No TOTP entries. Add one with a secret or an otpauth:// URI.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((t) => {
            const c = codes[t.id];
            const pct = c ? (c.remaining / c.period) * 100 : 0;
            return (
              <div key={t.id} className="card space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-xs text-muted">
                      {t.issuer} {t.account ? `· ${t.account}` : ''}
                    </div>
                  </div>
                  <button onClick={() => remove(t)} className="p-1 text-muted hover:text-negative" data-tooltip="Delete">
                    🗑️
                  </button>
                </div>
                {c ? (
                  <>
                    <button
                      onClick={() => copy(c.code)}
                      className="w-full font-mono text-3xl tracking-widest hover:opacity-80"
                    >
                      {c.code}
                    </button>
                    <div className="h-1.5 overflow-hidden rounded bg-surfaceAlt">
                      <div
                        className="h-full bg-accent transition-all duration-1000"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-right text-xs text-muted">{c.remaining}s</div>
                  </>
                ) : (
                  <div className="font-mono text-3xl tracking-widest text-muted">······</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title="Add TOTP" onClose={() => setModal(false)} footer={<Buttons busy={busy} submit={submit} close={() => setModal(false)} />}>
          <form onSubmit={submit} className="space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs text-muted">Name *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Secret (base32) or otpauth:// URI *</label>
              <input className="input font-mono" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted">Issuer</label>
                <input className="input" value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Account</label>
                <input className="input" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} />
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Buttons({ busy, submit, close }) {
  return (
    <>
      <button onClick={close} className="btn-secondary">
        Cancel
      </button>
      <button onClick={submit} className="btn-primary" disabled={busy}>
        Add
      </button>
    </>
  );
}
