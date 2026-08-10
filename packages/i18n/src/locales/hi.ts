import type { TranslationSchema } from './en'
import { deepMerge } from '../deepMerge'
import { en } from './en'

export const hi: { translation: TranslationSchema } = {
  translation: deepMerge(en.translation, {
    app: { name: 'वेगन' },
    auth: {
      otpTitle: 'अपना मोबाइल नंबर सत्यापित करें',
      otpSubtitle: 'हमने SMS से 4 अंकों का OTP भेजा है',
      resend: 'OTP दोबारा भेजें',
      submit: 'सत्यापित करें',
      enterMobile: 'मोबाइल नंबर दर्ज करें',
    },
    common: {
      continue: 'जारी रखें',
      cancel: 'रद्द करें',
      save: 'सहेजें',
      submit: 'जमा करें',
      back: 'वापस',
      loading: 'लोड हो रहा है…',
      retry: 'पुनः प्रयास करें',
      search: 'खोजें',
      filter: 'फ़िल्टर',
      confirm: 'पुष्टि करें',
      logout: 'लॉग आउट',
      offline: 'आप ऑफ़लाइन हैं',
    },
    role: { supplier: 'आपूर्तिकर्ता', transporter: 'ट्रांसपोर्टर', admin: 'एडमिन' },
    nav: { home: 'होम', loads: 'लोड', trips: 'ट्रिप्स', wallet: 'वॉलेट', profile: 'प्रोफ़ाइल' },
    load: {
      title: 'लोड',
      tabs: { all: 'सभी', open: 'खुला', container: 'कंटेनर', trailer: 'ट्रेलर' },
      pickup: 'पिकअप',
      drop: 'ड्रॉप',
      halt: 'हॉल्ट पॉइंट',
      date: 'तारीख',
      time: 'समय',
      weight: 'वजन (टन)',
      distance: 'दूरी',
      material: 'सामग्री',
      noOfTrucks: 'ट्रकों की संख्या',
      fare: 'किराया',
      postNew: 'लोड डालें',
      accept: 'स्वीकार करें',
      quote: 'अपनी दर बताएं',
      status: { posted: 'पोस्ट किया', interested: 'रुचि दिखाई', accepted: 'स्वीकृत', in_transit: 'पारगमन में', delivered: 'डिलीवर', cancelled: 'रद्द' },
    },
    trip: { title: 'ट्रिप्स', start: 'ट्रिप शुरू करें', delivered: 'डिलीवरी दें', pod: 'POD अपलोड करें' },
    kyc: { title: 'सत्यापन', basic: 'बेसिक', kycLite: 'KYC लाइट', kycFull: 'KYC फुल', upload: 'दस्तावेज़ अपलोड करें', pending: 'समीक्षा में', approved: 'सत्यापित', rejected: 'अस्वीकृत' },
    wallet: { title: 'वॉलेट', balance: 'बैलेंस', payout: 'भुगतान स्थिति', passbook: 'पासबुक' },
    truck: { title: 'ट्रक', add: 'ट्रक जोड़ें', driver: 'ड्राइवर', active: 'सक्रिय', inactive: 'निष्क्रिय' },
  }),
}
