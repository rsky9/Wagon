import type { TranslationSchema } from './en'
import { deepMerge } from '../deepMerge'
import { en } from './en'

export const od: { translation: TranslationSchema } = {
  translation: deepMerge(en.translation, {
    app: { name: 'ୱାଗନ୍' },
    auth: {
      otpTitle: 'ଆପଣଙ୍କ ମୋବାଇଲ ନମ୍ବର ଯାଞ୍ଚ କରନ୍ତୁ',
      otpSubtitle: 'ଆମେ SMS ମାଧ୍ୟମରେ 4-ଅଙ୍କର OTP ପଠାଇଛୁ',
      resend: 'OTP ପୁନଃ ପଠାନ୍ତୁ',
      submit: 'ଯାଞ୍ଚ କରନ୍ତୁ',
      enterMobile: 'ମୋବାଇଲ ନମ୍ବର ପ୍ରବେଶ କରନ୍ତୁ',
    },
    common: {
      continue: 'ଜାରି ରଖନ୍ତୁ',
      cancel: 'ବାତିଲ୍',
      save: 'ସଞ୍ଚୟ କରନ୍ତୁ',
      submit: 'ଦାଖଲ କରନ୍ତୁ',
      back: 'ପଛକୁ',
      loading: 'ଲୋଡ୍ ହେଉଛି…',
      retry: 'ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ',
      search: 'ଖୋଜନ୍ତୁ',
      filter: 'ଫିଲ୍ଟର୍',
      confirm: 'ନିଶ୍ଚିତ କରନ୍ତୁ',
      logout: 'ଲଗ୍ ଆଉଟ୍',
      offline: 'ଆପଣ ଅଫଲାଇନରେ ଅଛନ୍ତି',
    },
    role: { supplier: 'ଯୋଗାଣକାରୀ', transporter: 'ପରିବହନକାରୀ', admin: 'ଆଡମିନ୍' },
    nav: { home: 'ହୋମ୍', loads: 'ଲୋଡ୍', trips: 'ଟ୍ରିପ୍', wallet: 'ୱାଲେଟ୍', profile: 'ପ୍ରୋଫାଇଲ୍' },
    load: {
      title: 'ଲୋଡ୍',
      tabs: { all: 'ସବୁ', open: 'ଖୋଲା', container: 'କଣ୍ଟେନର୍', trailer: 'ଟ୍ରେଲର୍' },
      pickup: 'ପିକଅପ୍',
      drop: 'ଡ୍ରପ୍',
      halt: 'ହଲ୍ଟ ପଏଣ୍ଟ',
      date: 'ତାରିଖ',
      time: 'ସମୟ',
      weight: 'ଓଜନ (ଟନ୍)',
      distance: 'ଦୂରତା',
      material: 'ସାମଗ୍ରୀ',
      noOfTrucks: 'ଟ୍ରକ୍ ସଂଖ୍ୟା',
      fare: 'ଭଡ଼ା',
      postNew: 'ଲୋଡ୍ ପୋଷ୍ଟ କରନ୍ତୁ',
      accept: 'ଗ୍ରହଣ କରନ୍ତୁ',
      quote: 'ନିଜ ହାର କୁହନ୍ତୁ',
      status: { posted: 'ପୋଷ୍ଟ ହେଲା', interested: 'ଆଗ୍ରହୀ', accepted: 'ଗୃହୀତ', in_transit: 'ଯାତ୍ରାରେ', delivered: 'ବିତରଣ', cancelled: 'ବାତିଲ୍' },
    },
    trip: { title: 'ଟ୍ରିପ୍', start: 'ଟ୍ରିପ୍ ଆରମ୍ଭ କରନ୍ତୁ', delivered: 'ବିତରଣ ଚିହ୍ନିତ କରନ୍ତୁ', pod: 'POD ଅପଲୋଡ୍' },
    kyc: { title: 'ଯାଞ୍ଚ', basic: 'ମୌଳିକ', kycLite: 'KYC ଲାଇଟ୍', kycFull: 'KYC ଫୁଲ୍', upload: 'ଦଲିଲ ଅପଲୋଡ୍', pending: 'ସମୀକ୍ଷାରେ', approved: 'ଯାଞ୍ଚିତ', rejected: 'ପ୍ରତ୍ୟାଖ୍ୟାନ' },
    wallet: { title: 'ୱାଲେଟ୍', balance: 'ବାଲାନ୍ସ', payout: 'ପେଆଉଟ୍ ସ୍ଥିତି', passbook: 'ପାସବୁକ୍' },
    truck: { title: 'ଟ୍ରକ୍', add: 'ଟ୍ରକ୍ ଯୋଡନ୍ତୁ', driver: 'ଡ୍ରାଇଭର୍', active: 'ସକ୍ରିୟ', inactive: 'ନିଷ୍କ୍ରିୟ' },
  }),
}
