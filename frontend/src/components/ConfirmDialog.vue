<script setup>
import { useI18n } from 'vue-i18n';

defineProps({ show: Boolean, title: String, message: String, danger: { type: Boolean, default: true } });
const emit = defineEmits(['confirm', 'cancel']);
const { t } = useI18n();
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="emit('cancel')">
      <div class="card max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">{{ title }}</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300 mb-5">{{ message }}</p>
        <div class="flex justify-end gap-2">
          <button class="btn-secondary" @click="emit('cancel')">{{ t('common.cancel') }}</button>
          <button :class="danger ? 'btn-danger' : 'btn-primary'" @click="emit('confirm')">{{ t('common.confirm') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
