<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, call } from '../api/client';
import { connectSocket, getSocket } from '../api/socket';
import LiveLogViewer from '../components/LiveLogViewer.vue';
import StatusBadge from '../components/StatusBadge.vue';

const { t } = useI18n();
const channels = ref([]);
const selected = ref(null);
const history = ref({}); // channelId -> bitrate points

function onStatus(p) {
  const ch = channels.value.find((c) => c.id === p.channelId);
  if (!ch) return;
  ch.status = p.state;
  ch.process = { ...(ch.process ?? {}), ...p, state: p.state };
  const arr = history.value[p.channelId] ?? (history.value[p.channelId] = []);
  arr.push(p.bitrateKbps ?? 0);
  if (arr.length > 60) arr.shift();
}

onMounted(async () => {
  channels.value = await call(api.get('/channels', { params: { limit: 500 } }));
  connectSocket(['status']).on('stream:status', onStatus);
});
onBeforeUnmount(() => getSocket().off('stream:status', onStatus));

function spark(points) {
  if (!points || points.length < 2) return '';
  const max = Math.max(...points, 1);
  const w = 120, h = 28;
  return points
    .map((v, i) => `${(i / (points.length - 1)) * w},${h - (v / max) * h}`)
    .join(' ');
}

function fmtUptime(sec) {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold text-slate-900 dark:text-white">{{ t('monitor.title') }}</h1>

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div
        v-for="ch in channels"
        :key="ch.id"
        class="card cursor-pointer hover:ring-2 hover:ring-brand-400"
        :class="selected?.id === ch.id ? 'ring-2 ring-brand-500' : ''"
        @click="selected = ch"
      >
        <div class="flex items-center justify-between mb-2">
          <div class="font-semibold truncate">{{ ch.name }}</div>
          <StatusBadge :state="ch.status" />
        </div>
        <div class="text-xs font-mono text-slate-500 mb-2">udp://{{ ch.udpIp }}:{{ ch.udpPort }}</div>
        <div class="flex items-end justify-between">
          <div class="space-y-1 text-xs text-slate-500">
            <div>{{ t('monitor.pid') }}: {{ ch.process?.pid ?? '—' }}</div>
            <div>{{ t('monitor.bitrate') }}: <span class="font-mono">{{ Math.round(ch.process?.bitrateKbps ?? 0) }} kb/s</span></div>
            <div>{{ t('dashboard.uptime') }}: {{ fmtUptime(ch.process?.uptimeSeconds) }}</div>
            <div>{{ t('monitor.restartCount') }}: {{ ch.process?.restartCount ?? 0 }}</div>
          </div>
          <svg v-if="history[ch.id]?.length > 1" width="120" height="28" class="text-brand-500">
            <polyline :points="spark(history[ch.id])" fill="none" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </div>
        <div v-if="ch.process?.lastError" class="mt-2 text-xs text-red-500 truncate" :title="ch.process.lastError">
          {{ t('monitor.lastError') }}: {{ ch.process.lastError }}
        </div>
      </div>
    </div>

    <div v-if="selected" class="card">
      <h2 class="font-semibold mb-3">{{ selected.name }} — {{ t('dashboard.liveLogs') }}</h2>
      <LiveLogViewer :key="selected.id" :channel-id="selected.id" />
    </div>
  </div>
</template>
