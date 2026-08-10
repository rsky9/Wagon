import { en } from './locales/en'
import { hi } from './locales/hi'
import { bn } from './locales/bn'
import { mr } from './locales/mr'
import { te } from './locales/te'
import { ta } from './locales/ta'
import { gu } from './locales/gu'
import { ur } from './locales/ur'
import { kn } from './locales/kn'
import { od } from './locales/od'
import { ml } from './locales/ml'
import type { LanguageCode } from '@wagon/contracts'

export const resources: Record<string, { translation: import('./locales/en').TranslationSchema }> = {
  en,
  hi,
  bn,
  mr,
  te,
  ta,
  gu,
  ur,
  kn,
  od,
  ml,
}

export const SUPPORTED_LANGUAGES: Array<{ code: LanguageCode; name: string; native: string }> = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'ur', name: 'Urdu', native: 'اردو' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'od', name: 'Odia', native: 'ଓଡ଼ିଆ' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
]

export { en } from './locales/en'
export type { TranslationSchema } from './locales/en'
export { I18nProvider, I18nContext, useI18n } from './provider'
export type { I18nValue } from './provider'
