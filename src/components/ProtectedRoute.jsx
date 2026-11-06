import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AppContext.jsx';
import { Loading } from './ui.jsx';

export default function ProtectedRoute({ children, allow = ['employee'], loginPath = '/login' }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
        <Loading label="Checking your session…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  const type = user.role === 'admin' ? 'admin' : user.accountType || 'employee';
  if (!allow.includes(type)) {
    const target = user.role === 'admin' ? '/admin' : user.accountType === 'candidate' ? '/exam-portal' : '/portal';
    return <Navigate to={target} replace />;
  }

  return children;
}
