<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { api, call } from '../api/client';
import { setLocale } from '../i18n';
import { useUiStore } from '../stores/ui';

const { t, locale } = useI18n();
const router = useRouter();
const ui = useUiStore();

const form = ref({
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  locale: 'tr',
  keepSampleChannels: true,
});

onMounted(async () => {
  const status = await call(api.get('/installer/status')).catch(() => ({ installed: false }));
  if (status.installed) router.replace('/login');
});

async function submit() {
  try {
    form.value.locale = locale.value;
    await call(api.post('/installer', form.value));
    ui.toast(t('installer.done'));
    router.push('/login');
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <form class="card w-full max-w-md space-y-4" @submit.prevent="submit">
      <div class="flex items-center justify-between">
        <h1 class="font-semibold text-lg text-slate-900 dark:text-white">{{ t('installer.title') }}</h1>
        <button type="button" class="text-xs text-slate-500" @click="setLocale(locale === 'tr' ? 'en' : 'tr')">
          {{ locale === 'tr' ? 'EN' : 'TR' }}
        </button>
      </div>
      <p class="text-sm text-slate-500">{{ t('installer.welcome') }}</p>
      <div>
        <label class="label">{{ t('installer.adminName') }}</label>
        <input v-model="form.adminName" class="input" required />
      </div>
      <div>
        <label class="label">{{ t('auth.email') }}</label>
        <input v-model="form.adminEmail" type="email" class="input" required />
      </div>
      <div>
        <label class="label">{{ t('auth.password') }}</label>
        <input v-model="form.adminPassword" type="password" class="input" required />
        <p class="text-xs text-slate-400 mt-1">{{ t('users.passwordHint') }}</p>
      </div>
      <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <input v-model="form.keepSampleChannels" type="checkbox" class="rounded" />
        {{ t('installer.keepSamples') }}
      </label>
      <button class="btn-primary w-full justify-center">{{ t('installer.install') }}</button>
    </form>
  </div>
</template>
