import type { TranslationSchema } from './en'
import { deepMerge } from '../deepMerge'
import { en } from './en'

export const gu: { translation: TranslationSchema } = {
  translation: deepMerge(en.translation, {
    app: { name: 'વેગન' },
    auth: {
      otpTitle: 'તમારો મોબાઇલ નંબર ચકાસો',
      otpSubtitle: 'અમે SMS દ્વારા 4-અંકનો OTP મોકલ્યો છે',
      resend: 'OTP ફરી મોકલો',
      submit: 'ચકાસો',
      enterMobile: 'મોબાઇલ નંબર દાખલ કરો',
    },
    common: {
      continue: 'ચાલુ રાખો',
      cancel: 'રદ કરો',
      save: 'સાચવો',
      submit: 'સબમિટ કરો',
      back: 'પાછળ',
      loading: 'લોડ થાય છે…',
      retry: 'ફરી પ્રયાસ કરો',
      search: 'શોધો',
      filter: 'ફિલ્ટર',
      confirm: 'પુષ્ટિ કરો',
      logout: 'લોગ આઉટ',
      offline: 'તમે ઑફલાઇન છો',
    },
    role: { supplier: 'સપ્લાયર', transporter: 'ટ્રાન્સપોર્ટર', admin: 'એડમિન' },
    nav: { home: 'હોમ', loads: 'લોડ', trips: 'ટ્રિપ્સ', wallet: 'વૉલેટ', profile: 'પ્રોફાઇલ' },
    load: {
      title: 'લોડ',
      tabs: { all: 'બધા', open: 'ખુલ્લા', container: 'કન્ટેનર', trailer: 'ટ્રેલર' },
      pickup: 'પિકઅપ',
      drop: 'ડ્રોપ',
      halt: 'હોલ્ટ પોઇન્ટ',
      date: 'તારીખ',
      time: 'સમય',
      weight: 'વજન (ટન)',
      distance: 'અંતર',
      material: 'સામગ્રી',
      noOfTrucks: 'ટ્રકની સંખ્યા',
      fare: 'ભાડું',
      postNew: 'લોડ પોસ્ટ કરો',
      accept: 'સ્વીકારો',
      quote: 'તમારો દર જણાવો',
      status: { posted: 'પોસ્ટ કરેલ', interested: 'રુચિ બતાવી', accepted: 'સ્વીકૃત', in_transit: 'પ્રવાસમાં', delivered: 'ડિલિવર', cancelled: 'રદ' },
    },
    trip: { title: 'ટ્રિપ્સ', start: 'ટ્રિપ શરૂ કરો', delivered: 'ડિલિવરી દો', pod: 'POD અપલોડ કરો' },
    kyc: { title: 'ચકાસણી', basic: 'બેઝિક', kycLite: 'KYC લાઇટ', kycFull: 'KYC ફુલ', upload: 'દસ્તાવેજ અપલોડ કરો', pending: 'સમીક્ષામાં', approved: 'ચકાસાયેલ', rejected: 'નામંજૂર' },
    wallet: { title: 'વૉલેટ', balance: 'બેલેન્સ', payout: 'ચુકવણી સ્થિતિ', passbook: 'પાસબુક' },
    truck: { title: 'ટ્રક', add: 'ટ્રક ઉમેરો', driver: 'ડ્રાઇવર', active: 'સક્રિય', inactive: 'નિષ્ક્રિય' },
  }),
}
