import React from 'react';
import {
  Activity,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Building2,
  ClipboardList,
  FileStack,
  Gauge,
  HelpCircle,
  LayoutDashboard,
  Mail,
  Megaphone,
  MessageSquare,
  Shield,
  Target,
  UserRound,
  Users,
} from 'lucide-react';
import WorkspaceShell from '../../components/WorkspaceShell.jsx';
import ProtectedRoute from '../../components/ProtectedRoute.jsx';
import { useFetch } from '../../lib/hooks.js';

export const ADMIN_NAV = [
  {
    label: 'Control',
    items: [
      { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/admin/activity', label: 'Activity log', icon: Activity },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/admin/employees', label: 'Employees', icon: Users },
      { to: '/admin/candidates', label: 'Candidates', icon: UserRound },
      { to: '/admin/admins', label: 'Administrators', icon: Shield },
      { to: '/admin/applications', label: 'Applications', icon: FileStack },
      { to: '/admin/jobs', label: 'Job openings', icon: Briefcase },
    ],
  },
  {
    label: 'Quality',
    items: [
      { to: '/admin/guidelines', label: 'Guidelines', icon: BookOpen },
      { to: '/admin/question-bank', label: 'Question bank', icon: HelpCircle },
      { to: '/admin/assessments', label: 'Assessments', icon: Target },
      { to: '/admin/results', label: 'Results & review', icon: ClipboardList },
      { to: '/admin/readiness', label: 'Readiness', icon: BadgeCheck },
    ],
  },
  {
    label: 'Studio',
    items: [
      { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
      { to: '/admin/feedback', label: 'Feedback', icon: MessageSquare },
      { to: '/admin/messages', label: 'Contact inbox', icon: Mail },
      { to: '/admin/company-info', label: 'Company profile', icon: Building2 },
    ],
  },
];

export default function AdminLayout() {
  const { data } = useFetch('/api/admin/overview');
  const kpis = data?.kpis;

  const badges = {
    '/admin/results': kpis?.pendingReview || 0,
    '/admin/applications': kpis?.newApplications || 0,
    '/admin/messages': kpis?.unreadMessages || 0,
    '/admin/feedback': kpis?.openFeedback || 0,
  };

  const nav = ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.map((item) => (badges[item.to] ? { ...item, badge: badges[item.to] } : item)),
  }));

  nav.mobile = [
    { to: '/admin', label: 'Overview', icon: Gauge, end: true },
    { to: '/admin/employees', label: 'People', icon: Users },
    { to: '/admin/assessments', label: 'Exams', icon: Target },
    { to: '/admin/results', label: 'Results', icon: ClipboardList },
    { to: '/admin/applications', label: 'Pipeline', icon: FileStack },
  ];

  return (
    <ProtectedRoute allow={['admin']} loginPath="/admin/login">
      <WorkspaceShell nav={nav} workspaceLabel="Admin console" homeTo="/admin" />
    </ProtectedRoute>
  );
}
