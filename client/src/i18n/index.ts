/* All UI strings are externalized (SRS §6.2). English ships first; add a language by dropping in
 * another JSON file and registering it below. Components call t('key', 'English fallback'). */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
