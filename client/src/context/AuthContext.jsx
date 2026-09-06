import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { get, post, setUnauthorizedHandler, ApiError } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [booting, setBooting] = useState(true);
  const [setupRequired, setSetupRequired] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [autoLockMinutes, setAutoLockMinutes] = useState(5);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  const refreshStatus = useCallback(async (silent = false) => {
    try {
      const st = await get('/auth/status');
      setSetupRequired(st.setup_required);
      setUnlocked(st.unlocked && !st.setup_required);
      setAutoLockMinutes(st.auto_lock_minutes);
      if (!silent) setError('');
    } catch (err) {
      if (!silent) setError(err.message);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      get('/auth/status')
        .then((st) => {
          const unlockedNow = st.unlocked && !st.setup_required;
          setSetupRequired(st.setup_required);
          setUnlocked(unlockedNow);
          setAutoLockMinutes(st.auto_lock_minutes);
        })
        .catch(() => {});
    }, 15000);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUnlocked(false);
    });
    (async () => {
      const st = await get('/auth/status');
      setSetupRequired(st.setup_required);
      setUnlocked(st.unlocked && !st.setup_required);
      setAutoLockMinutes(st.auto_lock_minutes);
      if (st.unlocked && !st.setup_required) startPolling();
      setBooting(false);
    })();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startPolling]);

  const login = useCallback(
    async (password) => {
      try {
        await post('/auth/login', { password });
        const st = await get('/auth/status');
        setSetupRequired(st.setup_required);
        setUnlocked(st.unlocked && !st.setup_required);
        setError('');
        startPolling();
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [startPolling]
  );

  const setup = useCallback(
    async (password, confirm) => {
      try {
        await post('/auth/setup', { password, confirm_password: confirm });
        const st = await get('/auth/status');
        setSetupRequired(false);
        setUnlocked(true);
        setError('');
        startPolling();
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [startPolling]
  );

  const lock = useCallback(async () => {
    try {
      await post('/auth/lock');
    } catch {
      // ignore
    }
    setUnlocked(false);
    setError('');
  }, []);

  const showApp = unlocked && !setupRequired && !booting;

  return (
    <AuthContext.Provider
      value={{
        booting,
        setupRequired,
        unlocked,
        autoLockMinutes,
        error,
        login,
        setup,
        lock,
        refreshStatus,
        showApp,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
