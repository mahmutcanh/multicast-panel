<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, call } from '../api/client';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';

const { t } = useI18n();
const auth = useAuthStore();
const ui = useUiStore();

const users = ref([]);
const roles = ref([]);
const editing = ref(null);
const deleting = ref(null);

const emptyForm = () => ({ name: '', email: '', password: '', locale: 'tr', isActive: true, roleIds: [] });

async function load() {
  users.value = await call(api.get('/users', { params: { limit: 200 } }));
  roles.value = await call(api.get('/roles'));
}
onMounted(load);

function startEdit(u) {
  editing.value = u
    ? { id: u.id, name: u.name, email: u.email, password: '', locale: u.locale, isActive: u.isActive, roleIds: (u.roles ?? []).map((r) => r.id) }
    : emptyForm();
}

async function save() {
  try {
    const payload = { ...editing.value };
    if (!payload.password) delete payload.password;
    if (payload.id) await call(api.put(`/users/${payload.id}`, payload));
    else await call(api.post('/users', payload));
    ui.toast(t('common.saved'));
    editing.value = null;
    await load();
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}

async function removeUser() {
  try {
    await call(api.delete(`/users/${deleting.value.id}`));
    ui.toast(t('common.deleted'));
    deleting.value = null;
    await load();
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-bold flex-1 text-slate-900 dark:text-white">{{ t('users.title') }}</h1>
      <button v-if="auth.can('user.manage')" class="btn-primary" @click="startEdit(null)">+ {{ t('users.newUser') }}</button>
    </div>

    <div class="card !p-0 overflow-x-auto">
      <table class="table-base">
        <thead>
          <tr>
            <th>{{ t('users.fullName') }}</th>
            <th>{{ t('auth.email') }}</th>
            <th>{{ t('users.roles') }}</th>
            <th>MFA</th>
            <th>{{ t('users.active') }}</th>
            <th>{{ t('users.lastLogin') }}</th>
            <th class="text-right">{{ t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td class="font-medium">{{ u.name }}</td>
            <td>{{ u.email }}</td>
            <td>
              <span v-for="r in u.roles" :key="r.id" class="badge bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 mr-1">{{ r.name }}</span>
            </td>
            <td>{{ u.mfaEnabled ? '✓' : '—' }}</td>
            <td>
              <span class="badge" :class="u.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'">
                {{ u.isActive ? t('common.enabled') : t('common.disabled') }}
              </span>
            </td>
            <td class="text-xs text-slate-400">{{ u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—' }}</td>
            <td>
              <div class="flex justify-end gap-1" v-if="auth.can('user.manage')">
                <button class="btn-secondary !px-2 !py-1" @click="startEdit(u)">✎</button>
                <button class="btn-danger !px-2 !py-1" @click="deleting = u">🗑</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="editing" class="card space-y-4 max-w-2xl">
      <h2 class="font-semibold">{{ editing.id ? t('common.edit') : t('users.newUser') }}</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label class="label">{{ t('users.fullName') }}</label><input v-model="editing.name" class="input" /></div>
        <div><label class="label">{{ t('auth.email') }}</label><input v-model="editing.email" type="email" class="input" /></div>
        <div>
          <label class="label">{{ t('auth.password') }}</label>
          <input v-model="editing.password" type="password" class="input" :placeholder="editing.id ? '(değiştirmemek için boş bırakın)' : ''" />
          <p class="text-xs text-slate-400 mt-1">{{ t('users.passwordHint') }}</p>
        </div>
        <div>
          <label class="label">{{ t('users.language') }}</label>
          <select v-model="editing.locale" class="input"><option value="tr">Türkçe</option><option value="en">English</option></select>
        </div>
      </div>
      <div>
        <label class="label">{{ t('users.roles') }}</label>
        <div class="flex flex-wrap gap-3">
          <label v-for="r in roles" :key="r.id" class="flex items-center gap-2 text-sm">
            <input v-model="editing.roleIds" type="checkbox" :value="r.id" class="rounded" /> {{ r.name }}
          </label>
        </div>
      </div>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="editing.isActive" type="checkbox" class="rounded" /> {{ t('users.active') }}
      </label>
      <div class="flex justify-end gap-2">
        <button class="btn-secondary" @click="editing = null">{{ t('common.cancel') }}</button>
        <button class="btn-primary" @click="save">{{ t('common.save') }}</button>
      </div>
    </div>

    <ConfirmDialog :show="!!deleting" :title="t('common.delete') + ': ' + (deleting?.email ?? '')" :message="t('common.confirmDelete')" @confirm="removeUser" @cancel="deleting = null" />
  </div>
</template>
