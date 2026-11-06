import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, ThemeProvider, ToastProvider } from './context/AppContext.jsx';

import PublicLayout from './components/SiteChrome.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

import HomePage from './pages/public/HomePage.jsx';
import AboutPage from './pages/public/AboutPage.jsx';
import CareersPage from './pages/public/CareersPage.jsx';
import ContactPage from './pages/public/ContactPage.jsx';
import LegalPage from './pages/public/LegalPage.jsx';
import NotFoundPage from './pages/public/NotFoundPage.jsx';
import AuthPage from './pages/public/AuthPage.jsx';

import PortalLayout from './pages/portal/PortalLayout.jsx';
import PortalDashboard from './pages/portal/PortalDashboard.jsx';
import { PortalGuidelines, PortalGuidelineDetail } from './pages/portal/PortalGuidelines.jsx';
import { PortalAssessments, AssessmentRunner, PortalResults } from './pages/portal/PortalAssessments.jsx';
import PortalReadiness from './pages/portal/PortalReadiness.jsx';
import { PortalAnnouncements, PortalNotifications, PortalFeedback } from './pages/portal/PortalComms.jsx';
import ExamPortalLayout from './pages/portal/ExamPortalLayout.jsx';

import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminPeople from './pages/admin/AdminPeople.jsx';
import AdminAdmins from './pages/admin/AdminAdmins.jsx';
import AdminGuidelines from './pages/admin/AdminGuidelines.jsx';
import AdminQuestionBank from './pages/admin/AdminQuestionBank.jsx';
import AdminAssessments from './pages/admin/AdminAssessments.jsx';
import AdminResults from './pages/admin/AdminResults.jsx';
import AdminReadiness from './pages/admin/AdminReadiness.jsx';
import AdminApplications from './pages/admin/AdminApplications.jsx';
import {
  AdminJobs,
  AdminMessages,
  AdminAnnouncements,
  AdminFeedback,
  AdminCompanyInfo,
  AdminActivity,
} from './pages/admin/AdminStudio.jsx';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div className="card card--pad" style={{ maxWidth: 520 }}>
            <h1 className="h3">The interface hit an unexpected state.</h1>
            <p style={{ color: 'var(--muted)', margin: '10px 0 18px', fontSize: '0.88rem' }}>
              {this.state.error.message || 'Unknown rendering error.'}
            </p>
            <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
              Reload workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const element = document.getElementById(hash.slice(1));
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash]);
  return null;
}

const ROUTER_BASENAME = (() => {
  const injected = typeof window !== 'undefined' ? window.__AISQUARE_BASE__ : '';
  return typeof injected === 'string' && injected && injected !== '/' ? injected.replace(/\/+$/, '') : '/';
})();

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter basename={ROUTER_BASENAME}>
              <ScrollManager />
              <Routes>
                <Route element={<PublicLayout />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/careers" element={<CareersPage />} />
                  <Route path="/contact" element={<ContactPage />} />
                  <Route path="/privacy" element={<LegalPage kind="privacy" />} />
                  <Route path="/terms" element={<LegalPage kind="terms" />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>

                <Route path="/login" element={<AuthPage scope="employee" />} />
                <Route path="/exam-login" element={<AuthPage scope="candidate" />} />
                <Route path="/admin/login" element={<AuthPage scope="admin" />} />

                {/* full-screen assessment runners */}
                <Route
                  path="/portal/assessments/take/:attemptId"
                  element={
                    <ProtectedRoute allow={['employee']}>
                      <AssessmentRunner basePath="/portal" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/exam-portal/take/:attemptId"
                  element={
                    <ProtectedRoute allow={['candidate', 'employee']} loginPath="/exam-login">
                      <AssessmentRunner basePath="/exam-portal" />
                    </ProtectedRoute>
                  }
                />

                <Route path="/exam-portal" element={<ExamPortalLayout />}>
                  <Route index element={<PortalAssessments basePath="/exam-portal" />} />
                  <Route path="results" element={<PortalResults basePath="/exam-portal" />} />
                  <Route path="*" element={<Navigate to="/exam-portal" replace />} />
                </Route>

                <Route path="/portal" element={<PortalLayout />}>
                  <Route index element={<PortalDashboard />} />
                  <Route path="guidelines" element={<PortalGuidelines />} />
                  <Route path="guidelines/:id" element={<PortalGuidelineDetail />} />
                  <Route path="assessments" element={<PortalAssessments basePath="/portal" />} />
                  <Route path="results" element={<PortalResults basePath="/portal" />} />
                  <Route path="readiness" element={<PortalReadiness />} />
                  <Route path="announcements" element={<PortalAnnouncements />} />
                  <Route path="notifications" element={<PortalNotifications />} />
                  <Route path="feedback" element={<PortalFeedback />} />
                  <Route path="*" element={<Navigate to="/portal" replace />} />
                </Route>

                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="employees" element={<AdminPeople mode="employee" />} />
                  <Route path="candidates" element={<AdminPeople mode="candidate" />} />
                  <Route path="admins" element={<AdminAdmins />} />
                  <Route path="guidelines" element={<AdminGuidelines />} />
                  <Route path="question-bank" element={<AdminQuestionBank />} />
                  <Route path="assessments" element={<AdminAssessments />} />
                  <Route path="results" element={<AdminResults />} />
                  <Route path="readiness" element={<AdminReadiness />} />
                  <Route path="applications" element={<AdminApplications />} />
                  <Route path="jobs" element={<AdminJobs />} />
                  <Route path="messages" element={<AdminMessages />} />
                  <Route path="announcements" element={<AdminAnnouncements />} />
                  <Route path="feedback" element={<AdminFeedback />} />
                  <Route path="company-info" element={<AdminCompanyInfo />} />
                  <Route path="activity" element={<AdminActivity />} />
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
