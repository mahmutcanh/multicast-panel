<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, call } from '../api/client';
import { useUiStore } from '../stores/ui';

const { t } = useI18n();
const ui = useUiStore();
const settings = ref(null);

const EVENTS = ['stream_offline', 'ffmpeg_crash', 'auto_restart', 'high_cpu', 'high_ram', 'low_disk', 'bitrate_drop', 'login_failures', 'backup_failure'];

onMounted(async () => {
  settings.value = await call(api.get('/alerts/settings'));
  for (const e of EVENTS) settings.value.events[e] ??= { enabled: true };
});

async function save() {
  try {
    const { id, updatedAt, ...payload } = settings.value;
    settings.value = await call(api.put('/alerts/settings', payload));
    ui.toast(t('common.saved'));
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}

async function sendTest() {
  try {
    await call(api.post('/alerts/test'));
    ui.toast(t('alertsPage.testSent'));
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}
</script>

<template>
  <div v-if="settings" class="space-y-4 max-w-4xl">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-bold flex-1 text-slate-900 dark:text-white">{{ t('alertsPage.title') }}</h1>
      <button class="btn-secondary" @click="sendTest">{{ t('alertsPage.sendTest') }}</button>
      <button class="btn-primary" @click="save">{{ t('common.save') }}</button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Telegram -->
      <div class="card space-y-3">
        <label class="flex items-center gap-2 font-semibold">
          <input v-model="settings.telegramEnabled" type="checkbox" class="rounded" /> {{ t('alertsPage.telegram') }}
        </label>
        <div><label class="label">{{ t('alertsPage.botToken') }}</label><input v-model="settings.telegramBotToken" class="input font-mono" /></div>
        <div><label class="label">{{ t('alertsPage.chatId') }}</label><input v-model="settings.telegramChatId" class="input font-mono" /></div>
      </div>

      <!-- Email -->
      <div class="card space-y-3">
        <label class="flex items-center gap-2 font-semibold">
          <input v-model="settings.emailEnabled" type="checkbox" class="rounded" /> {{ t('alertsPage.emailChannel') }} (SMTP)
        </label>
        <div><label class="label">{{ t('alertsPage.emailTo') }}</label><input v-model="settings.emailTo" class="input" /></div>
        <p class="text-xs text-slate-400">SMTP: .env → SMTP_HOST / SMTP_USER / SMTP_PASSWORD</p>
      </div>

      <!-- Webhooks -->
      <div class="card space-y-3 md:col-span-2">
        <label class="flex items-center gap-2 font-semibold">
          <input v-model="settings.webhookEnabled" type="checkbox" class="rounded" /> {{ t('alertsPage.webhook') }}
        </label>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label class="label">Webhook URL</label><input v-model="settings.webhookUrl" class="input font-mono" /></div>
          <div><label class="label">{{ t('alertsPage.slack') }}</label><input v-model="settings.slackWebhookUrl" class="input font-mono" /></div>
          <div><label class="label">{{ t('alertsPage.discord') }}</label><input v-model="settings.discordWebhookUrl" class="input font-mono" /></div>
        </div>
      </div>
    </div>

    <!-- Events -->
    <div class="card">
      <h2 class="font-semibold mb-3">{{ t('alertsPage.events') }}</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <div v-for="e in EVENTS" :key="e" class="flex items-center gap-3 border border-slate-100 dark:border-slate-800 rounded-lg p-3">
          <input v-model="settings.events[e].enabled" type="checkbox" class="rounded" />
          <div class="flex-1 text-sm">{{ t(`alertsPage.eventNames.${e}`) }}</div>
          <input
            v-if="['high_cpu', 'high_ram', 'low_disk', 'bitrate_drop', 'login_failures'].includes(e)"
            v-model.number="settings.events[e].threshold"
            type="number"
            class="input !w-20 !py-1"
            :title="t('alertsPage.threshold')"
          />
        </div>
      </div>
    </div>
  </div>
</template>
