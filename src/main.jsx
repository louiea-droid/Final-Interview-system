import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import './styles/globals.css';
import './styles/tailwind.css';
import './styles/fonts.css';

import { ToastProvider } from './components/ToastProvider';
import RequireAuth from './components/RequireAuth';

import VisualBoard from './pages/VisualBoard';
import AdminLogin from './pages/AdminLogin';
import AdminLayout from './pages/AdminLayout';
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
            Replaces the old Next.js middleware guard. The redirect here is
            only a convenience for the person using the app - what actually
            protects the data is Firebase Auth plus Firestore security rules,
            which the browser cannot talk its way around.
          */}
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            }
          >
            {/* TODO: the dashboard and history pages still read from Supabase;
                porting their data layer to Firestore is the next step */}
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          <Route path="*" element={<Navigate to="/visual" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);
