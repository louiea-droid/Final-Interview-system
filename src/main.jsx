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
import AdminAnnouncements from './pages/AdminAnnouncements';
import AdminVisualBoard from './pages/AdminVisualBoard';
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
            The admin editor's "Preview" - the exact same board rendering as
            /visual, but reading the draft instead of the published layout,
            so it actually shows what unpublished changes will look like
            instead of the stale live board. A sibling of the AdminLayout
            group rather than nested in it, so it renders full-bleed like
            /visual does, not inside the admin sidebar shell.
          */}
          <Route
            path="/admin/visual-board/preview"
            element={
              <RequireAuth>
                <VisualBoard usePublished={false} />
              </RequireAuth>
            }
          />

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
            <Route path="announcements" element={<AdminAnnouncements />} />
            <Route path="visual-board" element={<AdminVisualBoard />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          <Route path="*" element={<Navigate to="/visual" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);
