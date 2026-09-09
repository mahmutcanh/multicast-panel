import { defineStore } from 'pinia';
import axios from 'axios';
import { api, call, setAccessToken } from '../api/client';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    mfaToken: '',
    loading: false,
  }),
  getters: {
    isAuthenticated: (s) => !!s.user,
    can: (s) => (perm) => s.user?.permissions?.includes(perm) ?? false,
  },
  actions: {
    async login(email, password, rememberMe) {
      const data = await call(api.post('/auth/login', { email, password, rememberMe }));
      if (data.mfaRequired) {
        this.mfaToken = data.mfaToken;
        return { mfaRequired: true };
      }
      setAccessToken(data.accessToken);
      this.user = data.user;
      return { mfaRequired: false };
    },
    async verifyMfa(code) {
      const data = await call(api.post('/auth/mfa/verify', { mfaToken: this.mfaToken, code }));
      setAccessToken(data.accessToken);
      this.user = data.user;
      this.mfaToken = '';
    },
    async fetchMe() {
      try {
        this.user = await call(api.get('/auth/me'));
      } catch {
        // try silent refresh once (session cookie may still be valid)
        try {
          const res = await axios.post('/api/v1/auth/refresh', {}, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
          setAccessToken(res.data?.data?.accessToken);
          this.user = await call(api.get('/auth/me'));
        } catch {
          this.user = null;
          setAccessToken('');
        }
      }
    },
    async logout() {
      await call(api.post('/auth/logout')).catch(() => {});
      setAccessToken('');
      this.user = null;
    },
  },
});
