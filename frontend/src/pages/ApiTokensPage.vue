<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, call } from '../api/client';
import { useUiStore } from '../stores/ui';

const { t } = useI18n();
const ui = useUiStore();

const tokens = ref([]);
const perms = ref([]);
const creating = ref(null);
const created = ref(null);

async function load() {
  tokens.value = await call(api.get('/api-tokens'));
  perms.value = await call(api.get('/roles/permissions')).catch(() => []);
}
onMounted(load);

function startCreate() {
  creating.value = { name: '', scopes: [], expiresAt: '' };
}

async function save() {
  try {
    const payload = { ...creating.value };
    if (!payload.expiresAt) delete payload.expiresAt;
    else payload.expiresAt = new Date(payload.expiresAt).toISOString();
    created.value = await call(api.post('/api-tokens', payload));
    creating.value = null;
    await load();
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}

async function revoke(token) {
  await call(api.delete(`/api-tokens/${token.id}`)).catch((e) => ui.toast(e.message, 'error'));
  ui.toast(t('tokensPage.revoked'));
  await load();
}

async function copy() {
  await navigator.clipboard.writeText(created.value.token);
  ui.toast(t('channels.linkCopied'));
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-bold flex-1 text-slate-900 dark:text-white">{{ t('tokensPage.title') }}</h1>
      <button class="btn-primary" @click="startCreate">+ {{ t('tokensPage.newToken') }}</button>
    </div>

    <div v-if="created" class="card border-emerald-300 dark:border-emerald-700 space-y-2">
      <p class="text-sm font-medium">{{ t('tokensPage.tokenOnce') }}</p>
      <div class="flex gap-2">
        <code class="input font-mono text-xs flex-1 overflow-x-auto">{{ created.token }}</code>
        <button class="btn-secondary" @click="copy">📋</button>
        <button class="btn-secondary" @click="created = null">{{ t('common.close') }}</button>
      </div>
    </div>

    <div v-if="creating" class="card space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label class="label">{{ t('common.name') }}</label><input v-model="creating.name" class="input" /></div>
        <div><label class="label">{{ t('tokensPage.expiresAt') }}</label><input v-model="creating.expiresAt" type="date" class="input" /></div>
      </div>
      <div>
        <label class="label">{{ t('tokensPage.scopes') }}</label>
        <div class="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
          <label v-for="p in perms" :key="p.id" class="flex items-center gap-1.5 text-xs">
            <input v-model="creating.scopes" type="checkbox" :value="p.slug" class="rounded" />
            <span class="font-mono">{{ p.slug }}</span>
          </label>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <button class="btn-secondary" @click="creating = null">{{ t('common.cancel') }}</button>
        <button class="btn-primary" :disabled="!creating.name" @click="save">{{ t('common.create') }}</button>
      </div>
    </div>

    <div class="card !p-0 overflow-x-auto">
      <table class="table-base">
        <thead>
          <tr>
            <th>{{ t('common.name') }}</th>
            <th>{{ t('tokensPage.scopes') }}</th>
            <th>{{ t('tokensPage.lastUsed') }}</th>
            <th>{{ t('tokensPage.expiresAt') }}</th>
            <th class="text-right">{{ t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tok in tokens" :key="tok.id" :class="tok.revokedAt ? 'opacity-50' : ''">
            <td class="font-medium">{{ tok.name }}</td>
            <td class="text-xs">{{ (tok.scopes ?? []).length }} scope</td>
            <td class="text-xs text-slate-400">{{ tok.lastUsedAt ? new Date(tok.lastUsedAt).toLocaleString() : '—' }}</td>
            <td class="text-xs text-slate-400">{{ tok.expiresAt ? new Date(tok.expiresAt).toLocaleDateString() : '—' }}</td>
            <td>
              <div class="flex justify-end">
                <button v-if="!tok.revokedAt" class="btn-danger !px-2 !py-1" @click="revoke(tok)">{{ t('tokensPage.revoke') }}</button>
                <span v-else class="badge bg-slate-100 text-slate-500 dark:bg-slate-800">revoked</span>
              </div>
            </td>
          </tr>
          <tr v-if="tokens.length === 0"><td colspan="5" class="text-center text-slate-400 py-8">{{ t('common.noData') }}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
