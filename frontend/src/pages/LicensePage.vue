<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, call } from '../api/client';
import { useUiStore } from '../stores/ui';

const { t } = useI18n();
const ui = useUiStore();
const license = ref(null);
const key = ref('');

onMounted(async () => {
  license.value = await call(api.get('/license'));
});

async function activate() {
  try {
    license.value = await call(api.post('/license/activate', { key: key.value }));
    key.value = '';
    ui.toast(t('licensePage.activated'));
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}

const statusClass = (s) =>
  ({
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    trial: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    grace: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    expired: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    invalid: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  })[s] ?? '';
</script>

<template>
  <div v-if="license" class="space-y-4 max-w-3xl">
    <h1 class="text-2xl font-bold text-slate-900 dark:text-white">{{ t('licensePage.title') }}</h1>

    <div class="card space-y-3">
      <div class="flex items-center gap-3">
        <span class="badge text-sm" :class="statusClass(license.status)">{{ t(`licensePage.statusNames.${license.status}`) }}</span>
        <span class="text-sm text-slate-500">{{ license.mode }} mode</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div><div class="label">{{ t('licensePage.licensedTo') }}</div>{{ license.licensedTo || '—' }}</div>
        <div><div class="label">{{ t('licensePage.expiresAt') }}</div>{{ license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : '—' }}</div>
        <div><div class="label">{{ t('licensePage.graceDays') }}</div>{{ license.graceDays }}</div>
      </div>
      <div>
        <div class="label">{{ t('licensePage.features') }}</div>
        <div class="flex flex-wrap gap-2">
          <span v-for="(v, k) in license.features" :key="k" class="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 font-mono">
            {{ k }}: {{ k === 'maxChannels' && v === 0 ? '∞' : v }}
          </span>
        </div>
      </div>
    </div>

    <div class="card space-y-3">
      <h2 class="font-semibold">{{ t('licensePage.key') }}</h2>
      <textarea v-model="key" class="input font-mono" rows="3" placeholder="MCP1.…" />
      <div class="flex justify-end">
        <button class="btn-primary" :disabled="!key" @click="activate">{{ t('licensePage.activate') }}</button>
      </div>
    </div>
  </div>
</template>
