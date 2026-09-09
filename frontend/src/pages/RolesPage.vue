<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, call } from '../api/client';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';

const { t } = useI18n();
const auth = useAuthStore();
const ui = useUiStore();

const roles = ref([]);
const permissions = ref([]);
const editing = ref(null);
const deleting = ref(null);

const groups = computed(() => {
  const map = {};
  for (const p of permissions.value) (map[p.group] ??= []).push(p);
  return map;
});

async function load() {
  roles.value = await call(api.get('/roles'));
  permissions.value = await call(api.get('/roles/permissions'));
}
onMounted(load);

function startEdit(r) {
  editing.value = r
    ? { id: r.id, name: r.name, description: r.description ?? '', isSystem: r.isSystem, permissionIds: (r.permissions ?? []).map((p) => p.id) }
    : { name: '', description: '', isSystem: false, permissionIds: [] };
}

async function save() {
  try {
    const payload = { name: editing.value.name, description: editing.value.description, permissionIds: editing.value.permissionIds };
    if (editing.value.id) await call(api.put(`/roles/${editing.value.id}`, payload));
    else await call(api.post('/roles', payload));
    ui.toast(t('common.saved'));
    editing.value = null;
    await load();
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}

async function removeRole() {
  try {
    await call(api.delete(`/roles/${deleting.value.id}`));
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
      <h1 class="text-2xl font-bold flex-1 text-slate-900 dark:text-white">{{ t('rolesPage.title') }}</h1>
      <button v-if="auth.can('role.manage')" class="btn-primary" @click="startEdit(null)">+ {{ t('rolesPage.newRole') }}</button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <div v-for="r in roles" :key="r.id" class="card space-y-2">
        <div class="flex items-center justify-between">
          <div class="font-semibold">{{ r.name }}</div>
          <span v-if="r.isSystem" class="badge bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">{{ t('rolesPage.systemRole') }}</span>
        </div>
        <p class="text-xs text-slate-500">{{ r.description }}</p>
        <div class="text-xs text-slate-400">{{ r.permissions?.length ?? 0 }} {{ t('rolesPage.permissions').toLowerCase() }}</div>
        <div class="flex gap-1" v-if="auth.can('role.manage')">
          <button class="btn-secondary !px-2 !py-1" :disabled="r.slug === 'super-admin'" @click="startEdit(r)">✎</button>
          <button class="btn-danger !px-2 !py-1" :disabled="r.isSystem" @click="deleting = r">🗑</button>
        </div>
      </div>
    </div>

    <div v-if="editing" class="card space-y-4">
      <h2 class="font-semibold">{{ editing.id ? t('common.edit') : t('rolesPage.newRole') }}</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label class="label">{{ t('common.name') }}</label><input v-model="editing.name" class="input" :disabled="editing.isSystem" /></div>
        <div><label class="label">{{ t('common.description') }}</label><input v-model="editing.description" class="input" /></div>
      </div>
      <div class="space-y-3">
        <div v-for="(perms, group) in groups" :key="group">
          <div class="label">{{ group }}</div>
          <div class="flex flex-wrap gap-3">
            <label v-for="p in perms" :key="p.id" class="flex items-center gap-1.5 text-sm">
              <input v-model="editing.permissionIds" type="checkbox" :value="p.id" class="rounded" />
              <span class="font-mono text-xs">{{ p.slug }}</span>
            </label>
          </div>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <button class="btn-secondary" @click="editing = null">{{ t('common.cancel') }}</button>
        <button class="btn-primary" @click="save">{{ t('common.save') }}</button>
      </div>
    </div>

    <ConfirmDialog :show="!!deleting" :title="t('common.delete') + ': ' + (deleting?.name ?? '')" :message="t('common.confirmDelete')" @confirm="removeRole" @cancel="deleting = null" />
  </div>
</template>
