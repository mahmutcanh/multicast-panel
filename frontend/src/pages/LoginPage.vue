<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { api, call } from '../api/client';
import { setLocale } from '../i18n';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';

const { t, locale } = useI18n();
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const ui = useUiStore();

const email = ref('');
const password = ref('');
const rememberMe = ref(false);
const mfaStep = ref(false);
const mfaCode = ref('');
const forgotMode = ref(false);
const loading = ref(false);

async function submit() {
  loading.value = true;
  try {
    if (forgotMode.value) {
      await call(api.post('/auth/forgot-password', { email: email.value }));
      ui.toast(t('auth.resetSent'));
      forgotMode.value = false;
    } else if (mfaStep.value) {
      await auth.verifyMfa(mfaCode.value);
      router.push(route.query.redirect || '/');
    } else {
      const res = await auth.login(email.value, password.value, rememberMe.value);
      if (res.mfaRequired) mfaStep.value = true;
      else router.push(route.query.redirect || '/');
    }
  } catch (err) {
    ui.toast(err.message || t('auth.loginFailed'), 'error');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="card w-full max-w-sm">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-2">
          <div class="w-9 h-9 rounded-lg bg-brand-600 text-white flex items-center justify-center font-bold">M</div>
          <div class="font-semibold text-slate-900 dark:text-white">{{ t('app.title') }}</div>
        </div>
        <button class="text-xs text-slate-500" @click="setLocale(locale === 'tr' ? 'en' : 'tr')">
          {{ locale === 'tr' ? 'EN' : 'TR' }}
        </button>
      </div>

      <form class="space-y-4" @submit.prevent="submit">
        <template v-if="mfaStep">
          <h2 class="font-semibold text-slate-900 dark:text-white">{{ t('auth.mfaTitle') }}</h2>
          <p class="text-xs text-slate-500">{{ t('auth.mfaHint') }}</p>
          <div>
            <label class="label">{{ t('auth.mfaCode') }}</label>
            <input v-model="mfaCode" class="input text-center tracking-widest" maxlength="10" autofocus />
          </div>
          <button class="btn-primary w-full justify-center" :disabled="loading">{{ t('auth.verify') }}</button>
        </template>

        <template v-else>
          <div>
            <label class="label">{{ t('auth.email') }}</label>
            <input v-model="email" type="email" class="input" required autofocus />
          </div>
          <div v-if="!forgotMode">
            <label class="label">{{ t('auth.password') }}</label>
            <input v-model="password" type="password" class="input" required />
          </div>
          <div v-if="!forgotMode" class="flex items-center justify-between text-sm">
            <label class="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <input v-model="rememberMe" type="checkbox" class="rounded" /> {{ t('auth.rememberMe') }}
            </label>
            <button type="button" class="text-brand-600 hover:underline" @click="forgotMode = true">
              {{ t('auth.forgotPassword') }}
            </button>
          </div>
          <button class="btn-primary w-full justify-center" :disabled="loading">
            {{ forgotMode ? t('auth.sendResetLink') : t('auth.login') }}
          </button>
          <button v-if="forgotMode" type="button" class="btn-secondary w-full justify-center" @click="forgotMode = false">
            {{ t('common.back') }}
          </button>
        </template>
      </form>
    </div>
  </div>
</template>
