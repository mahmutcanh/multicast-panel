<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, call } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';

const { t } = useI18n();
const auth = useAuthStore();
const ui = useUiStore();

const pw = ref({ currentPassword: '', newPassword: '' });
const mfaSetup = ref(null); // { qr, secret }
const mfaCode = ref('');
const recoveryCodes = ref(null);
const disableForm = ref({ password: '', code: '' });
const history = ref([]);

onMounted(async () => {
  if (auth.can('logs.view')) {
    history.value = await call(api.get('/auth/login-history', { params: { limit: 20 } })).catch(() => []);
  }
});

async function changePassword() {
  try {
    await call(api.post('/auth/change-password', pw.value));
    pw.value = { currentPassword: '', newPassword: '' };
    ui.toast(t('profile.passwordChanged'));
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}

async function startMfa() {
  mfaSetup.value = await call(api.post('/auth/mfa/setup'));
}

async function enableMfa() {
  try {
    const res = await call(api.post('/auth/mfa/enable', { code: mfaCode.value }));
    recoveryCodes.value = res.recoveryCodes;
    mfaSetup.value = null;
    mfaCode.value = '';
    await auth.fetchMe();
    ui.toast(t('profile.mfaEnabled'));
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}

async function disableMfa() {
  try {
    await call(api.post('/auth/mfa/disable', disableForm.value));
    disableForm.value = { password: '', code: '' };
    await auth.fetchMe();
    ui.toast(t('profile.mfaDisabled'));
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}
</script>

<template>
  <div class="space-y-4 max-w-3xl">
    <h1 class="text-2xl font-bold text-slate-900 dark:text-white">{{ t('profile.title') }}</h1>

    <div class="card text-sm space-y-1">
      <div><span class="label inline">{{ t('users.fullName') }}:</span> {{ auth.user?.name }}</div>
      <div><span class="label inline">{{ t('auth.email') }}:</span> {{ auth.user?.email }}</div>
      <div>
        <span class="label inline">{{ t('users.roles') }}:</span>
        <span v-for="r in auth.user?.roles" :key="r.id" class="badge bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 mr-1">{{ r.name }}</span>
      </div>
    </div>

    <!-- Change password -->
    <div class="card space-y-3">
      <h2 class="font-semibold">{{ t('profile.changePassword') }}</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="label">{{ t('profile.currentPassword') }}</label><input v-model="pw.currentPassword" type="password" class="input" /></div>
        <div><label class="label">{{ t('auth.newPassword') }}</label><input v-model="pw.newPassword" type="password" class="input" /></div>
      </div>
      <div class="flex justify-end">
        <button class="btn-primary" @click="changePassword">{{ t('common.save') }}</button>
      </div>
    </div>

    <!-- MFA -->
    <div class="card space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold">{{ t('profile.mfa') }}</h2>
        <span class="badge" :class="auth.user?.mfaEnabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'">
          {{ auth.user?.mfaEnabled ? t('common.enabled') : t('common.disabled') }}
        </span>
      </div>

      <template v-if="!auth.user?.mfaEnabled">
        <button v-if="!mfaSetup" class="btn-primary" @click="startMfa">{{ t('profile.mfaEnable') }}</button>
        <div v-else class="space-y-3">
          <p class="text-sm text-slate-500">{{ t('profile.mfaScan') }}</p>
          <img :src="mfaSetup.qr" class="w-44 h-44 bg-white p-2 rounded-lg" />
          <code class="text-xs font-mono block">{{ mfaSetup.secret }}</code>
          <div class="flex gap-2 max-w-xs">
            <input v-model="mfaCode" class="input text-center tracking-widest" maxlength="6" placeholder="000000" />
            <button class="btn-primary" @click="enableMfa">{{ t('auth.verify') }}</button>
          </div>
        </div>
        <div v-if="recoveryCodes" class="border border-amber-300 dark:border-amber-700 rounded-lg p-3">
          <p class="text-sm font-medium mb-2">{{ t('profile.recoveryCodes') }}</p>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-1 font-mono text-xs">
            <span v-for="c in recoveryCodes" :key="c">{{ c }}</span>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div><label class="label">{{ t('auth.password') }}</label><input v-model="disableForm.password" type="password" class="input" /></div>
          <div><label class="label">{{ t('auth.mfaCode') }}</label><input v-model="disableForm.code" class="input" /></div>
          <button class="btn-danger" @click="disableMfa">{{ t('profile.mfaDisable') }}</button>
        </div>
      </template>
    </div>

    <!-- Login history -->
    <div v-if="history.length" class="card !p-0 overflow-x-auto">
      <div class="p-4 font-semibold">{{ t('profile.loginHistory') }}</div>
      <table class="table-base">
        <tbody>
          <tr v-for="h in history" :key="h.id">
            <td class="text-xs text-slate-400">{{ new Date(h.createdAt).toLocaleString() }}</td>
            <td>{{ h.email }}</td>
            <td class="font-mono text-xs">{{ h.ip }}</td>
            <td>
              <span class="badge" :class="h.success ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'">
                {{ h.success ? '✓' : h.reason || '✗' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
