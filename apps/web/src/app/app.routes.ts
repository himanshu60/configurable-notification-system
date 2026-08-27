import type { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

/**
 * Every feature is lazily loaded, so the initial bundle carries the shell and
 * the login screen only.
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'rules',
        title: 'Notification rules',
        loadComponent: () =>
          import('./features/rules/rules-list/rules-list.component').then((m) => m.RulesListComponent),
      },
      {
        path: 'rules/new',
        title: 'New rule',
        loadComponent: () =>
          import('./features/rules/rule-editor/rule-editor.component').then((m) => m.RuleEditorComponent),
      },
      {
        path: 'rules/:id',
        title: 'Edit rule',
        loadComponent: () =>
          import('./features/rules/rule-editor/rule-editor.component').then((m) => m.RuleEditorComponent),
      },
      {
        path: 'simulator',
        title: 'Event simulator',
        loadComponent: () =>
          import('./features/events/simulator/simulator.component').then((m) => m.SimulatorComponent),
      },
      {
        path: 'history',
        title: 'Notification history',
        loadComponent: () =>
          import('./features/notifications/history/history.component').then((m) => m.HistoryComponent),
      },
      {
        path: 'inbox',
        title: 'Inbox',
        loadComponent: () =>
          import('./features/notifications/inbox/inbox.component').then((m) => m.InboxComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
