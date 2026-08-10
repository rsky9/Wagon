import type { TranslationSchema } from './en'
import { deepMerge } from '../deepMerge'
import { en } from './en'

export const mr: { translation: TranslationSchema } = {
  translation: deepMerge(en.translation, {
    app: { name: 'वॅगन' },
    auth: {
      otpTitle: 'तुमचा मोबाईल क्रमांक सत्यापित करा',
      otpSubtitle: 'आम्ही SMS वर 4-अंकी OTP पाठवला आहे',
      resend: 'OTP पुन्हा पाठवा',
      submit: 'सत्यापित करा',
      enterMobile: 'मोबाईल क्रमांक टाका',
    },
    common: {
      continue: 'पुढे जा',
      cancel: 'रद्द करा',
      save: 'जतन करा',
      submit: 'सबमिट करा',
      back: 'मागे',
      loading: 'लोड होत आहे…',
      retry: 'पुन्हा प्रयत्न करा',
      search: 'शोधा',
      filter: 'फिल्टर',
      confirm: 'पुष्टी करा',
      logout: 'लॉग आउट',
      offline: 'तुम्ही ऑफलाइन आहात',
    },
    role: { supplier: 'पुरवठादार', transporter: 'वाहतूकदार', admin: 'अॅडमिन' },
    nav: { home: 'होम', loads: 'लोड', trips: 'ट्रिप्स', wallet: 'वॉलेट', profile: 'प्रोफाइल' },
    load: {
      title: 'लोड',
      tabs: { all: 'सर्व', open: 'खुले', container: 'कंटेनर', trailer: 'ट्रेलर' },
      pickup: 'पिकअप',
      drop: 'ड्रॉप',
      halt: 'हॉल्ट पॉइंट',
      date: 'तारीख',
      time: 'वेळ',
      weight: 'वजन (टन)',
      distance: 'अंतर',
      material: 'साहित्य',
      noOfTrucks: 'ट्रकांची संख्या',
      fare: 'भाडे',
      postNew: 'लोड पोस्ट करा',
      accept: 'स्वीकारा',
      quote: 'तुमचा दर सांगा',
      status: { posted: 'पोस्ट केले', interested: 'स्वारस्य दाखवले', accepted: 'स्वीकारले', in_transit: 'प्रवासात', delivered: 'वितरित', cancelled: 'रद्द' },
    },
    trip: { title: 'ट्रिप्स', start: 'ट्रिप सुरू करा', delivered: 'वितरित करा', pod: 'POD अपलोड करा' },
    kyc: { title: 'सत्यापन', basic: 'मूलभूत', kycLite: 'KYC लाइट', kycFull: 'KYC फुल', upload: 'दस्तऐवज अपलोड करा', pending: 'पुनरावलोकनात', approved: 'सत्यापित', rejected: 'नाकारले' },
    wallet: { title: 'वॉलेट', balance: 'शिल्लक', payout: 'पेआउट स्थिती', passbook: 'पासबुक' },
    truck: { title: 'ट्रक', add: 'ट्रक जोडा', driver: 'ड्रायव्हर', active: 'सक्रिय', inactive: 'निष्क्रिय' },
  }),
}
