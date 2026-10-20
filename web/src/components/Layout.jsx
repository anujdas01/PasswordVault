import React, { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getTheme, applyTheme } from '../lib/theme.js';

const NAV = [
  { to: '/vault', label: 'Vault', icon: '🔑' },
  { to: '/generator', label: 'Generator', icon: '🎲' },
  { to: '/totp', label: 'TOTP', icon: '🕐' },
  { to: '/notes', label: 'Notes', icon: '📝' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Layout() {
  const { lock } = useAuth();
  const toast = useToast();
  const [theme, setTheme] = React.useState(getTheme());
  const location = useLocation();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        window.location.hash = '#/generator';
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <span>🔐</span>
            <span className="hidden sm:inline">PasswordVault</span>
          </div>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted hover:bg-surfaceAlt hover:text-text'
                  }`
                }
              >
                <span className="mr-1">{n.icon}</span>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={toggleTheme}
            className="btn-secondary px-2.5 py-1.5"
            data-tooltip={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button onClick={lock} className="btn-secondary px-2.5 py-1.5" data-tooltip="Lock vault">
            🔒
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
