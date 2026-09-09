<script setup>
defineProps({
  title: String,
  value: [String, Number],
  sub: { type: String, default: '' },
  accent: { type: String, default: 'brand' },
});
</script>

<template>
  <div class="card flex items-center gap-4">
    <div
      class="w-11 h-11 rounded-lg flex items-center justify-center text-lg"
      :class="{
        'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300': accent === 'brand',
        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300': accent === 'green',
        'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300': accent === 'amber',
        'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300': accent === 'red',
      }"
    >
      <slot name="icon">●</slot>
    </div>
    <div class="min-w-0">
      <div class="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{{ title }}</div>
      <div class="text-2xl font-bold text-slate-900 dark:text-white truncate">{{ value }}</div>
      <div v-if="sub" class="text-xs text-slate-400">{{ sub }}</div>
    </div>
  </div>
</template>
