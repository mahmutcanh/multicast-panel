<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, call, getAccessToken } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';

const { t } = useI18n();
const auth = useAuthStore();
const ui = useUiStore();

const importForm = ref({ source: 'url', url: '', content: '', udpBaseIp: '230.121.0.1' });
const history = ref([]);

async function load() {
  if (auth.can('m3u.import')) {
    history.value = await call(api.get('/m3u/imports')).catch(() => []);
  }
}
onMounted(load);

async function doImport() {
  try {
    const payload = { ...importForm.value };
    if (payload.source === 'url') delete payload.content;
    const res = await call(api.post('/m3u/import', payload));
    ui.toast(t('m3u.importDone', { count: res.channelsCreated }));
    await load();
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}

async function download(format, filename) {
  try {
    const res = await api.get('/m3u/export', {
      params: format ? { format } : {},
      responseType: 'blob',
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold text-slate-900 dark:text-white">{{ t('m3u.title') }}</h1>

    <!-- Export -->
    <div class="card space-y-3" v-if="auth.can('m3u.export')">
      <h2 class="font-semibold">{{ t('m3u.export') }}</h2>
      <div class="flex flex-wrap gap-2">
        <button class="btn-primary" @click="download('', 'channels.m3u')">⬇ {{ t('m3u.exportM3u') }}</button>
        <button class="btn-secondary" @click="download('json', 'channels.json')">⬇ {{ t('m3u.exportJson') }}</button>
        <button class="btn-secondary" @click="download('csv', 'channels.csv')">⬇ {{ t('m3u.exportCsv') }}</button>
      </div>
    </div>

    <!-- Import -->
    <div class="card space-y-3" v-if="auth.can('m3u.import')">
      <h2 class="font-semibold">{{ t('m3u.import') }}</h2>
      <div class="flex flex-wrap gap-3 items-end">
        <div>
          <label class="label">{{ t('logsPage.kind') }}</label>
          <select v-model="importForm.source" class="input !w-44">
            <option value="url">{{ t('m3u.fromUrl') }}</option>
            <option value="content">{{ t('m3u.pasteContent') }}</option>
          </select>
        </div>
        <div v-if="importForm.source === 'url'" class="flex-1 min-w-64">
          <label class="label">URL</label>
          <input v-model="importForm.url" class="input" placeholder="http://.../playlist.m3u" />
        </div>
        <div>
          <label class="label">{{ t('m3u.udpBase') }}</label>
          <input v-model="importForm.udpBaseIp" class="input font-mono !w-44" />
        </div>
        <button class="btn-primary" @click="doImport">{{ t('m3u.import') }}</button>
      </div>
      <textarea v-if="importForm.source === 'content'" v-model="importForm.content" class="input font-mono" rows="8" placeholder="#EXTM3U ..." />
    </div>

    <!-- History -->
    <div class="card !p-0 overflow-x-auto" v-if="auth.can('m3u.import')">
      <table class="table-base">
        <thead>
          <tr><th>{{ t('logsPage.time') }}</th><th>URL</th><th>{{ t('common.total') }}</th><th>{{ t('common.status') }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="h in history" :key="h.id">
            <td class="text-xs text-slate-400">{{ new Date(h.createdAt).toLocaleString() }}</td>
            <td class="font-mono text-xs truncate max-w-xs">{{ h.url || '—' }}</td>
            <td>{{ h.channelsCreated }}</td>
            <td>{{ h.status }}</td>
          </tr>
          <tr v-if="history.length === 0"><td colspan="4" class="text-center text-slate-400 py-6">{{ t('common.noData') }}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
