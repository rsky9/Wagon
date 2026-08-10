import type { TranslationSchema } from './en'
import { deepMerge } from '../deepMerge'
import { en } from './en'

export const bn: { translation: TranslationSchema } = {
  translation: deepMerge(en.translation, {
    app: { name: 'ওয়াগন' },
    auth: {
      otpTitle: 'আপনার মোবাইল নম্বর যাচাই করুন',
      otpSubtitle: 'আমরা SMS-এ ৪ অঙ্কের OTP পাঠিয়েছি',
      resend: 'OTP আবার পাঠান',
      submit: 'যাচাই করুন',
      enterMobile: 'মোবাইল নম্বর লিখুন',
    },
    common: {
      continue: 'চালিয়ে যান',
      cancel: 'বাতিল',
      save: 'সংরক্ষণ',
      submit: 'জমা দিন',
      back: 'ফিরে যান',
      loading: 'লোড হচ্ছে…',
      retry: 'আবার চেষ্টা করুন',
      search: 'অনুসন্ধান',
      filter: 'ফিল্টার',
      confirm: 'নিশ্চিত করুন',
      logout: 'লগ আউট',
      offline: 'আপনি অফলাইনে আছেন',
    },
    role: { supplier: 'সরবরাহকারী', transporter: 'পরিবহনকারী', admin: 'অ্যাডমিন' },
    nav: { home: 'হোম', loads: 'লোড', trips: 'ট্রিপ', wallet: 'ওয়ালেট', profile: 'প্রোফাইল' },
    load: {
      title: 'লোড',
      tabs: { all: 'সব', open: 'খোলা', container: 'কন্টেইনার', trailer: 'ট্রেলার' },
      pickup: 'পিকআপ',
      drop: 'ড্রপ',
      halt: 'হল্ট পয়েন্ট',
      date: 'তারিখ',
      time: 'সময়',
      weight: 'ওজন (টন)',
      distance: 'দূরত্ব',
      material: 'উপাদান',
      noOfTrucks: 'ট্রাকের সংখ্যা',
      fare: 'ভাড়া',
      postNew: 'লোড পোস্ট করুন',
      accept: 'গ্রহণ করুন',
      quote: 'নিজের হার বলুন',
      status: { posted: 'পোস্ট করা', interested: 'আগ্রহী', accepted: 'গৃহীত', in_transit: 'পথে', delivered: 'ডেলিভারি', cancelled: 'বাতিল' },
    },
    trip: { title: 'ট্রিপ', start: 'ট্রিপ শুরু করুন', delivered: 'ডেলিভারি চিহ্নিত করুন', pod: 'POD আপলোড করুন' },
    kyc: { title: 'যাচাইকরণ', basic: 'বেসিক', kycLite: 'KYC লাইট', kycFull: 'KYC ফুল', upload: 'নথি আপলোড করুন', pending: 'পর্যালোচনায়', approved: 'যাচাইকৃত', rejected: 'প্রত্যাখ্যাত' },
    wallet: { title: 'ওয়ালেট', balance: 'ব্যালেন্স', payout: 'পরিশোধ অবস্থা', passbook: 'পাসবুক' },
    truck: { title: 'ট্রাক', add: 'ট্রাক যোগ করুন', driver: 'চালক', active: 'সক্রিয়', inactive: 'নিষ্ক্রিয়' },
  }),
}
