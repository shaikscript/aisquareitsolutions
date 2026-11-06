import React from 'react';
import {
  BadgeCheck,
  Bell,
  BookOpen,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Target,
} from 'lucide-react';
import WorkspaceShell from '../../components/WorkspaceShell.jsx';
import ProtectedRoute from '../../components/ProtectedRoute.jsx';
import { useFetch } from '../../lib/hooks.js';

export const PORTAL_NAV = [
  {
    label: 'Workspace',
    items: [
      { to: '/portal', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/portal/guidelines', label: 'Guidelines', icon: BookOpen },
      { to: '/portal/assessments', label: 'Assessments', icon: Target },
      { to: '/portal/results', label: 'Results', icon: ClipboardList },
      { to: '/portal/readiness', label: 'Readiness', icon: BadgeCheck },
    ],
  },
  {
    label: 'Studio',
    items: [
      { to: '/portal/announcements', label: 'Announcements', icon: Megaphone },
      { to: '/portal/notifications', label: 'Notifications', icon: Bell },
      { to: '/portal/feedback', label: 'Feedback', icon: MessageSquare },
    ],
  },
];

export default function PortalLayout() {
  const { data } = useFetch('/api/portal/notifications');

  const nav = PORTAL_NAV.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.to === '/portal/notifications' && data?.unread ? { ...item, badge: data.unread } : item
    ),
  }));

  nav.mobile = [
    { to: '/portal', label: 'Overview', icon: Gauge, end: true },
    { to: '/portal/guidelines', label: 'Read', icon: BookOpen },
    { to: '/portal/assessments', label: 'Exams', icon: Target },
    { to: '/portal/results', label: 'Results', icon: ClipboardList },
    { to: '/portal/feedback', label: 'Feedback', icon: MessageSquare },
  ];

  return (
    <ProtectedRoute allow={['employee']}>
      <WorkspaceShell nav={nav} workspaceLabel="Employee workspace" homeTo="/portal" />
    </ProtectedRoute>
  );
}
