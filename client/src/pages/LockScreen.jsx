import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { estimateEntropy } from '../lib/strength.js';

export default function LockScreen() {
  const { setupRequired, error, login, setup } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setLocalError('');
  }, [setupRequired]);

  useEffect(() => {
    if (error) setLocalError(error);
  }, [error]);

  const rating = estimateEntropy(password);
  const colors = ['#888', '#d64545', '#e0a63c', '#5a9be0', '#2e9e5b'];
  const labels = ['Empty', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];

  const submit = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (setupRequired) {
      if (password.length < 8) {
        setLocalError('Master password must be at least 8 characters');
        return;
      }
      if (password !== confirm) {
        setLocalError('Passwords do not match');
        return;
      }
      setBusy(true);
      try {
        await setup(password, confirm);
      } catch (err) {
        setLocalError(err.message);
      } finally {
        setBusy(false);
      }
    } else {
      setBusy(true);
      try {
        await login(password);
      } catch (err) {
        setLocalError(err.message);
      } finally {
        setBusy(false);
      }
    }
  };

  const inputType = showPw ? 'text' : 'password';

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-4xl">🔐</div>
        <h1 className="mb-1 text-center text-xl font-semibold">PasswordVault</h1>
        <p className="mb-6 text-center text-sm text-muted">
          {setupRequired ? 'Create your master password to get started' : 'Enter your master password to unlock'}
        </p>
        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="mb-1 block text-sm text-muted">
              {setupRequired ? 'Master password' : 'Password'}
            </label>
            <div className="relative">
              <input
                type={inputType}
                className="input pr-16"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete={setupRequired ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 text-xs text-muted hover:text-text"
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {setupRequired && (
            <>
              <div>
                <label className="mb-1 block text-sm text-muted">Confirm password</label>
                <input
                  type={inputType}
                  className="input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted">Strength</span>
                  <span style={{ color: colors[rating] }}>{labels[rating]}</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-surfaceAlt">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${(rating / 4) * 100}%`, backgroundColor: colors[rating] }}
                  />
                </div>
              </div>
            </>
          )}

          {localError && <div className="rounded border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative">{localError}</div>}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Working…' : setupRequired ? 'Create Vault' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
}
