import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import './styles/globals.css';
import './styles/tailwind.css';
import './styles/fonts.css';
import './styles/admin-shell.css';
import './styles/login.css';

import { ToastProvider } from './components/ToastProvider';
import RequireAuth from './components/RequireAuth';

import VisualBoard from './pages/VisualBoard';
import AdminLogin from './pages/AdminLogin';
import AdminLayout from './pages/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminHistory from './pages/AdminHistory';
import AdminRecords from './pages/AdminRecords';
import AdminSettings from './pages/AdminSettings';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          {/* the board is the public face of the app */}
          <Route path="/" element={<Navigate to="/visual" replace />} />
          <Route path="/visual" element={<VisualBoard />} />

          <Route path="/admin/login" element={<AdminLogin />} />

          {/*
            Replaces the old Next.js middleware guard. While we are running
            on the local backend this is a convenience redirect only - see
            the note in lib/localAuth.js.
          */}
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="history" element={<AdminHistory />} />
            <Route path="records" element={<AdminRecords />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          <Route path="*" element={<Navigate to="/visual" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);
