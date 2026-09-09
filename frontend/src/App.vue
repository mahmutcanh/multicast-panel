<script setup>
import { onMounted } from 'vue';
import { useUiStore } from './stores/ui';

const ui = useUiStore();
onMounted(() => ui.applyTheme());
</script>

<template>
  <router-view />
  <!-- global toasts -->
  <div class="fixed bottom-4 right-4 z-50 space-y-2">
    <div
      v-for="t in ui.toasts"
      :key="t.id"
      class="px-4 py-3 rounded-lg shadow-lg text-sm text-white max-w-sm"
      :class="t.type === 'error' ? 'bg-red-600' : t.type === 'warning' ? 'bg-amber-600' : 'bg-emerald-600'"
    >
      {{ t.message }}
    </div>
  </div>
</template>
