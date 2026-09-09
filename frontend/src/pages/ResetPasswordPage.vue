<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { api, call } from '../api/client';
import { useUiStore } from '../stores/ui';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const password = ref('');

async function submit() {
  try {
    await call(api.post('/auth/reset-password', { token: route.query.token, password: password.value }));
    ui.toast(t('common.saved'));
    router.push('/login');
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <form class="card w-full max-w-sm space-y-4" @submit.prevent="submit">
      <h1 class="font-semibold text-lg text-slate-900 dark:text-white">{{ t('auth.resetPassword') }}</h1>
      <div>
        <label class="label">{{ t('auth.newPassword') }}</label>
        <input v-model="password" type="password" class="input" required />
        <p class="text-xs text-slate-400 mt-1">{{ t('users.passwordHint') }}</p>
      </div>
      <button class="btn-primary w-full justify-center">{{ t('common.save') }}</button>
    </form>
  </div>
</template>
