<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { setLocale } from '../i18n';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';
import { disconnectSocket } from '../api/socket';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();

const menu = computed(() =>
  [
    { name: 'dashboard', to: '/', label: t('nav.dashboard'), icon: '▦' },
    { name: 'channels', to: '/channels', label: t('nav.channels'), icon: '📡', perm: 'channel.view' },
    { name: 'monitor', to: '/monitor', label: t('nav.monitor'), icon: '📈', perm: 'stream.view' },
    { name: 'library', to: '/library', label: t('nav.library'), icon: '🎞', perm: 'video.view' },
    { name: 'playlists', to: '/playlists', label: t('nav.playlists'), icon: '🗂', perm: 'playlist.view' },
    { name: 'epg', to: '/epg', label: t('nav.epg'), icon: '🗓', perm: 'epg.view' },
    { name: 'm3u', to: '/m3u', label: t('nav.m3u'), icon: '⇅', perm: 'm3u.export' },
    { name: 'users', to: '/users', label: t('nav.users'), icon: '👤', perm: 'user.view' },
    { name: 'roles', to: '/roles', label: t('nav.roles'), icon: '🛡', perm: 'role.view' },
    { name: 'logs', to: '/logs', label: t('nav.logs'), icon: '🧾', perm: 'logs.view' },
    { name: 'alerts', to: '/alerts', label: t('nav.alerts'), icon: '🔔', perm: 'alerts.manage' },
    { name: 'backups', to: '/backups', label: t('nav.backups'), icon: '💾', perm: 'backup.manage' },
    { name: 'settings', to: '/settings', label: t('nav.settings'), icon: '⚙', perm: 'system.settings' },
    { name: 'license', to: '/license', label: t('nav.license'), icon: '🔑', perm: 'license.manage' },
    { name: 'api-tokens', to: '/api-tokens', label: t('nav.apiTokens'), icon: '🔐', perm: 'token.manage' },
  ].filter((m) => !m.perm || auth.can(m.perm)),
);

function switchLocale() {
  setLocale(locale.value === 'tr' ? 'en' : 'tr');
}

async function logout() {
  disconnectSocket();
  await auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="min-h-screen flex text-slate-900 dark:text-slate-100">
    <!-- Mobile overlay -->
    <div
      v-if="ui.sidebarOpen"
      class="fixed inset-0 z-30 bg-black/50 lg:hidden"
      @click="ui.sidebarOpen = false"
    />

    <!-- Sidebar -->
    <aside
      class="fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform"
      :class="ui.sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
    >
      <div class="h-16 flex items-center gap-2 px-5 border-b border-slate-200 dark:border-slate-800">
        <div class="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold">M</div>
        <div class="font-semibold text-sm leading-tight">{{ t('app.title') }}</div>
      </div>
      <nav class="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        <router-link
          v-for="item in menu"
          :key="item.name"
          :to="item.to"
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          :class="route.path === item.to ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium' : 'text-slate-600 dark:text-slate-300'"
          @click="ui.sidebarOpen = false"
        >
          <span class="w-5 text-center">{{ item.icon }}</span>
          <span class="truncate">{{ item.label }}</span>
        </router-link>
      </nav>
      <div class="p-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-400">v1.0.0</div>
    </aside>

    <!-- Main -->
    <div class="flex-1 flex flex-col min-w-0">
      <header class="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 px-4 sticky top-0 z-30">
        <button class="lg:hidden btn-secondary !px-3" @click="ui.sidebarOpen = !ui.sidebarOpen">☰</button>
        <div class="flex-1" />
        <button class="btn-secondary !px-3" :title="locale" @click="switchLocale">
          {{ locale === 'tr' ? '🇹🇷 TR' : '🇬🇧 EN' }}
        </button>
        <button class="btn-secondary !px-3" @click="ui.toggleDark">{{ ui.dark ? '☀️' : '🌙' }}</button>
        <router-link to="/profile" class="btn-secondary !px-3">
          👤 <span class="hidden sm:inline">{{ auth.user?.name }}</span>
        </router-link>
        <button class="btn-secondary !px-3" :title="t('nav.logout')" @click="logout">⎋</button>
      </header>
      <main class="flex-1 p-4 lg:p-6 overflow-x-hidden">
        <router-view />
      </main>
    </div>
  </div>
</template>
