<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, call, getAccessToken } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';

const { t } = useI18n();
const auth = useAuthStore();
const ui = useUiStore();

const rememberAccount = ref(true);

const importForm = ref({
  source: 'xtream',
  url: '',
  content: '',
  xtreamHost: '',
  xtreamUser: '',
  xtreamPass: '',
  udpBaseIp: '230.121.0.1',
  outputTypes: ['udp', 'hls', 'http']
});
const history = ref([]);
const importing = ref(false);

async function load() {
  if (auth.can('m3u.import')) {
    history.value = await call(api.get('/m3u/imports')).catch(() => []);
  }
}

onMounted(async () => {
  importForm.value.xtreamHost = localStorage.getItem('mcp_xtream_host') || '';
  importForm.value.xtreamUser = localStorage.getItem('mcp_xtream_user') || '';
  importForm.value.xtreamPass = localStorage.getItem('mcp_xtream_pass') || '';
  await load();
});

async function doImport() {
  importing.value = true;
  try {
    if (importForm.value.source === 'xtream' && rememberAccount.value) {
      if (importForm.value.xtreamHost) localStorage.setItem('mcp_xtream_host', importForm.value.xtreamHost);
      if (importForm.value.xtreamUser) localStorage.setItem('mcp_xtream_user', importForm.value.xtreamUser);
      if (importForm.value.xtreamPass) localStorage.setItem('mcp_xtream_pass', importForm.value.xtreamPass);
    }
    const payload = { ...importForm.value };
    if (payload.source === 'url') delete payload.content;
    const res = await call(api.post('/m3u/import', payload));
    ui.toast(t('m3u.importDone', { count: res.channelsCreated }));
    await load();
  } catch (err) {
    ui.toast(err.message, 'error');
  } finally {
    importing.value = false;
  }
}

function clearSavedAccount() {
  localStorage.removeItem('mcp_xtream_host');
  localStorage.removeItem('mcp_xtream_user');
  localStorage.removeItem('mcp_xtream_pass');
  importForm.value.xtreamHost = '';
  importForm.value.xtreamUser = '';
  importForm.value.xtreamPass = '';
  ui.toast('Kaydedilmiş hesap bilgileri temizlendi.');
}

async function download(format, filename) {
  try {
    const res = await api.get('/m3u/export', {
      params: format ? { format } : {},
      responseType: 'blob',
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    ui.toast(err.message, 'error');
  }
}
</script>

<template>
  <div class="space-y-6 max-w-5xl">
    <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">📡 M3U & IPTV İçe/Dışa Aktarma</h1>
        <p class="text-xs text-slate-500 mt-0.5">Satın aldığınız IPTV üyeliklerini otomatik kanallara dönüştürün veya listenizi dışa aktarın.</p>
      </div>
      <div v-if="auth.can('m3u.export')" class="flex gap-2">
        <button class="btn-primary text-xs" @click="download('', 'channels.m3u')">⬇ M3U İndir</button>
        <button class="btn-secondary text-xs" @click="download('json', 'channels.json')">⬇ JSON</button>
      </div>
    </div>

    <!-- Import -->
    <div class="card space-y-4 border-l-4 border-l-brand-500" v-if="auth.can('m3u.import')">
      <div class="flex items-center justify-between">
        <h2 class="font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span>📥</span> IPTV Satın Alma / M3U İçe Aktarma
        </h2>
        <span class="text-xs text-brand-500 font-medium">Xtream Codes & M3U Destekli</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="label">Aktarma Yöntemi</label>
          <select v-model="importForm.source" class="input font-semibold">
            <option value="xtream">🔑 IPTV Kullanıcı Bilgileri (Xtream)</option>
            <option value="url">🌐 M3U URL Adresi</option>
            <option value="content">📋 M3U Metni Yapıştır</option>
          </select>
        </div>

        <div>
          <label class="label">Başlangıç UDP IP</label>
          <input v-model="importForm.udpBaseIp" class="input font-mono" placeholder="230.121.0.1" />
        </div>
      </div>

      <!-- Automatic Output Selection -->
      <div class="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
        <label class="label text-xs font-bold text-slate-700 dark:text-slate-300">⚡ Çözülen Tüm Kanallar İçin Otomatik Oluşturulacak Çıktılar (Çoklu Yayın):</label>
        <div class="flex flex-wrap gap-5 text-xs">
          <label class="flex items-center gap-1.5 cursor-pointer font-medium text-emerald-600 dark:text-emerald-400">
            <input v-model="importForm.outputTypes" value="udp" type="checkbox" class="rounded text-emerald-600" />
            <span>📡 UDP Multicast (Otel TV Ağı)</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer font-medium text-brand-600 dark:text-brand-400">
            <input v-model="importForm.outputTypes" value="hls" type="checkbox" class="rounded text-brand-600" />
            <span>🌐 HLS / M3U8 (İnternet / Web / Mobil)</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer font-medium text-sky-600 dark:text-sky-400">
            <input v-model="importForm.outputTypes" value="http" type="checkbox" class="rounded text-sky-600" />
            <span>🔗 HTTP Stream (MPEG-TS Akışı)</span>
          </label>
        </div>
      </div>

      <!-- Xtream Form -->
      <div v-if="importForm.source === 'xtream'" class="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
        <div class="flex items-center justify-between">
          <div class="font-bold text-xs text-brand-600 dark:text-brand-400">IPTV Satın Aldığınız Sağlayıcı Bilgileri (Xtream Codes)</div>
          <button v-if="importForm.xtreamHost || importForm.xtreamUser" type="button" class="text-xs text-red-500 hover:underline" @click="clearSavedAccount">
            🗑️ Kayıtlı Hesabı Temizle
          </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="label text-xs">IPTV Sunucu Adresi (Host:Port) *</label>
            <input v-model="importForm.xtreamHost" class="input text-xs font-mono" placeholder="http://iptv-sunucu.com:8080" />
          </div>
          <div>
            <label class="label text-xs">Kullanıcı Adı (Username) *</label>
            <input v-model="importForm.xtreamUser" class="input text-xs font-mono" placeholder="kullanici123" />
          </div>
          <div>
            <label class="label text-xs">Şifre (Password) *</label>
            <input v-model="importForm.xtreamPass" type="password" class="input text-xs font-mono" placeholder="••••••••" />
          </div>
        </div>
        <div class="flex items-center justify-between pt-1">
          <label class="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
            <input v-model="rememberAccount" type="checkbox" class="rounded text-brand-600" />
            <span>Giriş bilgilerimi hatırla ve kayıtlı tut</span>
          </label>
          <p class="text-[11px] text-slate-400">
            💡 Panel <code>get.php?username=...&password=...&type=m3u_plus</code> bağlantısını otomatik kurar.
          </p>
        </div>
      </div>

      <!-- URL Form -->
      <div v-else-if="importForm.source === 'url'" class="space-y-2">
        <label class="label">M3U Bağlantı Linki (URL) *</label>
        <input v-model="importForm.url" class="input font-mono text-sm" placeholder="http://iptv-sunucu.com/get.php?username=...&password=..." />
      </div>

      <!-- Content Form -->
      <div v-else-if="importForm.source === 'content'" class="space-y-2">
        <label class="label">M3U Liste İçeriği (#EXTM3U)</label>
        <textarea v-model="importForm.content" class="input font-mono text-xs" rows="6" placeholder="#EXTM3U&#10;#EXTINF:-1,Kanal 1&#10;http://..." />
      </div>

      <div class="flex justify-end pt-2">
        <button class="btn-primary !px-6" :disabled="importing" @click="doImport">
          {{ importing ? 'Çözülüyor & Aktarılıyor...' : '⚡ Kanalları Çöz ve İçe Aktar' }}
        </button>
      </div>
    </div>

    <!-- History -->
    <div class="card space-y-3" v-if="auth.can('m3u.import')">
      <h2 class="font-bold text-sm text-slate-800 dark:text-slate-200">🕒 Geçmiş Aktarımlar</h2>
      <div class="overflow-x-auto">
        <table class="table-base">
          <thead>
            <tr><th>Tarih</th><th>Bağlantı / Kaynak</th><th>Oluşturulan Kanal</th><th>Durum</th></tr>
          </thead>
          <tbody>
            <tr v-for="h in history" :key="h.id">
              <td class="text-xs text-slate-400">{{ new Date(h.createdAt).toLocaleString() }}</td>
              <td class="font-mono text-xs truncate max-w-md">{{ h.url || h.source }}</td>
              <td class="font-bold text-emerald-600 dark:text-emerald-400">{{ h.channelsCreated }} kanal</td>
              <td><span class="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{{ h.status }}</span></td>
            </tr>
            <tr v-if="history.length === 0"><td colspan="4" class="text-center text-slate-400 py-6">Henüz aktarım yapılmadı</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
