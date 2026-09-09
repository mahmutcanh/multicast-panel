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

const playlists = ref([]);
const videos = ref([]);
const mediaFolders = ref([]);
const editing = ref(null);
const deleting = ref(null);
const preview = ref(null);

const emptyForm = () => ({ name: '', mode: 'sequential', folderPath: '', loop: true, items: [] });

async function load() {
  playlists.value = await call(api.get('/playlists', { params: { limit: 200 } }));
}
onMounted(async () => {
  await load();
  const [vids, folders] = await Promise.all([
    call(api.get('/library', { params: { limit: 500 } })).catch(() => []),
    call(api.get('/library/server-folders')).catch(() => []),
  ]);
  videos.value = vids;
  mediaFolders.value = folders;
});

function startEdit(p) {
  editing.value = p
    ? {
        id: p.id,
        name: p.name,
        mode: p.mode,
        folderPath: p.folderPath,
        loop: p.loop,
        items: (p.items ?? []).map((i) => ({ videoFileId: i.videoFileId, url: i.url, position: i.position })),
      }
    : emptyForm();
}

function addItem(kind) {
  editing.value.items.push({
    videoFileId: kind === 'video' ? (videos.value[0]?.id ?? null) : null,
    url: '',
    position: editing.value.items.length,
  });
}
function removeItem(i) {
  editing.value.items.splice(i, 1);
  editing.value.items.forEach((it, idx) => (it.position = idx));
}
function move(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= editing.value.items.length) return;
  const items = editing.value.items;
  [items[i], items[j]] = [items[j], items[i]];
  items.forEach((it, idx) => (it.position = idx));
}

async function save() {
  try {
    const payload = { ...editing.value };
    payload.items = payload.items.map((i) => ({
      videoFileId: i.videoFileId || undefined,
      url: i.url || undefined,
      position: i.position,
    }));
    if (payload.id) await call(api.put(`/playlists/${payload.id}`, payload));
    else await call(api.post('/playlists', payload));
    ui.toast(t('common.saved'));
    editing.value = null;
    await load();
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}

async function removePlaylist() {
  await call(api.delete(`/playlists/${deleting.value.id}`)).catch((e) => ui.toast(e.message, 'error'));
  deleting.value = null;
  await load();
}

async function showPreview(p) {
  preview.value = { name: p.name, rows: await call(api.get(`/playlists/${p.id}/preview`)) };
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-bold flex-1 text-slate-900 dark:text-white">{{ t('playlists.title') }}</h1>
      <button v-if="auth.can('playlist.create')" class="btn-primary" @click="startEdit(null)">+ {{ t('playlists.newPlaylist') }}</button>
    </div>

    <div class="card !p-0 overflow-x-auto">
      <table class="table-base">
        <thead>
          <tr>
            <th>{{ t('common.name') }}</th>
            <th>{{ t('playlists.mode') }}</th>
            <th>{{ t('playlists.items') }}</th>
            <th class="text-right">{{ t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in playlists" :key="p.id">
            <td class="font-medium">{{ p.name }}</td>
            <td>{{ t(`playlists.modes.${p.mode}`) }}</td>
            <td>{{ p.items?.length ?? 0 }}</td>
            <td>
              <div class="flex justify-end gap-1">
                <button class="btn-secondary !px-2 !py-1" @click="showPreview(p)">👁</button>
                <button v-if="auth.can('playlist.edit')" class="btn-secondary !px-2 !py-1" @click="startEdit(p)">✎</button>
                <button v-if="auth.can('playlist.delete')" class="btn-danger !px-2 !py-1" @click="deleting = p">🗑</button>
              </div>
            </td>
          </tr>
          <tr v-if="playlists.length === 0"><td colspan="4" class="text-center text-slate-400 py-8">{{ t('common.noData') }}</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Editor -->
    <div v-if="editing" class="card space-y-4">
      <h2 class="font-semibold">{{ editing.id ? t('common.edit') : t('playlists.newPlaylist') }}</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div><label class="label">{{ t('common.name') }}</label><input v-model="editing.name" class="input" /></div>
        <div>
          <label class="label">{{ t('playlists.mode') }}</label>
          <select v-model="editing.mode" class="input">
            <option v-for="m in ['sequential', 'random', 'single_loop', 'folder_loop', 'scheduled']" :key="m" :value="m">
              {{ t(`playlists.modes.${m}`) }}
            </option>
          </select>
        </div>
        <div v-if="editing.mode === 'folder_loop'">
          <label class="label">{{ t('playlists.folderPath') }}</label>
          <div v-if="mediaFolders.length > 0">
            <select
              class="input"
              :value="editing.folderPath"
              @change="editing.folderPath = mediaFolders.find(f => f.path === $event.target.value)?.path ?? $event.target.value"
            >
              <option v-for="f in mediaFolders" :key="f.path" :value="f.path">
                {{ f.name === '' ? '📁 Ana Klasör (tüm medya)' : '📁 ' + f.label }}
              </option>
            </select>
            <p class="text-xs text-slate-400 mt-1">Videolar bu klasörden otomatik sıralanır.</p>
          </div>
          <div v-else class="text-sm text-slate-500 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
            Medya klasöründe alt klasör bulunamadı. Önce Kütüphane'den video yükleyin.
          </div>
        </div>
      </div>

      <div v-if="editing.mode !== 'folder_loop'" class="space-y-2">
        <div class="flex gap-2">
          <button type="button" class="btn-secondary" @click="addItem('video')">+ {{ t('playlists.addVideo') }}</button>
          <button type="button" class="btn-secondary" @click="addItem('url')">+ {{ t('playlists.addUrl') }}</button>
        </div>
        <div v-for="(item, i) in editing.items" :key="i" class="flex items-center gap-2">
          <span class="text-xs text-slate-400 w-6">{{ i + 1 }}.</span>
          <select v-if="item.videoFileId !== null" v-model="item.videoFileId" class="input flex-1">
            <option v-for="v in videos" :key="v.id" :value="v.id">{{ v.filename }}</option>
          </select>
          <input v-else v-model="item.url" class="input flex-1 font-mono" placeholder="http(s)://... veya /data/media/..." />
          <button type="button" class="btn-secondary !px-2 !py-1" @click="move(i, -1)">↑</button>
          <button type="button" class="btn-secondary !px-2 !py-1" @click="move(i, 1)">↓</button>
          <button type="button" class="btn-danger !px-2 !py-1" @click="removeItem(i)">🗑</button>
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <button class="btn-secondary" @click="editing = null">{{ t('common.cancel') }}</button>
        <button class="btn-primary" @click="save">{{ t('common.save') }}</button>
      </div>
    </div>

    <!-- Preview -->
    <div v-if="preview" class="card">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold">{{ t('playlists.previewTitle') }} — {{ preview.name }}</h2>
        <button class="btn-secondary !py-1" @click="preview = null">{{ t('common.close') }}</button>
      </div>
      <ol class="list-decimal list-inside text-sm space-y-1">
        <li v-for="(r, i) in preview.rows" :key="i">
          {{ r.title }} <span class="text-slate-400 text-xs">({{ Math.round(r.durationSeconds) }}s)</span>
        </li>
      </ol>
    </div>

    <ConfirmDialog :show="!!deleting" :title="t('common.delete')" :message="t('common.confirmDelete')" @confirm="removePlaylist" @cancel="deleting = null" />
  </div>
</template>
