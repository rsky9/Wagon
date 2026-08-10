import type { TranslationSchema } from './en'
import { deepMerge } from '../deepMerge'
import { en } from './en'

export const kn: { translation: TranslationSchema } = {
  translation: deepMerge(en.translation, {
    app: { name: 'ವ್ಯಾಗನ್' },
    auth: {
      otpTitle: 'ನಿಮ್ಮ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯನ್ನು ಪರಿಶೀಲಿಸಿ',
      otpSubtitle: 'ನಾವು SMS ಮೂಲಕ 4-ಅಂಕಿಯ OTP ಕಳುಹಿಸಿದ್ದೇವೆ',
      resend: 'OTP ಮರು ಕಳುಹಿಸಿ',
      submit: 'ಪರಿಶೀಲಿಸಿ',
      enterMobile: 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ',
    },
    common: {
      continue: 'ಮುಂದುವರಿಸಿ',
      cancel: 'ರದ್ದು',
      save: 'ಉಳಿಸಿ',
      submit: 'ಸಲ್ಲಿಸಿ',
      back: 'ಹಿಂದೆ',
      loading: 'ಲೋಡ್ ಆಗುತ್ತಿದೆ…',
      retry: 'ಮರು ಪ್ರಯತ್ನ',
      search: 'ಹುಡುಕಿ',
      filter: 'ಫಿಲ್ಟರ್',
      confirm: 'ದೃಢೀಕರಿಸಿ',
      logout: 'ಲಾಗ್ ಔಟ್',
      offline: 'ನೀವು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದ್ದೀರಿ',
    },
    role: { supplier: 'ಸರಬರಾಜುದಾರ', transporter: 'ಸಾರಿಗೆದಾರ', admin: 'ಅಡ್ಮಿನ್' },
    nav: { home: 'ಮುಖಪುಟ', loads: 'ಲೋಡ್‌ಗಳು', trips: 'ಟ್ರಿಪ್‌ಗಳು', wallet: 'ವ್ಯಾಲೆಟ್', profile: 'ಪ್ರೊಫೈಲ್' },
    load: {
      title: 'ಲೋಡ್‌ಗಳು',
      tabs: { all: 'ಎಲ್ಲಾ', open: 'ತೆರೆದ', container: 'ಕಂಟೈನರ್', trailer: 'ಟ್ರೇಲರ್' },
      pickup: 'ಪಿಕಪ್',
      drop: 'ಡ್ರಾಪ್',
      halt: 'ನಿಲುಗಡೆ ಬಿಂದು',
      date: 'ದಿನಾಂಕ',
      time: 'ಸಮಯ',
      weight: 'ತೂಕ (ಟನ್)',
      distance: 'ದೂರ',
      material: 'ವಸ್ತು',
      noOfTrucks: 'ಟ್ರಕ್‌ಗಳ ಸಂಖ್ಯೆ',
      fare: 'ಬಾಡಿಗೆ',
      postNew: 'ಲೋಡ್ ಪೋಸ್ಟ್ ಮಾಡಿ',
      accept: 'ಸ್ವೀಕರಿಸಿ',
      quote: 'ನಿಮ್ಮ ದರ ತಿಳಿಸಿ',
      status: { posted: 'ಪೋಸ್ಟ್ ಮಾಡಲಾಗಿದೆ', interested: 'ಆಸಕ್ತಿ ತೋರಿಸಿದೆ', accepted: 'ಸ್ವೀಕರಿಸಲಾಗಿದೆ', in_transit: 'ಪ್ರಯಾಣದಲ್ಲಿ', delivered: 'ವಿತರಿಸಲಾಗಿದೆ', cancelled: 'ರದ್ದು' },
    },
    trip: { title: 'ಟ್ರಿಪ್‌ಗಳು', start: 'ಟ್ರಿಪ್ ಪ್ರಾರಂಭಿಸಿ', delivered: 'ವಿತರಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಿ', pod: 'POD ಅಪ್‌ಲೋಡ್' },
    kyc: { title: 'ಪರಿಶೀಲನೆ', basic: 'ಮೂಲ', kycLite: 'KYC ಲೈಟ್', kycFull: 'KYC ಫುಲ್', upload: 'ದಾಖಲೆ ಅಪ್‌ಲೋಡ್', pending: 'ಪರಿಶೀಲನೆಯಲ್ಲಿ', approved: 'ಪರಿಶೀಲಿಸಲಾಗಿದೆ', rejected: 'ತಿರಸ್ಕರಿಸಲಾಗಿದೆ' },
    wallet: { title: 'ವ್ಯಾಲೆಟ್', balance: 'ಬ್ಯಾಲೆನ್ಸ್', payout: 'ಪೇಔಟ್ ಸ್ಥಿತಿ', passbook: 'ಪಾಸ್‌ಬುಕ್' },
    truck: { title: 'ಟ್ರಕ್‌ಗಳು', add: 'ಟ್ರಕ್ ಸೇರಿಸಿ', driver: 'ಚಾಲಕ', active: 'ಸಕ್ರಿಯ', inactive: 'ನಿಷ್ಕ್ರಿಯ' },
  }),
}
