<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({ state: { type: String, default: 'stopped' } });
const { t } = useI18n();

const cls = computed(() => ({
  running: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  starting: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  restarting: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  crashed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  stopped: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}[props.state] ?? 'bg-slate-100 text-slate-600'));
</script>

<template>
  <span class="badge" :class="cls">
    <span class="w-1.5 h-1.5 rounded-full mr-1.5"
      :class="state === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-current opacity-60'" />
    {{ t(`monitor.state.${state}`, state) }}
  </span>
</template>
