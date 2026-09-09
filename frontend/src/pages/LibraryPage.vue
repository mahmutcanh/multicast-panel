<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, call } from '../api/client';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';

const { t } = useI18n();
const auth = useAuthStore();
const ui = useUiStore();

const files = ref([]);
const serverFiles = ref([]);
const search = ref('');
const uploading = ref(false);
const progress = ref(0);
const deleting = ref(null);
const showServer = ref(false);

async function load() {
  files.value = await call(api.get('/library', { params: { limit: 500, search: search.value || undefined } }));
}
onMounted(load);

async function uploadFiles(list) {
  if (!list?.length) return;
  uploading.value = true;
  progress.value = 0;
  const fd = new FormData();
  for (const f of list) fd.append('files', f);
  try {
    await call(
      api.post('/library/upload', fd, {
        onUploadProgress: (e) => { progress.value = e.total ? Math.round((e.loaded / e.total) * 100) : 0; },
      }),
    );
    ui.toast(t('library.uploaded'));
    await load();
  } catch (err) {
    ui.toast(err.message, 'error');
  } finally {
    uploading.value = false;
  }
}

function onDrop(e) {
  uploadFiles([...e.dataTransfer.files]);
}

async function browseServer() {
  showServer.value = !showServer.value;
  if (showServer.value) serverFiles.value = await call(api.get('/library/server-files'));
}

async function importFile(f) {
  try {
    await call(api.post('/library/import-server-file', { path: f.name }));
    ui.toast(t('common.saved'));
    f.registered = true;
    await load();
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}

async function rename(f) {
  const name = prompt(t('library.rename'), f.filename);
  if (!name || name === f.filename) return;
  try {
    await call(api.put(`/library/${f.id}/rename`, { name }));
    await load();
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}

async function removeFile() {
  try {
    await call(api.delete(`/library/${deleting.value.id}`, { data: { deleteFromDisk: true } }));
    ui.toast(t('common.deleted'));
    deleting.value = null;
    await load();
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}

function fmtSize(bytes) {
  const b = Number(bytes ?? 0);
  if (b > 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
  if (b > 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  return `${Math.round(b / 1024)} KB`;
}
function fmtDur(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-bold flex-1 text-slate-900 dark:text-white">{{ t('library.title') }}</h1>
      <input v-model="search" class="input !w-56" :placeholder="t('common.search')" @keyup.enter="load" />
      <button class="btn-secondary" @click="browseServer">{{ t('library.serverFiles') }}</button>
    </div>

    <!-- Dropzone -->
    <div v-if="auth.can('video.upload')">
      <input id="fileUploadInput" type="file" multiple accept="video/*,.ts,.m3u8,.mkv" class="hidden" @change="uploadFiles([...$event.target.files])" />
      <div
        class="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center text-slate-400"
        :class="uploading ? '' : 'hover:border-brand-400'"
        @dragover.prevent
        @drop.prevent="onDrop"
      >
        <div v-if="uploading">
          <div class="text-sm mb-2">{{ t('common.upload') }}… {{ progress }}%</div>
          <div class="h-2 max-w-md mx-auto rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div class="h-full bg-brand-500 transition-all" :style="{ width: `${progress}%` }" />
          </div>
        </div>
        <div v-else class="space-y-3">
          <div class="text-sm">⬆ {{ t('library.dropHint') }}</div>
          <label
            for="fileUploadInput"
            class="btn-primary inline-flex items-center gap-2 cursor-pointer"
          >
            📂 {{ t('library.selectFiles') }}
          </label>
        </div>
      </div>
    </div>

    <!-- Server folder -->
    <div v-if="showServer" class="card">
      <h2 class="font-semibold mb-3">{{ t('library.serverFiles') }}</h2>
      <table class="table-base">
        <tbody>
          <tr v-for="f in serverFiles" :key="f.path">
            <td class="font-mono text-xs">{{ f.name }}</td>
            <td>{{ fmtSize(f.sizeBytes) }}</td>
            <td class="text-right">
              <button v-if="!f.registered" class="btn-secondary !py-1" @click="importFile(f)">{{ t('library.import') }}</button>
              <span v-else class="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">✓</span>
            </td>
          </tr>
          <tr v-if="serverFiles.length === 0"><td class="text-slate-400 italic py-4">{{ t('common.noData') }}</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Grid -->
    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
      <div v-for="f in files" :key="f.id" class="card !p-3 space-y-2">
        <div class="aspect-video bg-slate-200 dark:bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center text-slate-400">
          <img v-if="f.thumbnailPath" :src="`/api/v1/library/${f.id}/thumbnail`" class="w-full h-full object-cover" loading="lazy" />
          <span v-else>🎞</span>
        </div>
        <div class="text-sm font-medium truncate" :title="f.filename">{{ f.filename }}</div>
        <div class="text-xs text-slate-400 flex flex-wrap gap-x-3">
          <span>{{ fmtDur(f.durationSeconds) }}</span>
          <span>{{ f.resolution }}</span>
          <span>{{ f.videoCodec }}</span>
          <span>{{ fmtSize(f.sizeBytes) }}</span>
        </div>
        <div class="flex gap-1">
          <a class="btn-secondary !px-2 !py-1 text-xs" :href="`/api/v1/library/${f.id}/preview`" target="_blank">{{ t('library.preview') }}</a>
          <button v-if="auth.can('video.edit')" class="btn-secondary !px-2 !py-1 text-xs" @click="rename(f)">✎</button>
          <button v-if="auth.can('video.delete')" class="btn-danger !px-2 !py-1 text-xs" @click="deleting = f">🗑</button>
        </div>
      </div>
    </div>
    <div v-if="files.length === 0" class="text-center text-slate-400 py-8">{{ t('common.noData') }}</div>

    <ConfirmDialog
      :show="!!deleting"
      :title="t('common.delete') + ': ' + (deleting?.filename ?? '')"
      :message="t('common.confirmDelete')"
      @confirm="removeFile"
      @cancel="deleting = null"
    />
  </div>
</template>
