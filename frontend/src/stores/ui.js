import { defineStore } from 'pinia';

export const useUiStore = defineStore('ui', {
  state: () => ({
    dark: localStorage.getItem('mcp_dark') === '1',
    sidebarOpen: true,
    toasts: [],
  }),
  actions: {
    applyTheme() {
      document.documentElement.classList.toggle('dark', this.dark);
    },
    toggleDark() {
      this.dark = !this.dark;
      localStorage.setItem('mcp_dark', this.dark ? '1' : '0');
      this.applyTheme();
    },
    toast(message, type = 'success') {
      const id = Date.now() + Math.random();
      this.toasts.push({ id, message, type });
      setTimeout(() => {
        this.toasts = this.toasts.filter((t) => t.id !== id);
      }, 4000);
    },
  },
});
