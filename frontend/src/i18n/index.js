import { createI18n } from 'vue-i18n';
import tr from './tr.json';
import en from './en.json';

export const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('mcp_locale') || 'tr',
  fallbackLocale: 'en',
  messages: { tr, en },
});

export function setLocale(locale) {
  i18n.global.locale.value = locale;
  localStorage.setItem('mcp_locale', locale);
  document.documentElement.lang = locale;
}
