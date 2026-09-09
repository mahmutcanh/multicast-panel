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
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white">{{ t('dashboard.title') }}</h1>
      <span class="text-xs px-3 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 rounded-full font-semibold">
        🟢 Sistem Canlı
      </span>
    </div>

    <!-- Stats -->
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

    <!-- Usage Guide Banner -->
    <div class="card bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white space-y-4 shadow-xl border-none p-5">
      <div class="flex items-center justify-between border-b border-slate-700/60 pb-3">
        <div>
          <h2 class="font-bold text-lg flex items-center gap-2 text-white">
            <span>📖</span> Hızlı Kullanım & Yayın Kılavuzu
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Kanalları oluşturma, IPTV oynatıcılarına bağlama ve PC ekranını yayınlama adımları.</p>
        </div>
        <span class="text-xs text-brand-300 bg-brand-950/80 border border-brand-800 px-3 py-1 rounded-full font-medium">Rehber v1.2</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 text-xs">
        <!-- Card 1 -->
        <div class="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/50 space-y-2">
          <div class="font-semibold text-emerald-400 text-sm flex items-center gap-1.5">
            <span>📺</span> 1. IPTV & Smart TV İzleme
          </div>
          <p class="text-slate-300">Smart TV, IPTV Smarters veya VLC'ye tüm kanalları otomatik yüklemek için bu M3U linkini ekleyin:</p>
          <div class="bg-slate-950 p-2 rounded text-emerald-300 font-mono text-[11px] select-all break-all border border-slate-800">
            https://stream.homaklab.com/api/v1/m3u/public.m3u
          </div>
        </div>

        <!-- Card 2 -->
        <div class="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/50 space-y-2">
          <div class="font-semibold text-amber-400 text-sm flex items-center gap-1.5">
            <span>📹</span> 2. IP Kamera (RTSP) Ekleme
          </div>
          <p class="text-slate-300">Hikvision / Dahua güvenlik kameralarını eklemek için Kaynak Tipi <strong>rtsp</strong> seçin:</p>
          <div class="bg-slate-950 p-2 rounded text-amber-300 font-mono text-[11px] select-all break-all border border-slate-800">
            rtsp://admin:sifre@192.168.1.100:554/live
          </div>
        </div>

        <!-- Card 3 -->
        <div class="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/50 space-y-2">
          <div class="font-semibold text-sky-400 text-sm flex items-center gap-1.5">
            <span>🎬</span> 3. YouTube Canlı Yayın
          </div>
          <p class="text-slate-300">Kaynak Tipi <strong>youtube</strong> seçip doğrudan link yapıştırın:</p>
          <div class="bg-slate-950 p-2 rounded text-sky-300 font-mono text-[11px] select-all break-all border border-slate-800">
            https://www.youtube.com/watch?v=2l7XOjbOyQY
          </div>
        </div>

        <!-- Card 4 -->
        <div class="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/50 space-y-2">
          <div class="font-semibold text-purple-400 text-sm flex items-center gap-1.5">
            <span>💻</span> 4. Kendi Bilgisayar Ekranını Yayınlama
          </div>
          <p class="text-slate-300">OBS Studio ile <strong>Ekran Yakalama</strong> ekleyin. Yayın sunucusu RTMP:</p>
          <div class="bg-slate-950 p-2 rounded text-purple-300 font-mono text-[11px] select-all break-all border border-slate-800">
            rtmp://stream.homaklab.com/live/pc-ekranim
          </div>
          <p class="text-[10px] text-slate-400">Panelde Kaynak Tipi <strong>rtmp</strong>, URL: <code>rtmp://127.0.0.1/live/pc-ekranim</code> seçin.</p>
        </div>
      </div>
    </div>

    <!-- Metrics -->
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

    <!-- Logs & Alerts -->
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
