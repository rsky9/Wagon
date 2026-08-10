import type { TranslationSchema } from './en'
import { deepMerge } from '../deepMerge'
import { en } from './en'

export const te: { translation: TranslationSchema } = {
  translation: deepMerge(en.translation, {
    app: { name: 'వేగన్' },
    auth: {
      otpTitle: 'మీ మొబైల్ నంబర్ ధృవీకరించండి',
      otpSubtitle: 'మేము SMS ద్వారా 4 అంకెల OTP పంపాము',
      resend: 'OTP మళ్లీ పంపండి',
      submit: 'ధృవీకరించండి',
      enterMobile: 'మొబైల్ నంబర్ నమోదు చేయండి',
    },
    common: {
      continue: 'కొనసాగించండి',
      cancel: 'రద్దు',
      save: 'సేవ్',
      submit: 'సమర్పించండి',
      back: 'వెనుకకు',
      loading: 'లోడ్ అవుతోంది…',
      retry: 'మళ్లీ ప్రయత్నించండి',
      search: 'వెతకండి',
      filter: 'ఫిల్టర్',
      confirm: 'నిర్ధారించండి',
      logout: 'లాగ్ అవుట్',
      offline: 'మీరు ఆఫ్లైన్లో ఉన్నారు',
    },
    role: { supplier: 'సరఫరాదారు', transporter: 'ట్రాన్స్‌పోర్టర్', admin: 'అడ్మిన్' },
    nav: { home: 'హోమ్', loads: 'లోడ్లు', trips: 'ట్రిప్పులు', wallet: 'వాలెట్', profile: 'ప్రొఫైల్' },
    load: {
      title: 'లోడ్లు',
      tabs: { all: 'అన్నీ', open: 'ఓపెన్', container: 'కంటైనర్', trailer: 'ట్రైలర్' },
      pickup: 'పికప్',
      drop: 'డ్రాప్',
      halt: 'హాల్ట్ పాయింట్',
      date: 'తేదీ',
      time: 'సమయం',
      weight: 'బరువు (టన్ను)',
      distance: 'దూరం',
      material: 'మెటీరియల్',
      noOfTrucks: 'ట్రక్కుల సంఖ్య',
      fare: 'ఛార్జీ',
      postNew: 'లోడ్ పోస్ట్ చేయండి',
      accept: 'అంగీకరించండి',
      quote: 'మీ రేటు చెప్పండి',
      status: { posted: 'పోస్ట్ చేసారు', interested: 'ఆసక్తి చూపారు', accepted: 'అంగీకరించారు', in_transit: 'రవాణాలో', delivered: 'డెలివరీ', cancelled: 'రద్దు' },
    },
    trip: { title: 'ట్రిప్పులు', start: 'ట్రిప్ ప్రారంభించండి', delivered: 'డెలివరీగా గుర్తించండి', pod: 'POD అప్‌లోడ్' },
    kyc: { title: 'ధృవీకరణ', basic: 'బేసిక్', kycLite: 'KYC లైట్', kycFull: 'KYC ఫుల్', upload: 'డాక్యుమెంట్ అప్‌లోడ్', pending: 'సమీక్షలో', approved: 'ధృవీకరించబడింది', rejected: 'తిరస్కరించబడింది' },
    wallet: { title: 'వాలెట్', balance: 'బ్యాలెన్స్', payout: 'పేఅవుట్ స్థితి', passbook: 'పాస్‌బుక్' },
    truck: { title: 'ట్రక్కులు', add: 'ట్రక్ జోడించండి', driver: 'డ్రైవర్', active: 'యాక్టివ్', inactive: 'నిష్క్రియం' },
  }),
}
