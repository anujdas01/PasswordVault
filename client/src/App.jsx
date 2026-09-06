import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import LockScreen from './pages/LockScreen.jsx';
import Layout from './components/Layout.jsx';
import VaultPage from './pages/VaultPage.jsx';
import GeneratorPage from './pages/GeneratorPage.jsx';
import TotpPage from './pages/TotpPage.jsx';
import NotesPage from './pages/NotesPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

export default function App() {
  const { booting, showApp } = useAuth();

  if (booting) {
    return (
      <div className="flex h-screen items-center justify-center text-muted">
        <div className="text-sm">Loading…</div>
      </div>
    );
  }

  if (!showApp) {
    return <LockScreen />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/vault" replace />} />
        <Route path="/vault" element={<VaultPage />} />
        <Route path="/generator" element={<GeneratorPage />} />
        <Route path="/totp" element={<TotpPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/vault" replace />} />
      </Route>
    </Routes>
  );
}
