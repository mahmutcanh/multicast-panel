import axios from 'axios';

export const api = axios.create({ baseURL: '/api/v1', timeout: 40000 });

let accessToken = localStorage.getItem('mcp_token') || '';
let refreshing = null;

export function setAccessToken(token) {
  accessToken = token || '';
  if (token) localStorage.setItem('mcp_token', token);
  else localStorage.removeItem('mcp_token');
}

export function getAccessToken() {
  return accessToken;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

async function refreshToken() {
  const res = await axios.post(
    '/api/v1/auth/refresh',
    {},
    { headers: { 'X-Requested-With': 'XMLHttpRequest' } },
  );
  const token = res.data?.data?.accessToken;
  setAccessToken(token);
  return token;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    if (status === 401 && !original._retried && !original.url.includes('/auth/')) {
      original._retried = true;
      try {
        refreshing = refreshing || refreshToken();
        await refreshing;
        refreshing = null;
        return api(original);
      } catch {
        refreshing = null;
        setAccessToken('');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

/** unwraps { success, data, error } envelope; throws Error(message) on failure */
export async function call(promise) {
  try {
    const res = await promise;
    return res.data?.data ?? res.data;
  } catch (err) {
    let message = err.response?.data?.error || err.message || 'Request failed';
    if (!err.response) {
      message = err.code === 'ECONNABORTED'
        ? 'IPTV sunucusu zamanında yanıt vermedi (Timeout). Sunucu adresini kontrol edin.'
        : 'Sunucuya bağlanılamadı (Network Error). İnternet bağlantınızı veya sunucu durumunu kontrol edin.';
    }
    throw new Error(message);
  }
}
