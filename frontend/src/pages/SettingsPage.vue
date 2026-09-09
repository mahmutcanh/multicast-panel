<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, call } from '../api/client';
import { useUiStore } from '../stores/ui';

const { t } = useI18n();
const ui = useUiStore();

const values = ref(null);
const interfaces = ref([]);

onMounted(async () => {
  values.value = await call(api.get('/settings'));
  interfaces.value = await call(api.get('/settings/interfaces')).catch(() => []);
});

async function save() {
  try {
    values.value = await call(api.put('/settings', { values: values.value }));
    ui.toast(t('common.saved'));
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}
</script>

<template>
  <div v-if="values" class="space-y-4 max-w-4xl">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-bold flex-1 text-slate-900 dark:text-white">{{ t('settingsPage.title') }}</h1>
      <button class="btn-primary" @click="save">{{ t('common.save') }}</button>
    </div>

    <div class="card space-y-3">
      <h2 class="font-semibold">{{ t('settingsPage.storage') }}</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><label class="label">{{ t('settingsPage.mediaPath') }}</label><input v-model="values['storage.mediaPath']" class="input font-mono" /></div>
        <div><label class="label">{{ t('settingsPage.hlsPath') }}</label><input v-model="values['storage.hlsPath']" class="input font-mono" /></div>
        <div><label class="label">{{ t('settingsPage.backupPath') }}</label><input v-model="values['storage.backupPath']" class="input font-mono" /></div>
      </div>
      <p class="text-xs text-slate-400">Host bind mount: .env → STORAGE_PATH / HLS_PATH / BACKUP_PATH</p>
    </div>

    <div class="card space-y-3">
      <h2 class="font-semibold">{{ t('settingsPage.ffmpegSection') }}</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="label">{{ t('settingsPage.ffmpegPath') }}</label><input v-model="values['ffmpeg.path']" class="input font-mono" /></div>
        <div><label class="label">{{ t('settingsPage.ffprobePath') }}</label><input v-model="values['ffprobe.path']" class="input font-mono" /></div>
      </div>
    </div>

    <div class="card space-y-3">
      <h2 class="font-semibold">{{ t('settingsPage.networkSection') }}</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label class="label">{{ t('settingsPage.interfaceIp') }}</label>
          <input v-model="values['network.interfaceIp']" class="input font-mono" list="ifaces" />
          <datalist id="ifaces">
            <option v-for="i in interfaces" :key="i.ip" :value="i.ip">{{ i.name }}</option>
          </datalist>
          <p class="text-xs text-slate-400 mt-1">{{ t('settingsPage.interfaces') }}: {{ interfaces.map((i) => `${i.name}=${i.ip}`).join(', ') || '—' }}</p>
        </div>
        <div><label class="label">{{ t('settingsPage.publicUrl') }}</label><input v-model="values['network.publicUrl']" class="input font-mono" /></div>
        <div><label class="label">{{ t('settingsPage.localDomain') }}</label><input v-model="values['network.localDomain']" class="input font-mono" /></div>
        <div>
          <label class="label">{{ t('settingsPage.sslMode') }}</label>
          <select v-model="values['network.sslMode']" class="input">
            <option value="none">none (HTTP / tunnel)</option>
            <option value="custom">custom (fullchain.pem + privkey.pem)</option>
            <option value="cloudflare">cloudflare (tunnel terminates TLS)</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card space-y-3">
      <h2 class="font-semibold">{{ t('settingsPage.backupSection') }} / {{ t('settingsPage.localeSection') }}</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <label class="flex items-center gap-2 text-sm">
          <input v-model="values['backup.dailyEnabled']" type="checkbox" class="rounded" /> {{ t('settingsPage.dailyEnabled') }}
        </label>
        <div><label class="label">{{ t('settingsPage.keepCount') }}</label><input v-model.number="values['backup.keepCount']" type="number" class="input" /></div>
        <div>
          <label class="label">{{ t('settingsPage.defaultLocale') }}</label>
          <select v-model="values['panel.defaultLocale']" class="input"><option value="tr">Türkçe</option><option value="en">English</option></select>
        </div>
      </div>
    </div>
  </div>
</template>
