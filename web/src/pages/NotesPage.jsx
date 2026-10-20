import React, { useState, useEffect, useCallback, useRef } from 'react';
import { get, post, put, del, postForm, getBlob } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/Modal.jsx';

export default function NotesPage() {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [viewing, setViewing] = useState(null); // full note with decrypted content
  const [modal, setModal] = useState(null); // {mode, note?}
  const [form, setForm] = useState({ title: '', content: '' });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await get(`/notes${q ? '?q=' + encodeURIComponent(q) : ''}`);
      setList(data);
    } catch (err) {
      toast.error(err.message);
    }
  }, [q, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const openView = async (note) => {
    try {
      const full = await get(`/notes/${note.id}`);
      setViewing(full);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openCreate = () => {
    setForm({ title: '', content: '' });
    setModal({ mode: 'create' });
  };

  const openEdit = (note) => {
    if (!note.content) {
      toast.info('Open the note to see its content before editing');
      return;
    }
    setForm({ title: note.title, content: note.content });
    setModal({ mode: 'edit', note });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (modal.mode === 'create') {
        await post('/notes', form);
        toast.success('Note created');
      } else {
        await put(`/notes/${modal.note.id}`, form);
        toast.success('Note updated');
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeNote = async (note) => {
    if (!window.confirm(`Delete note "${note.title}"?`)) return;
    try {
      await del(`/notes/${note.id}`);
      toast.success('Deleted');
      setViewing(null);
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const uploadAttachment = async (noteId, file) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      await postForm(`/attachments?note_id=${noteId}`, fd);
      toast.success('Attachment uploaded');
      const full = await get(`/notes/${noteId}`);
      setViewing(full);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const downloadAttachment = async (att) => {
    try {
      const res = await getBlob(`/attachments/${att.id}`);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const removeAttachment = async (att, noteId) => {
    if (!window.confirm(`Delete attachment "${att.filename}"?`)) return;
    try {
      await del(`/attachments/${att.id}`);
      toast.success('Deleted attachment');
      const full = await get(`/notes/${noteId}`);
      setViewing(full);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const fmtSize = (n) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Notes</h1>
        <button onClick={openCreate} className="btn-primary">
          + Add Note
        </button>
      </div>

      <input
        className="input max-w-xs"
        placeholder="Search notes…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {list.length === 0 ? (
        <div className="card text-center text-sm text-muted">No notes yet.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((n) => (
            <div key={n.id} className="card cursor-pointer transition-colors hover:bg-surfaceAlt" onClick={() => openView(n)}>
              <div className="flex items-center justify-between">
                <div className="font-semibold">{n.title}</div>
                {n.attachment_count > 0 && (
                  <span className="text-xs text-muted" data-tooltip={`${n.attachment_count} attachment(s)`}>
                    📎{n.attachment_count}
                  </span>
                )}
              </div>
              <div className="mt-1 truncate text-xs text-muted">{new Date(n.updated_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal
          title={modal.mode === 'create' ? 'Add Note' : 'Edit Note'}
          onClose={() => setModal(null)}
          footer={
            <>
              {modal.mode === 'edit' && (
                <button onClick={() => removeNote(modal.note)} className="btn-danger mr-auto">
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
            <div>
              <label className="mb-1 block text-xs text-muted">Title *</label>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Content</label>
              <textarea className="input" rows={6} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            </div>
          </form>
        </Modal>
      )}

      {viewing && (
        <Modal
          title={viewing.title}
          onClose={() => setViewing(null)}
          footer={
            <>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files && e.target.files[0];
                  if (f) uploadAttachment(viewing.id, f);
                  e.target.value = '';
                }}
              />
              <button onClick={() => openEdit(viewing)} className="btn-secondary">
                Edit
              </button>
              <button onClick={() => removeNote(viewing)} className="btn-danger">
                Delete
              </button>
              <button
                onClick={() => fileRef.current && fileRef.current.click()}
                className="btn-primary"
              >
                Attach File
              </button>
            </>
          }
        >
          <div className="space-y-3 text-sm">
            <div className="whitespace-pre-wrap rounded border border-border bg-surfaceAlt px-3 py-2">
              {viewing.content || '—'}
            </div>
            {viewing.attachments.length > 0 && (
              <div>
                <div className="mb-1 text-xs text-muted">Attachments ({viewing.attachments.length})</div>
                <div className="space-y-1">
                  {viewing.attachments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded border border-border px-3 py-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span>📎</span>
                        <span className="truncate">{a.filename}</span>
                        <span className="text-xs text-muted">({fmtSize(a.size)})</span>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => downloadAttachment(a)} className="text-xs text-muted hover:text-text">
                          Download
                        </button>
                        <button onClick={() => removeAttachment(a, viewing.id)} className="text-xs text-negative">
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
