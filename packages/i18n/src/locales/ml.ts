import type { TranslationSchema } from './en'
import { deepMerge } from '../deepMerge'
import { en } from './en'

export const ml: { translation: TranslationSchema } = {
  translation: deepMerge(en.translation, {
    app: { name: 'വാഗൺ' },
    auth: {
      otpTitle: 'നിങ്ങളുടെ മൊബൈൽ നമ്പർ പരിശോധിക്കുക',
      otpSubtitle: 'ഞങ്ങൾ SMS വഴി 4 അക്ക OTP അയച്ചു',
      resend: 'OTP വീണ്ടും അയയ്ക്കുക',
      submit: 'പരിശോധിക്കുക',
      enterMobile: 'മൊബൈൽ നമ്പർ നൽകുക',
    },
    common: {
      continue: 'തുടരുക',
      cancel: 'റദ്ദാക്കുക',
      save: 'സംരക്ഷിക്കുക',
      submit: 'സമർപ്പിക്കുക',
      back: 'പിന്നിലേക്ക്',
      loading: 'ലോഡുചെയ്യുന്നു…',
      retry: 'വീണ്ടും ശ്രമിക്കുക',
      search: 'തിരയുക',
      filter: 'ഫിൽട്ടർ',
      confirm: 'സ്ഥിരീകരിക്കുക',
      logout: 'ലോഗ്ഔട്ട്',
      offline: 'നിങ്ങൾ ഓഫ്‌ലൈനിലാണ്',
    },
    role: { supplier: 'വിതരണക്കാരൻ', transporter: 'ഗതാഗതക്കാരൻ', admin: 'അഡ്മിൻ' },
    nav: { home: 'ഹോം', loads: 'ലോഡുകൾ', trips: 'ട്രിപ്പുകൾ', wallet: 'വാലറ്റ്', profile: 'പ്രൊഫൈൽ' },
    load: {
      title: 'ലോഡുകൾ',
      tabs: { all: 'എല്ലാം', open: 'തുറന്നത്', container: 'കണ്ടെയ്നർ', trailer: 'ട്രെയിലർ' },
      pickup: 'പിക്കപ്പ്',
      drop: 'ഡ്രോപ്പ്',
      halt: 'ഹാൾട്ട് പോയിന്റ്',
      date: 'തീയതി',
      time: 'സമയം',
      weight: 'ഭാരം (ടൺ)',
      distance: 'ദൂരം',
      material: 'വസ്തു',
      noOfTrucks: 'ട്രക്കുകളുടെ എണ്ണം',
      fare: 'നിരക്ക്',
      postNew: 'ലോഡ് പോസ്റ്റ് ചെയ്യുക',
      accept: 'സ്വീകരിക്കുക',
      quote: 'നിങ്ങളുടെ നിരക്ക് പറയുക',
      status: { posted: 'പോസ്റ്റ് ചെയ്തു', interested: 'താൽപ്പര്യം', accepted: 'സ്വീകരിച്ചു', in_transit: 'യാത്രയിൽ', delivered: 'ഡെലിവർ', cancelled: 'റദ്ദാക്കി' },
    },
    trip: { title: 'ട്രിപ്പുകൾ', start: 'ട്രിപ്പ് ആരംഭിക്കുക', delivered: 'ഡെലിവർ ചെയ്തതായി അടയാളപ്പെടുത്തുക', pod: 'POD അപ്‌ലോഡ് ചെയ്യുക' },
    kyc: { title: 'പരിശോധന', basic: 'അടിസ്ഥാനം', kycLite: 'KYC ലൈറ്റ്', kycFull: 'KYC ഫുൾ', upload: 'രേഖ അപ്‌ലോഡ് ചെയ്യുക', pending: 'അവലോകനത്തിൽ', approved: 'പരിശോധിച്ചത്', rejected: 'നിരസിച്ചു' },
    wallet: { title: 'വാലറ്റ്', balance: 'ബാലൻസ്', payout: 'പേഔട്ട് നില', passbook: 'പാസ്ബുക്ക്' },
    truck: { title: 'ട്രക്കുകൾ', add: 'ട്രക്ക് ചേർക്കുക', driver: 'ഡ്രൈവർ', active: 'സജീവം', inactive: 'നിഷ്ക്രിയം' },
  }),
}
