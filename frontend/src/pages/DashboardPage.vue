<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, call } from '../api/client';
import { connectSocket, getSocket } from '../api/socket';
import LiveLogViewer from '../components/LiveLogViewer.vue';
import StatCard from '../components/StatCard.vue';

const { t } = useI18n();
const stats = ref(null);
const metrics = ref(null);
const alerts = ref([]);
let timer;

function onMetrics(m) { metrics.value = m; }
function onAlert(a) { alerts.value = [a, ...alerts.value].slice(0, 8); }

async function load() {
  stats.value = await call(api.get('/system/stats')).catch(() => stats.value);
  if (!metrics.value && stats.value?.metrics) metrics.value = stats.value.metrics;
}

onMounted(async () => {
  await load();
  const notif = await call(api.get('/alerts/notifications', { params: { limit: 8 } })).catch(() => []);
  alerts.value = Array.isArray(notif) ? notif : [];
  const s = connectSocket(['metrics', 'status', 'alerts', 'logs:all']);
  s.on('system:metrics', onMetrics);
  s.on('alert', onAlert);
  timer = setInterval(load, 10000);
});

onBeforeUnmount(() => {
  clearInterval(timer);
  const s = getSocket();
  s.off('system:metrics', onMetrics);
  s.off('alert', onAlert);
});

function fmtBitrate(kbps) {
  if (!kbps) return '0 kb/s';
  return kbps > 1000 ? `${(kbps / 1000).toFixed(1)} Mb/s` : `${Math.round(kbps)} kb/s`;
}
function fmtUptime(sec) {
  if (!sec) return '—';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold text-slate-900 dark:text-white">{{ t('dashboard.title') }}</h1>

    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <StatCard :title="t('dashboard.activeStreams')" :value="stats?.totals?.activeStreams ?? '—'" accent="green">
        <template #icon>▶</template>
      </StatCard>
      <StatCard :title="t('dashboard.totalChannels')" :value="stats?.totals?.channels ?? '—'">
        <template #icon>📡</template>
      </StatCard>
      <StatCard :title="t('dashboard.totalBitrate')" :value="fmtBitrate(stats?.totals?.totalBitrateKbps)" accent="amber">
        <template #icon>⇄</template>
      </StatCard>
      <StatCard :title="t('dashboard.crashed')" :value="stats?.totals?.crashed ?? 0" accent="red">
        <template #icon>✖</template>
      </StatCard>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4" v-if="metrics">
      <div class="card">
        <div class="label">{{ t('dashboard.cpu') }}</div>
        <div class="text-xl font-bold">{{ metrics.cpuPercent }}%</div>
        <div class="h-2 mt-2 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div class="h-full bg-brand-500" :style="{ width: `${Math.min(metrics.cpuPercent, 100)}%` }" />
        </div>
      </div>
      <div class="card">
        <div class="label">{{ t('dashboard.ram') }}</div>
        <div class="text-xl font-bold">{{ metrics.ramPercent }}%</div>
        <div class="text-xs text-slate-400">{{ metrics.ramUsedMb }} / {{ metrics.ramTotalMb }} MB</div>
      </div>
      <div class="card">
        <div class="label">{{ t('dashboard.disk') }}</div>
        <div class="text-xl font-bold">{{ metrics.diskPercent }}%</div>
        <div class="text-xs text-slate-400">{{ metrics.diskFreeGb }} GB free</div>
      </div>
      <div class="card">
        <div class="label">{{ t('dashboard.network') }}</div>
        <div class="text-xl font-bold">↓{{ metrics.netRxMbps }} ↑{{ metrics.netTxMbps }} Mb/s</div>
        <div class="text-xs text-slate-400">{{ t('dashboard.uptime') }}: {{ fmtUptime(metrics.uptimeSeconds) }}</div>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div class="card">
        <h2 class="font-semibold mb-3">{{ t('dashboard.recentAlerts') }}</h2>
        <ul class="space-y-2 text-sm max-h-72 overflow-y-auto">
          <li v-for="(a, i) in alerts" :key="i" class="flex gap-2 items-start">
            <span class="badge shrink-0" :class="a.severity === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : a.severity === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'">
              {{ a.severity }}
            </span>
            <div>
              <div class="font-medium text-slate-800 dark:text-slate-200">{{ a.title }}</div>
              <div class="text-slate-500 text-xs">{{ a.message }}</div>
            </div>
          </li>
          <li v-if="alerts.length === 0" class="text-slate-400 italic">{{ t('common.noData') }}</li>
        </ul>
      </div>
      <div class="card">
        <h2 class="font-semibold mb-3">{{ t('dashboard.liveLogs') }}</h2>
        <LiveLogViewer channel-id="all" />
      </div>
    </div>
  </div>
</template>
