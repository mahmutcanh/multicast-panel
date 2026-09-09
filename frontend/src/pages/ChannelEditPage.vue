<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { api, call } from '../api/client';
import { useUiStore } from '../stores/ui';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const ui = useUiStore();

const isNew = computed(() => !route.params.id);
const playlists = ref([]);
const saving = ref(false);

const form = ref({
  name: '',
  logoUrl: '',
  category: '',
  description: '',
  epgId: '',
  sourceType: 'youtube',
  sourceUrl: '',
  playlistId: null,
  udpIp: '230.120.5.98',
  udpPort: 1234,
  ttl: 64,
  pktSize: 1316,
  iface: '',
  copyMode: true,
  videoCodec: 'libx264',
  audioCodec: 'aac',
  videoBitrate: '4000k',
  audioBitrate: '128k',
  resolution: '',
  fps: 0,
  gop: 50,
  preset: 'veryfast',
  threads: 0,
  bufsize: '',
  muxrate: '',
  hwaccel: '',
  probeSize: '',
  analyzeDuration: '',
  extraFfmpegArgs: '',
  loopMode: true,
  autoStart: true,
  autoRestart: true,
  restartMax: 10,
  schedule: { enabled: false, startCron: '', stopCron: '' },
  priority: 0,
  notes: '',
  engine: 'ffmpeg',
  outputs: [
    { type: 'udp', enabled: true, url: '', config: {}, publicEnabled: true, tokenRequired: false },
    { type: 'hls', enabled: true, url: '', config: {}, publicEnabled: true, tokenRequired: false }
  ],
});

const sourceTypes = [
  { value: 'youtube', label: '📺 YouTube (Canlı veya Video URL)' },
  { value: 'screen', label: '🖥️ Ekran Yakalama (Masaüstü / Screen)' },
  { value: 'm3u8', label: '🌐 M3U8 / HLS İnternet Akışı' },
  { value: 'http', label: '🔗 HTTP Stream' },
  { value: 'udp', label: '📡 UDP Multicast Girdisi' },
  { value: 'file', label: '📁 Yerel Video Dosyası (MP4/MKV)' },
  { value: 'playlist', label: '📋 Oynatma Listesi' },
  { value: 'rtsp', label: '📹 RTSP Kamera' },
  { value: 'rtmp', label: '🛰️ RTMP Girdisi' },
  { value: 'm3u_link', label: '🔗 M3U IPTV Linki' },
  { value: 'camera', label: '📷 USB / Web Kamera (/dev/video0)' },
  { value: 'test_pattern', label: '🎨 Test Deseni (Renk Renk Skalası + Ses)' },
];

const outputTypes = [
  { value: 'udp', label: '📡 UDP Multicast (Otel TV Ağı)' },
  { value: 'hls', label: '🌐 HLS / M3U8 (İnternet / Web / Mobil)' },
  { value: 'http', label: '🔗 HTTP Stream (MPEG-TS Akışı)' },
  { value: 'srt', label: '⚡ SRT Akışı' },
  { value: 'rtmp', label: '🛰️ RTMP (YouTube / Twitch Canlı Yayın)' },
];

const presets = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow'];

onMounted(async () => {
  playlists.value = await call(api.get('/playlists', { params: { limit: 200 } })).catch(() => []);
  if (!isNew.value) {
    const ch = await call(api.get(`/channels/${route.params.id}`));
    delete ch.process;
    form.value = {
      ...form.value,
      ...ch,
      schedule: ch.schedule ?? { enabled: false, startCron: '', stopCron: '' },
      outputs: (ch.outputs ?? []).map((o) => ({ ...o })),
    };
  }
});

function addOutput(type = 'hls') {
  let defaultUrl = '';
  if (type === 'http') defaultUrl = 'http://0.0.0.0:8080/stream.ts';
  if (type === 'srt') defaultUrl = 'srt://127.0.0.1:9000?mode=caller';
  if (type === 'rtmp') defaultUrl = 'rtmp://a.rtmp.youtube.com/live2/KEY';

  form.value.outputs.push({
    type,
    enabled: true,
    url: defaultUrl,
    config: {},
    publicEnabled: true,
    tokenRequired: false
  });
}

function removeOutput(i) {
  form.value.outputs.splice(i, 1);
}

function placeholderForSource(type) {
  switch (type) {
    case 'youtube': return 'https://www.youtube.com/watch?v=2l7XOjbOyQY';
    case 'screen': return ':0.0 (veya varsayılan ekran)';
    case 'm3u8': return 'https://example.com/live/stream.m3u8';
    case 'http': return 'http://example.com/stream.ts';
    case 'udp': return 'udp://230.1.1.1:1234';
    case 'file': return '/data/media/video.mp4';
    case 'rtsp': return 'rtsp://admin:123456@192.168.1.100:554/stream';
    case 'rtmp': return 'rtmp://example.com/live/stream';
    case 'camera': return '/dev/video0';
    default: return 'Kaynak bağlantısını girin...';
  }
}

function placeholderForOutput(type) {
  switch (type) {
    case 'udp': return 'Otomatik (Aşağıdaki UDP Multicast ayarları kullanılır)';
    case 'hls': return 'Otomatik (Panel üzerinden https://stream.homaklab.com/hls/... olarak sunulur)';
    case 'http': return 'http://0.0.0.0:8080/stream.ts';
    case 'srt': return 'srt://127.0.0.1:9000?mode=caller';
    case 'rtmp': return 'rtmp://a.rtmp.youtube.com/live2/YOUR_STREAM_KEY';
    default: return '';
  }
}

async function save() {
  saving.value = true;
  try {
    const payload = { ...form.value };
    ['id', 'status', 'createdAt', 'updatedAt', 'nodeId', 'node', 'mpegtsOpts', 'reconnectOpts'].forEach((k) => delete payload[k]);
    payload.outputs = payload.outputs.map(({ type, enabled, url, config, publicEnabled, tokenRequired }) => ({
      type, enabled, url, config: config ?? {}, publicEnabled, tokenRequired,
    }));
    if (!payload.playlistId) delete payload.playlistId;
    if (isNew.value) await call(api.post('/channels', payload));
    else await call(api.put(`/channels/${route.params.id}`, payload));
    ui.toast(t('common.saved'));
    router.push('/channels');
  } catch (err) {
    ui.toast(err.message, 'error');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="space-y-6 max-w-5xl pb-10" @submit.prevent="save">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">
          {{ isNew ? '✨ Yeni Yayın Kanalı Oluştur' : '✏️ Kanalı Düzenle' }}
        </h1>
        <p class="text-xs text-slate-500 mt-1">Giriş kaynağını belirleyin ve istediğiniz sayıda UDP / HLS / HTTP çıkışı ekleyin.</p>
      </div>
      <div class="flex items-center gap-3">
        <router-link to="/channels" class="btn-secondary">İptal</router-link>
        <button class="btn-primary !px-5" :disabled="saving">
          {{ saving ? 'Kaydediliyor...' : ' Kaydet' }}
        </button>
      </div>
    </div>

    <!-- 1. Temel Bilgiler -->
    <div class="card space-y-4">
      <h2 class="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-base">
        <span>📌</span> Kanal Bilgileri
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="label">Kanal Adı *</label>
          <input v-model="form.name" class="input" placeholder="Örn: TRT 1 HD / Haber / Youtube Live" required />
        </div>
        <div>
          <label class="label">Kategori</label>
          <input v-model="form.category" class="input" placeholder="Örn: Genel, Spor, Haber" />
        </div>
        <div>
          <label class="label">Logo URL</label>
          <input v-model="form.logoUrl" class="input" placeholder="https://..." />
        </div>
      </div>
    </div>

    <!-- 2. Kaynak Seçimi -->
    <div class="card space-y-4 border-l-4 border-l-brand-500">
      <div class="flex items-center justify-between">
        <h2 class="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-base">
          <span>📥</span> 1. Yayın Kaynağı (Giriş)
        </h2>
        <span class="text-xs px-2.5 py-1 bg-brand-50 dark:bg-brand-950 text-brand-600 rounded-full font-medium">Nereden yayın alınacak?</span>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="label">Kaynak Tipi *</label>
          <select v-model="form.sourceType" class="input font-medium">
            <option v-for="s in sourceTypes" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
        </div>

        <div v-if="form.sourceType === 'playlist'" class="md:col-span-2">
          <label class="label">Oynatma Listesi Seçin *</label>
          <select v-model="form.playlistId" class="input">
            <option v-for="p in playlists" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>

        <div v-else-if="form.sourceType !== 'test_pattern'" class="md:col-span-2">
          <label class="label">Kaynak Bağlantısı / URL *</label>
          <input 
            v-model="form.sourceUrl" 
            class="input font-mono text-sm" 
            :placeholder="placeholderForSource(form.sourceType)" 
            required 
          />
        </div>
      </div>
      <p class="text-xs text-slate-400">
        💡 <strong>YouTube:</strong> Direkt YouTube linkini koyun. <strong>Ekran:</strong> Sunucu masaüstünü canlı yayınlar. <strong>M3U8 / HTTP:</strong> İnternet canlı yayın linkleri.
      </p>
    </div>

    <!-- 3. Çıktılar (Çoklu Yayın) -->
    <div class="card space-y-4 border-l-4 border-l-emerald-500">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-base">
            <span>📤</span> 2. Yayın Çıktıları (İstediğiniz Çıktıyı Ekleyin)
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">Aynı anda UDP (Otel), HLS (İnternet), HTTP, SRT veya RTMP yayını verebilirsiniz.</p>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="btn-secondary text-xs" @click="addOutput('hls')">+ HLS (Web/M3U8)</button>
          <button type="button" class="btn-secondary text-xs" @click="addOutput('udp')">+ UDP Multicast</button>
          <button type="button" class="btn-secondary text-xs" @click="addOutput('http')">+ HTTP Stream</button>
          <button type="button" class="btn-secondary text-xs" @click="addOutput('rtmp')">+ RTMP</button>
        </div>
      </div>

      <div class="space-y-3">
        <div 
          v-for="(o, i) in form.outputs" 
          :key="i" 
          class="p-3.5 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-sm font-bold text-slate-700 dark:text-slate-200">Çıktı #{{ i + 1 }}</span>
              <select v-model="o.type" class="input !py-1 text-xs font-semibold w-auto">
                <option v-for="ot in outputTypes" :key="ot.value" :value="ot.value">{{ ot.label }}</option>
              </select>
            </div>
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-1.5 text-xs cursor-pointer">
                <input v-model="o.enabled" type="checkbox" class="rounded text-brand-600" />
                <span>Aktif</span>
              </label>
              <label v-if="o.type === 'hls' || o.type === 'http'" class="flex items-center gap-1.5 text-xs cursor-pointer">
                <input v-model="o.publicEnabled" type="checkbox" class="rounded text-emerald-600" />
                <span>Dışarıdan İzlenebilsin (Şifresiz)</span>
              </label>
              <button 
                type="button" 
                class="text-red-500 hover:text-red-700 text-xs px-2 py-1 bg-red-50 dark:bg-red-950/40 rounded-lg transition-colors" 
                @click="removeOutput(i)"
              >
                🗑️ Kaldır
              </button>
            </div>
          </div>

          <div v-if="o.type === 'udp'" class="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
            <div><label class="label text-xs">UDP Multicast IP *</label><input v-model="form.udpIp" class="input !py-1 text-xs font-mono" placeholder="230.120.5.98" required /></div>
            <div><label class="label text-xs">UDP Port *</label><input v-model.number="form.udpPort" type="number" class="input !py-1 text-xs font-mono" placeholder="1234" required /></div>
            <div><label class="label text-xs">TTL</label><input v-model.number="form.ttl" type="number" class="input !py-1 text-xs font-mono" /></div>
            <div><label class="label text-xs">Paket Boyutu (Packet Size)</label><input v-model.number="form.pktSize" type="number" class="input !py-1 text-xs font-mono" /></div>
          </div>

          <div v-else-if="o.type !== 'hls'" class="grid grid-cols-1 gap-2">
            <label class="label text-xs">Hedef Yayın Bağlantısı (URL)</label>
            <input v-model="o.url" class="input !py-1 text-xs font-mono" :placeholder="placeholderForOutput(o.type)" />
          </div>

          <div v-else class="text-xs text-slate-500 bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span>🌐 <strong>HLS İnternet Bağlantısı:</strong> Yayın başladığında otomatik <code>https://stream.homaklab.com/hls/&lt;kanal-id&gt;/index.m3u8</code> olarak sunulur.</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 4. Otomatik Başlatma Ayarları -->
    <div class="card space-y-4">
      <h2 class="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-base">
        <span>⚙️</span> Çalışma Kuralları
      </h2>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
        <label class="flex items-center gap-2 text-sm cursor-pointer">
          <input v-model="form.autoStart" type="checkbox" class="rounded text-brand-600" />
          <span>Sistem açılışında otomatik başlat</span>
        </label>
        <label class="flex items-center gap-2 text-sm cursor-pointer">
          <input v-model="form.autoRestart" type="checkbox" class="rounded text-brand-600" />
          <span>Kesilirse otomatik yeniden başlat</span>
        </label>
        <label class="flex items-center gap-2 text-sm cursor-pointer">
          <input v-model="form.loopMode" type="checkbox" class="rounded text-brand-600" />
          <span>Video bitince döngüye al (Loop)</span>
        </label>
      </div>
    </div>
  </form>
</template>
