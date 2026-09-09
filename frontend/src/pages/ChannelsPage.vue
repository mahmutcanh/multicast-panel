<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, call } from '../api/client';
import { connectSocket, getSocket } from '../api/socket';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';

const { t } = useI18n();
const auth = useAuthStore();
const ui = useUiStore();

const channels = ref([]);
const search = ref('');
const deleting = ref(null);
const busy = ref({});

async function load() {
  channels.value = await call(api.get('/channels', { params: { limit: 500, search: search.value || undefined } }));
}

function onStatus(payload) {
  const ch = channels.value.find((c) => c.id === payload.channelId);
  if (ch) {
    const prev = ch.status;
    ch.status = payload.state;
    ch.process = { ...(ch.process ?? {}), ...payload, state: payload.state };
    if (payload.state === 'error' && prev !== 'error') {
      ui.toast(`${ch.name}: ${payload.lastError ?? t('channels.startFailed')}`, 'error');
    }
  }
}

onMounted(async () => {
  await load();
  connectSocket(['status']).on('stream:status', onStatus);
});
onBeforeUnmount(() => getSocket().off('stream:status', onStatus));

async function action(ch, verb) {
  busy.value[ch.id] = true;
  try {
    await call(api.post(`/streams/${ch.id}/${verb}`));
    ui.toast(`${ch.name}: ${t('channels.' + verb)}`);
  } catch (err) {
    ui.toast(err.message, 'error');
  } finally {
    busy.value[ch.id] = false;
  }
}

async function removeChannel() {
  try {
    await call(api.delete(`/channels/${deleting.value.id}`));
    ui.toast(t('common.deleted'));
    deleting.value = null;
    await load();
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}

async function copyExternalLink(ch) {
  try {
    const { url } = await call(api.get(`/streams/${ch.id}/external-link`));
    await navigator.clipboard.writeText(url);
    ui.toast(t('channels.linkCopied'));
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-bold flex-1 text-slate-900 dark:text-white">{{ t('channels.title') }}</h1>
      <input v-model="search" class="input !w-56" :placeholder="t('common.search')" @keyup.enter="load" />
      <router-link v-if="auth.can('channel.create')" to="/channels/new" class="btn-primary">
        + {{ t('channels.newChannel') }}
      </router-link>
    </div>

    <div class="card !p-0 overflow-x-auto">
      <table class="table-base">
        <thead>
          <tr>
            <th>{{ t('common.name') }}</th>
            <th>{{ t('common.category') }}</th>
            <th>{{ t('channels.udpTarget') }}</th>
            <th>{{ t('channels.sourceType') }}</th>
            <th>{{ t('monitor.bitrate') }}</th>
            <th>{{ t('common.status') }}</th>
            <th class="text-right">{{ t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ch in channels" :key="ch.id" class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
            <td>
              <div class="flex items-center gap-2">
                <img v-if="ch.logoUrl" :src="ch.logoUrl" class="w-7 h-7 rounded object-cover" />
                <router-link :to="`/channels/${ch.id}`" class="font-medium text-brand-600 hover:underline">
                  {{ ch.name }}
                </router-link>
              </div>
            </td>
            <td>{{ ch.category }}</td>
            <td class="font-mono text-xs">udp://{{ ch.udpIp }}:{{ ch.udpPort }}</td>
            <td>{{ ch.sourceType }}</td>
            <td class="font-mono text-xs">{{ Math.round(ch.process?.bitrateKbps ?? 0) }} kb/s</td>
            <td><StatusBadge :state="ch.status" /></td>
            <td>
              <div class="flex justify-end gap-1">
                <button v-if="auth.can('stream.start')" class="btn-secondary !px-2 !py-1" :disabled="busy[ch.id] || ch.status === 'running' || ch.status === 'starting'" :title="t('channels.start')" @click="action(ch, 'start')">▶</button>
                <button v-if="auth.can('stream.stop')" class="btn-secondary !px-2 !py-1" :disabled="busy[ch.id] || ch.status === 'stopped' || ch.status === 'error'" :title="t('channels.stop')" @click="action(ch, 'stop')">⏹</button>
                <button v-if="auth.can('stream.restart')" class="btn-secondary !px-2 !py-1" :disabled="busy[ch.id]" :title="t('channels.restart')" @click="action(ch, 'restart')">↻</button>
                <button class="btn-secondary !px-2 !py-1" :title="t('channels.externalLink')" @click="copyExternalLink(ch)">🔗</button>
                <button v-if="auth.can('channel.delete')" class="btn-danger !px-2 !py-1" :title="t('common.delete')" @click="deleting = ch">🗑</button>
              </div>
            </td>
          </tr>
          <tr v-if="channels.length === 0">
            <td colspan="7" class="text-center text-slate-400 py-8">{{ t('common.noData') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <ConfirmDialog
      :show="!!deleting"
      :title="t('common.delete') + ': ' + (deleting?.name ?? '')"
      :message="t('common.confirmDelete')"
      @confirm="removeChannel"
      @cancel="deleting = null"
    />
  </div>
</template>
