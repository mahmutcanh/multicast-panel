import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { api, call } from '../api/client';

const routes = [
  { path: '/login', name: 'login', component: () => import('../pages/LoginPage.vue'), meta: { public: true } },
  { path: '/reset-password', name: 'reset', component: () => import('../pages/ResetPasswordPage.vue'), meta: { public: true } },
  { path: '/installer', name: 'installer', component: () => import('../pages/InstallerPage.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('../layouts/AdminLayout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('../pages/DashboardPage.vue') },
      { path: 'channels', name: 'channels', component: () => import('../pages/ChannelsPage.vue'), meta: { perm: 'channel.view' } },
      { path: 'channels/new', name: 'channel-new', component: () => import('../pages/ChannelEditPage.vue'), meta: { perm: 'channel.create' } },
      { path: 'channels/:id', name: 'channel-edit', component: () => import('../pages/ChannelEditPage.vue'), meta: { perm: 'channel.view' } },
      { path: 'monitor', name: 'monitor', component: () => import('../pages/StreamMonitorPage.vue'), meta: { perm: 'stream.view' } },
      { path: 'library', name: 'library', component: () => import('../pages/LibraryPage.vue'), meta: { perm: 'video.view' } },
      { path: 'playlists', name: 'playlists', component: () => import('../pages/PlaylistsPage.vue'), meta: { perm: 'playlist.view' } },
      { path: 'epg', name: 'epg', component: () => import('../pages/EpgPage.vue'), meta: { perm: 'epg.view' } },
      { path: 'm3u', name: 'm3u', component: () => import('../pages/M3uPage.vue'), meta: { perm: 'm3u.export' } },
      { path: 'users', name: 'users', component: () => import('../pages/UsersPage.vue'), meta: { perm: 'user.view' } },
      { path: 'roles', name: 'roles', component: () => import('../pages/RolesPage.vue'), meta: { perm: 'role.view' } },
      { path: 'logs', name: 'logs', component: () => import('../pages/LogsPage.vue'), meta: { perm: 'logs.view' } },
      { path: 'alerts', name: 'alerts', component: () => import('../pages/AlertsPage.vue'), meta: { perm: 'alerts.manage' } },
      { path: 'backups', name: 'backups', component: () => import('../pages/BackupsPage.vue'), meta: { perm: 'backup.manage' } },
      { path: 'settings', name: 'settings', component: () => import('../pages/SettingsPage.vue'), meta: { perm: 'system.settings' } },
      { path: 'license', name: 'license', component: () => import('../pages/LicensePage.vue'), meta: { perm: 'license.manage' } },
      { path: 'api-tokens', name: 'api-tokens', component: () => import('../pages/ApiTokensPage.vue'), meta: { perm: 'token.manage' } },
      { path: 'profile', name: 'profile', component: () => import('../pages/ProfilePage.vue') },
    ],
  },
];

const router = createRouter({ history: createWebHistory(), routes });

let installChecked = false;

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  // first visit: redirect to installer when the panel has no admin yet
  if (!installChecked && to.name !== 'installer') {
    installChecked = true;
    try {
      const status = await call(api.get('/installer/status'));
      if (!status.installed) return { name: 'installer' };
    } catch {
      /* API not ready — let normal flow handle it */
    }
  }

  if (to.meta.public) return true;
  if (!auth.user) await auth.fetchMe();
  if (!auth.user) return { name: 'login', query: { redirect: to.fullPath } };
  if (to.meta.perm && !auth.can(to.meta.perm)) return { name: 'dashboard' };
  return true;
});

export default router;
