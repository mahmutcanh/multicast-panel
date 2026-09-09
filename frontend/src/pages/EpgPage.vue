<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, call } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';

const { t } = useI18n();
const auth = useAuthStore();
const ui = useUiStore();

const channels = ref([]);
const importForm = ref({ source: 'url', url: '', content: '' });
const programs = ref(null);

async function load() {
  channels.value = await call(api.get('/epg/channels'));
}
onMounted(load);

async function doImport() {
  try {
    const res = await call(api.post('/epg/import', importForm.value));
    ui.toast(t('epg.imported', { channels: res.channels, programs: res.programs }));
    await load();
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}

async function showPrograms(ch) {
  programs.value = { name: ch.name, rows: await call(api.get(`/epg/channels/${ch.id}/programs`)) };
}

async function removeChannel(ch) {
  await call(api.delete(`/epg/channels/${ch.id}`)).catch((e) => ui.toast(e.message, 'error'));
  await load();
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold text-slate-900 dark:text-white">{{ t('epg.title') }}</h1>

    <div v-if="auth.can('epg.manage')" class="card space-y-3">
      <h2 class="font-semibold">{{ t('epg.importXmltv') }}</h2>
      <div class="flex flex-wrap gap-3 items-end">
        <div>
          <label class="label">{{ t('m3u.fromUrl') }} / {{ t('m3u.pasteContent') }}</label>
          <select v-model="importForm.source" class="input !w-40">
            <option value="url">URL</option>
            <option value="content">{{ t('m3u.pasteContent') }}</option>
          </select>
        </div>
        <div v-if="importForm.source === 'url'" class="flex-1 min-w-64">
          <label class="label">{{ t('epg.url') }}</label>
          <input v-model="importForm.url" class="input" placeholder="https://.../epg.xml" />
        </div>
        <button class="btn-primary" @click="doImport">{{ t('m3u.import') }}</button>
      </div>
      <textarea v-if="importForm.source === 'content'" v-model="importForm.content" class="input font-mono" rows="6" :placeholder="t('epg.content')" />
    </div>

    <div class="card !p-0 overflow-x-auto">
      <table class="table-base">
        <thead>
          <tr>
            <th>EPG ID</th>
            <th>{{ t('common.name') }}</th>
            <th class="text-right">{{ t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ch in channels" :key="ch.id">
            <td class="font-mono text-xs">{{ ch.epgId }}</td>
            <td>{{ ch.name }}</td>
            <td>
              <div class="flex justify-end gap-1">
                <button class="btn-secondary !px-2 !py-1" @click="showPrograms(ch)">{{ t('epg.programs') }}</button>
                <button v-if="auth.can('epg.manage')" class="btn-danger !px-2 !py-1" @click="removeChannel(ch)">🗑</button>
              </div>
            </td>
          </tr>
          <tr v-if="channels.length === 0"><td colspan="3" class="text-center text-slate-400 py-8">{{ t('common.noData') }}</td></tr>
        </tbody>
      </table>
    </div>

    <div v-if="programs" class="card">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold">{{ programs.name }} — {{ t('epg.programs') }}</h2>
        <button class="btn-secondary !py-1" @click="programs = null">{{ t('common.close') }}</button>
      </div>
      <table class="table-base">
        <tbody>
          <tr v-for="p in programs.rows" :key="p.id">
            <td class="text-xs text-slate-400 whitespace-nowrap">
              {{ new Date(p.startAt).toLocaleString() }} – {{ new Date(p.endAt).toLocaleTimeString() }}
            </td>
            <td class="font-medium">{{ p.title }}</td>
            <td class="text-xs text-slate-500">{{ p.description }}</td>
          </tr>
          <tr v-if="programs.rows.length === 0"><td class="text-slate-400 italic py-4">{{ t('common.noData') }}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
