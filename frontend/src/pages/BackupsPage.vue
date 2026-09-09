<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, call, getAccessToken } from '../api/client';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';

const { t } = useI18n();
const auth = useAuthStore();
const ui = useUiStore();

const backups = ref([]);
const busy = ref(false);
const restoring = ref(null);
const deleting = ref(null);

async function load() {
  backups.value = await call(api.get('/backups'));
}
onMounted(load);

async function create() {
  busy.value = true;
  try {
    await call(api.post('/backups'));
    ui.toast(t('common.saved'));
    await load();
  } catch (err) {
    ui.toast(err.message, 'error');
  } finally {
    busy.value = false;
  }
}

async function download(b) {
  try {
    const res = await api.get(`/backups/${b.id}/download`, {
      responseType: 'blob',
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = b.filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}

async function restore() {
  busy.value = true;
  try {
    await call(api.post(`/backups/${restoring.value.id}/restore`));
    ui.toast(t('backupsPage.restored'), 'warning');
  } catch (err) {
    ui.toast(err.message, 'error');
  } finally {
    restoring.value = null;
    busy.value = false;
  }
}

async function remove() {
  await call(api.delete(`/backups/${deleting.value.id}`)).catch((e) => ui.toast(e.message, 'error'));
  deleting.value = null;
  await load();
}

function fmtSize(bytes) {
  const b = Number(bytes ?? 0);
  return b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-bold flex-1 text-slate-900 dark:text-white">{{ t('backupsPage.title') }}</h1>
      <button class="btn-primary" :disabled="busy" @click="create">+ {{ t('backupsPage.createBackup') }}</button>
    </div>

    <div class="card !p-0 overflow-x-auto">
      <table class="table-base">
        <thead>
          <tr>
            <th>{{ t('common.name') }}</th>
            <th>{{ t('backupsPage.type') }}</th>
            <th>{{ t('library.size') }}</th>
            <th>{{ t('common.status') }}</th>
            <th>{{ t('logsPage.time') }}</th>
            <th class="text-right">{{ t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in backups" :key="b.id">
            <td class="font-mono text-xs">{{ b.filename }}</td>
            <td>{{ b.type === 'auto' ? t('backupsPage.auto') : t('backupsPage.manual') }}</td>
            <td>{{ fmtSize(b.sizeBytes) }}</td>
            <td>
              <span class="badge" :class="b.status === 'done' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : b.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-amber-100 text-amber-700'">
                {{ b.status }}
              </span>
            </td>
            <td class="text-xs text-slate-400">{{ new Date(b.createdAt).toLocaleString() }}</td>
            <td>
              <div class="flex justify-end gap-1">
                <button class="btn-secondary !px-2 !py-1" :title="t('common.download')" @click="download(b)">⬇</button>
                <button v-if="auth.can('backup.restore')" class="btn-secondary !px-2 !py-1" :disabled="b.status !== 'done'" :title="t('backupsPage.restore')" @click="restoring = b">⟲</button>
                <button class="btn-danger !px-2 !py-1" @click="deleting = b">🗑</button>
              </div>
            </td>
          </tr>
          <tr v-if="backups.length === 0"><td colspan="6" class="text-center text-slate-400 py-8">{{ t('common.noData') }}</td></tr>
        </tbody>
      </table>
    </div>

    <ConfirmDialog :show="!!restoring" :title="t('backupsPage.restore')" :message="t('backupsPage.restoreWarning')" @confirm="restore" @cancel="restoring = null" />
    <ConfirmDialog :show="!!deleting" :title="t('common.delete')" :message="t('common.confirmDelete')" @confirm="remove" @cancel="deleting = null" />
  </div>
</template>
