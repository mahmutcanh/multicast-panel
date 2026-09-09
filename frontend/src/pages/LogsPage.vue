<script setup>
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, call, getAccessToken } from '../api/client';
import LiveLogViewer from '../components/LiveLogViewer.vue';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';

const { t } = useI18n();
const auth = useAuthStore();
const ui = useUiStore();

const kind = ref('streaming');
const level = ref('');
const search = ref('');
const rows = ref([]);
const live = ref(false);

async function load() {
  rows.value = await call(
    api.get('/logs', { params: { kind: kind.value, level: level.value || undefined, search: search.value || undefined, limit: 200 } }),
  );
}
onMounted(load);
watch(kind, load);

async function exportLogs() {
  try {
    const res = await api.get('/logs/export', {
      params: { kind: kind.value, level: level.value || undefined },
      responseType: 'blob',
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kind.value}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}

function rowSummary(r) {
  if (kind.value === 'streaming') return r.message;
  if (kind.value === 'audit') return `${r.userEmail || '—'} → ${r.action}`;
  if (kind.value === 'security') return `${r.email} @ ${r.ip} — ${r.success ? 'OK' : r.reason || 'FAILED'}`;
  return `${r.title}: ${r.message}`;
}
function rowLevel(r) {
  if (kind.value === 'streaming') return r.level;
  if (kind.value === 'security') return r.success ? 'info' : 'error';
  if (kind.value === 'alerts') return r.severity === 'critical' ? 'error' : r.severity === 'warning' ? 'warn' : 'info';
  return 'info';
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-bold flex-1 text-slate-900 dark:text-white">{{ t('logsPage.title') }}</h1>
      <select v-model="kind" class="input !w-40">
        <option v-for="k in ['streaming', 'audit', 'security', 'alerts']" :key="k" :value="k">{{ t(`logsPage.kinds.${k}`) }}</option>
      </select>
      <select v-if="kind === 'streaming'" v-model="level" class="input !w-32" @change="load">
        <option value="">{{ t('common.all') }}</option>
        <option v-for="l in ['info', 'warn', 'error']" :key="l" :value="l">{{ l }}</option>
      </select>
      <input v-model="search" class="input !w-56" :placeholder="t('common.search')" @keyup.enter="load" />
      <button v-if="kind === 'streaming'" class="btn-secondary" @click="live = !live">
        {{ t('logsPage.live') }} {{ live ? '⏸' : '▶' }}
      </button>
      <button v-if="auth.can('logs.download')" class="btn-secondary" @click="exportLogs">⬇ {{ t('logsPage.export') }}</button>
    </div>

    <div v-if="live && kind === 'streaming'" class="card">
      <LiveLogViewer channel-id="all" />
    </div>

    <div class="card !p-0 overflow-x-auto">
      <table class="table-base">
        <thead>
          <tr><th class="w-44">{{ t('logsPage.time') }}</th><th class="w-20">{{ t('logsPage.level') }}</th><th>{{ t('logsPage.message') }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td class="text-xs text-slate-400 whitespace-nowrap">{{ new Date(r.createdAt).toLocaleString() }}</td>
            <td>
              <span class="badge" :class="rowLevel(r) === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : rowLevel(r) === 'warn' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'">
                {{ rowLevel(r) }}
              </span>
            </td>
            <td class="font-mono text-xs break-all">{{ rowSummary(r) }}</td>
          </tr>
          <tr v-if="rows.length === 0"><td colspan="3" class="text-center text-slate-400 py-8">{{ t('common.noData') }}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
