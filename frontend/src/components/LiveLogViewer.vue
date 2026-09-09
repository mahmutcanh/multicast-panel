<script setup>
import { onBeforeUnmount, onMounted, ref, nextTick } from 'vue';
import { connectSocket, getSocket } from '../api/socket';

const props = defineProps({
  channelId: { type: String, default: 'all' }, // 'all' or channel uuid
  maxLines: { type: Number, default: 300 },
});

const lines = ref([]);
const box = ref(null);
const room = props.channelId === 'all' ? 'logs:all' : `logs:${props.channelId}`;

function onLog(payload) {
  if (props.channelId !== 'all' && payload.channelId !== props.channelId) return;
  lines.value.push(payload);
  if (lines.value.length > props.maxLines) lines.value.shift();
  nextTick(() => {
    if (box.value) box.value.scrollTop = box.value.scrollHeight;
  });
}

onMounted(() => {
  const s = connectSocket([room]);
  s.on('stream:log', onLog);
});

onBeforeUnmount(() => {
  const s = getSocket();
  s.off('stream:log', onLog);
  s.emit('unsubscribe', [room]);
});
</script>

<template>
  <div ref="box" class="bg-slate-950 text-slate-200 rounded-lg p-3 h-72 overflow-y-auto font-mono text-xs space-y-0.5">
    <div v-for="(l, i) in lines" :key="i" class="whitespace-pre-wrap break-all">
      <span class="text-slate-500">{{ new Date(l.ts).toLocaleTimeString() }}</span>
      <span :class="l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-400' : 'text-emerald-400'"> [{{ l.level }}] </span>
      <span>{{ l.message }}</span>
    </div>
    <div v-if="lines.length === 0" class="text-slate-500 italic">—</div>
  </div>
</template>
