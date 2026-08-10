import type { TranslationSchema } from './en'
import { deepMerge } from '../deepMerge'
import { en } from './en'

export const ur: { translation: TranslationSchema } = {
  translation: deepMerge(en.translation, {
    app: { name: 'ویگن' },
    auth: {
      otpTitle: 'اپنا موبائل نمبر تصدیق کریں',
      otpSubtitle: 'ہم نے SMS کے ذریعے 4 ہندسوں کا OTP بھیجا ہے',
      resend: 'OTP دوبارہ بھیجیں',
      submit: 'تصدیق کریں',
      enterMobile: 'موبائل نمبر درج کریں',
    },
    common: {
      continue: 'جاری رکھیں',
      cancel: 'منسوخ',
      save: 'محفوظ کریں',
      submit: 'جمع کریں',
      back: 'واپس',
      loading: 'لوڈ ہو رہا ہے…',
      retry: 'دوبارہ کوشش کریں',
      search: 'تلاش کریں',
      filter: 'فلٹر',
      confirm: 'تصدیق کریں',
      logout: 'لاگ آؤٹ',
      offline: 'آپ آف لائن ہیں',
    },
    role: { supplier: 'سپلائر', transporter: 'ٹرانسپورٹر', admin: 'ایڈمن' },
    nav: { home: 'ہوم', loads: 'لوڈ', trips: 'ٹرپس', wallet: 'والٹ', profile: 'پروفائل' },
    load: {
      title: 'لوڈ',
      tabs: { all: 'تمام', open: 'کھلا', container: 'کنٹینر', trailer: 'ٹریلر' },
      pickup: 'پک اپ',
      drop: 'ڈراپ',
      halt: 'ہالٹ پوائنٹ',
      date: 'تاریخ',
      time: 'وقت',
      weight: 'وزن (ٹن)',
      distance: 'فاصلہ',
      material: 'مواد',
      noOfTrucks: 'ٹرکوں کی تعداد',
      fare: 'کرایہ',
      postNew: 'لوڈ پوسٹ کریں',
      accept: 'قبول کریں',
      quote: 'اپنا نرخ بتائیں',
      status: { posted: 'پوسٹ کیا', interested: 'دلچسپی', accepted: 'قبول', in_transit: 'منتقلی میں', delivered: 'ڈیلیور', cancelled: 'منسوخ' },
    },
    trip: { title: 'ٹرپس', start: 'ٹرپ شروع کریں', delivered: 'ڈیلیور کریں', pod: 'POD اپ لوڈ کریں' },
    kyc: { title: 'تصدیق', basic: 'بنیادی', kycLite: 'KYC لائٹ', kycFull: 'KYC فل', upload: 'دستاویز اپ لوڈ کریں', pending: 'زیرِ جائزہ', approved: 'تصدیق شدہ', rejected: 'مسترد' },
    wallet: { title: 'والٹ', balance: 'بیلنس', payout: 'ادائیگی کی حالت', passbook: 'پاس بک' },
    truck: { title: 'ٹرک', add: 'ٹرک شامل کریں', driver: 'ڈرائیور', active: 'فعال', inactive: 'غیر فعال' },
  }),
}
