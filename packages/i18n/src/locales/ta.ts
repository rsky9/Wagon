import type { TranslationSchema } from './en'
import { deepMerge } from '../deepMerge'
import { en } from './en'

export const ta: { translation: TranslationSchema } = {
  translation: deepMerge(en.translation, {
    app: { name: 'வேகன்' },
    auth: {
      otpTitle: 'உங்கள் மொபைல் எண்ணை சரிபார்க்கவும்',
      otpSubtitle: 'SMS மூலம் 4 இலக்க OTP அனுப்பினோம்',
      resend: 'OTP மீண்டும் அனுப்பு',
      submit: 'சரிபார்',
      enterMobile: 'மொபைல் எண்ணை உள்ளிடவும்',
    },
    common: {
      continue: 'தொடரவும்',
      cancel: 'ரத்து',
      save: 'சேமி',
      submit: 'சமர்ப்பி',
      back: 'பின்',
      loading: 'ஏற்றுகிறது…',
      retry: 'மீண்டும் முயற்சி',
      search: 'தேடு',
      filter: 'வடிகட்டு',
      confirm: 'உறுதி',
      logout: 'வெளியேறு',
      offline: 'நீங்கள் ஆஃப்லைனில் உள்ளீர்கள்',
    },
    role: { supplier: 'வழங்குநர்', transporter: 'போக்குவரத்தாளர்', admin: 'நிர்வாகி' },
    nav: { home: 'முகப்பு', loads: 'சுமைகள்', trips: 'பயணங்கள்', wallet: 'பணப்பை', profile: 'சுயவிவரம்' },
    load: {
      title: 'சுமைகள்',
      tabs: { all: 'அனைத்தும்', open: 'திறந்த', container: 'கொள்கலன்', trailer: 'டிரெய்லர்' },
      pickup: 'பிக்அப்',
      drop: 'டிராப்',
      halt: 'நிறுத்தம்',
      date: 'தேதி',
      time: 'நேரம்',
      weight: 'எடை (டன்)',
      distance: 'தூரம்',
      material: 'பொருள்',
      noOfTrucks: 'டிரக்குகளின் எண்ணிக்கை',
      fare: 'கட்டணம்',
      postNew: 'சுமை பதிவு',
      accept: 'ஏற்கவும்',
      quote: 'உங்கள் கட்டணத்தை கூறுங்கள்',
      status: { posted: 'பதிவு', interested: 'ஆர்வம்', accepted: 'ஏற்கப்பட்டது', in_transit: 'பயணத்தில்', delivered: 'வழங்கப்பட்டது', cancelled: 'ரத்து' },
    },
    trip: { title: 'பயணங்கள்', start: 'பயணம் தொடங்கு', delivered: 'வழங்கப்பட்டதாக குறி', pod: 'POD பதிவேற்று' },
    kyc: { title: 'சரிபார்ப்பு', basic: 'அடிப்படை', kycLite: 'KYC லைட்', kycFull: 'KYC ஃபுல்', upload: 'ஆவணம் பதிவேற்று', pending: 'மதிப்பாய்வில்', approved: 'சரிபார்க்கப்பட்டது', rejected: 'நிராகரிக்கப்பட்டது' },
    wallet: { title: 'பணப்பை', balance: 'இருப்பு', payout: 'கட்டண நிலை', passbook: 'பாஸ்புக்' },
    truck: { title: 'டிரக்குகள்', add: 'டிரக் சேர்', driver: 'ஓட்டுநர்', active: 'செயலில்', inactive: 'செயலற்று' },
  }),
}
