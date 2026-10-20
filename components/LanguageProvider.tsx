'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Globe2 } from 'lucide-react'

export type Language = 'en' | 'ta' | 'ml' | 'te' | 'hi'

type LanguageContextValue = {
  language: Language
  setLanguage: (language: Language) => void
  t: (text: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)
const LANGUAGE_KEY = 'ajr-language'

const LANGUAGE_NAMES: Array<{ value: Language; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'ta', label: 'தமிழ்' },
  { value: 'ml', label: 'മലയാളം' },
  { value: 'te', label: 'తెలుగు' },
  { value: 'hi', label: 'हिन्दी' },
]

const translations: Record<Exclude<Language, 'en'>, Record<string, string>> = {
  ta: {
    Language: 'மொழி', Home: 'முகப்பு', 'About us': 'எங்களைப் பற்றி', Shop: 'கடை', Contact: 'தொடர்பு', Login: 'உள்நுழை', Signup: 'பதிவு செய்க', 'My Orders': 'என் ஆர்டர்கள்', Logout: 'வெளியேறு', Wishlist: 'விருப்பப்பட்டியல்', Cart: 'கூடை', 'Return home': 'முகப்புக்குத் திரும்பு',
    Overview: 'கண்ணோட்டம்', Orders: 'ஆர்டர்கள்', Products: 'பொருட்கள்', Inventory: 'சரக்கு', Messages: 'செய்திகள்', Settings: 'அமைப்புகள்', Administration: 'நிர்வாகம்', 'Sign out': 'வெளியேறு', Refresh: 'புதுப்பி', Search: 'தேடு', 'Add product': 'பொருளைச் சேர்', Edit: 'திருத்து', Delete: 'நீக்கு', Save: 'சேமி', Cancel: 'ரத்து செய்', All: 'அனைத்தும்', Visible: 'காணக்கூடியவை', Hidden: 'மறைக்கப்பட்டவை', 'Visible in shop': 'கடையில் காணப்படும்', 'Hidden from shop': 'கடையில் மறைக்கப்பட்டது', 'Hide from shop': 'கடையில் மறை', 'Show in shop': 'கடையில் காட்டு',
    'First name': 'முதல் பெயர்', 'Last name': 'கடைசி பெயர்', 'Email address': 'மின்னஞ்சல் முகவரி', Password: 'கடவுச்சொல்', 'Phone number': 'தொலைபேசி எண்', 'Remember me': 'என்னை நினைவில் கொள்', 'Forgot password?': 'கடவுச்சொல் மறந்துவிட்டதா?', 'Welcome back': 'மீண்டும் வரவேற்கிறோம்', 'Create your account': 'உங்கள் கணக்கை உருவாக்கவும்', 'Create account': 'கணக்கை உருவாக்கு', 'Account access': 'கணக்கு அணுகல்', 'Login to my account': 'என் கணக்கில் உள்நுழை', 'Create free account': 'இலவச கணக்கை உருவாக்கு', 'Already have an account?': 'ஏற்கனவே கணக்கு உள்ளதா?', 'Login here': 'இங்கே உள்நுழைக', 'I agree to the terms': 'விதிமுறைகளை ஏற்கிறேன்', 'Checking your session…': 'உங்கள் அமர்வு சரிபார்க்கப்படுகிறது…', 'Not signed in': 'உள்நுழையவில்லை', 'Please sign in.': 'தயவுசெய்து உள்நுழையவும்.', 'Loading…': 'ஏற்றப்படுகிறது…', 'Try again': 'மீண்டும் முயற்சிக்கவும்', 'Continue shopping': 'தொடர்ந்து வாங்குங்கள்', 'Start shopping': 'வாங்கத் தொடங்குங்கள்',
    'Your Account': 'உங்கள் கணக்கு', 'My orders.': 'என் ஆர்டர்கள்.', 'No orders yet.': 'இன்னும் ஆர்டர்கள் இல்லை.', 'Place your first order and it will show up here with live status updates.': 'உங்கள் முதல் ஆர்டரைச் செய்யுங்கள்; அதன் நிலை மாற்றங்கள் இங்கே தோன்றும்.', 'View Order Details': 'ஆர்டர் விவரங்களைக் காண்க', 'Hide details': 'விவரங்களை மறை', 'Deliver to': 'வழங்க வேண்டிய முகவரி', Payment: 'கட்டணம்', 'Search name, email or message…': 'பெயர், மின்னஞ்சல் அல்லது செய்தியைத் தேடுங்கள்…', 'No products yet': 'இன்னும் பொருட்கள் இல்லை', 'No products in this view': 'இந்தப் பட்டியலில் பொருட்கள் இல்லை', 'Loading products…': 'பொருட்கள் ஏற்றப்படுகின்றன…', 'Shop catalogue': 'கடை பட்டியல்', 'Add to cart': 'கூடையில் சேர்', 'View details': 'விவரங்களைக் காண்க', 'Out of stock': 'கையிருப்பில் இல்லை', 'In stock': 'கையிருப்பில் உள்ளது', 'Low stock': 'குறைந்த கையிருப்பு', 'Order placed!': 'ஆர்டர் செய்யப்பட்டது!', 'Place Order': 'ஆர்டர் செய்', Name: 'பெயர்', Address: 'முகவரி', Quantity: 'எண்ணிக்கை', 'Order status': 'ஆர்டர் நிலை', 'Payment status': 'கட்டண நிலை', Pending: 'நிலுவையில்', Processing: 'செயலாக்கத்தில்', Delivered: 'வழங்கப்பட்டது', Cancelled: 'ரத்து செய்யப்பட்டது',
    'Global Sourcing Transparency': 'உலகளாவிய ஆதாரத் தெளிவு', 'Where Every': 'ஒவ்வொரு', 'Handful Begins': 'கைப்பிடியும் தொடங்கும் இடம்', Elevation: 'உயரம்', 'Growing Climate': 'வளரும் காலநிலை', 'Peak Harvest': 'முக்கிய அறுவடை காலம்', 'Personalised Wellness': 'தனிப்பயன் நலம்', 'Find Your': 'உங்களுக்கான', 'Superfood Match': 'சூப்பர்ஃபுட் பொருத்தம்', 'Explore Wellness Collection': 'நலன் தொகுப்பைப் பாருங்கள்', 'Recommended Superfoods': 'பரிந்துரைக்கப்படும் சூப்பர்ஃபுட்கள்', 'The AJR Difference': 'AJR வித்தியாசம்', 'Why Pure Sourcing': 'தூய ஆதாரம் ஏன்', Matters: 'முக்கியம்', 'Visit Our Studio & Tasting Room': 'எங்கள் ஸ்டுடியோ மற்றும் சுவை அறைக்கு வாருங்கள்', 'Experience the Harvest': 'அறுவடையை அனுபவியுங்கள்', 'In Person': 'நேரில்', 'Get Directions on Google Maps': 'Google Maps வழியைப் பெறுங்கள்', 'Call Studio': 'ஸ்டுடியோவை அழைக்கவும்',
  },
  ml: {
    Language: 'ഭാഷ', Home: 'ഹോം', 'About us': 'ഞങ്ങളെക്കുറിച്ച്', Shop: 'ഷോപ്പ്', Contact: 'ബന്ധപ്പെടുക', Login: 'ലോഗിൻ', Signup: 'സൈൻ അപ്പ്', 'My Orders': 'എന്റെ ഓർഡറുകൾ', Logout: 'ലോഗ് ഔട്ട്', Wishlist: 'വിഷ്‌ലിസ്റ്റ്', Cart: 'കാർട്ട്', 'Return home': 'ഹോമിലേക്ക് മടങ്ങുക',
    Overview: 'അവലോകനം', Orders: 'ഓർഡറുകൾ', Products: 'ഉൽപ്പന്നങ്ങൾ', Inventory: 'സ്റ്റോക്ക്', Messages: 'സന്ദേശങ്ങൾ', Settings: 'ക്രമീകരണങ്ങൾ', Administration: 'അഡ്മിനിസ്ട്രേഷൻ', 'Sign out': 'സൈൻ ഔട്ട്', Refresh: 'പുതുക്കുക', Search: 'തിരയുക', 'Add product': 'ഉൽപ്പന്നം ചേർക്കുക', Edit: 'തിരുത്തുക', Delete: 'നീക്കുക', Save: 'സേവ് ചെയ്യുക', Cancel: 'റദ്ദാക്കുക', All: 'എല്ലാം', Visible: 'ദൃശ്യം', Hidden: 'മറച്ചത്', 'Visible in shop': 'ഷോപ്പിൽ ദൃശ്യം', 'Hidden from shop': 'ഷോപ്പിൽ മറച്ചത്', 'Hide from shop': 'ഷോപ്പിൽ നിന്ന് മറയ്ക്കുക', 'Show in shop': 'ഷോപ്പിൽ കാണിക്കുക',
    'First name': 'പേര്', 'Last name': 'കുടുംബപ്പേര്', 'Email address': 'ഇമെയിൽ വിലാസം', Password: 'പാസ്‌വേഡ്', 'Phone number': 'ഫോൺ നമ്പർ', 'Remember me': 'എന്നെ ഓർക്കുക', 'Forgot password?': 'പാസ്‌വേഡ് മറന്നോ?', 'Welcome back': 'തിരികെ സ്വാഗതം', 'Create your account': 'നിങ്ങളുടെ അക്കൗണ്ട് സൃഷ്ടിക്കുക', 'Create account': 'അക്കൗണ്ട് സൃഷ്ടിക്കുക', 'Account access': 'അക്കൗണ്ട് ആക്സസ്', 'Login to my account': 'എന്റെ അക്കൗണ്ടിലേക്ക് ലോഗിൻ ചെയ്യുക', 'Create free account': 'സൗജന്യ അക്കൗണ്ട് സൃഷ്ടിക്കുക', 'Already have an account?': 'ഇതിനകം അക്കൗണ്ട് ഉണ്ടോ?', 'Login here': 'ഇവിടെ ലോഗിൻ ചെയ്യുക', 'I agree to the terms': 'നിബന്ധനകൾ അംഗീകരിക്കുന്നു', 'Checking your session…': 'സെഷൻ പരിശോധിക്കുന്നു…', 'Not signed in': 'ലോഗിൻ ചെയ്തിട്ടില്ല', 'Please sign in.': 'ദയവായി ലോഗിൻ ചെയ്യുക.', 'Loading…': 'ലോഡ് ചെയ്യുന്നു…', 'Try again': 'വീണ്ടും ശ്രമിക്കുക', 'Continue shopping': 'ഷോപ്പിംഗ് തുടരുക', 'Start shopping': 'ഷോപ്പിംഗ് ആരംഭിക്കുക',
    'Your Account': 'നിങ്ങളുടെ അക്കൗണ്ട്', 'My orders.': 'എന്റെ ഓർഡറുകൾ.', 'No orders yet.': 'ഇതുവരെ ഓർഡറുകളില്ല.', 'Place your first order and it will show up here with live status updates.': 'ആദ്യ ഓർഡർ നൽകിയാൽ അതിന്റെ തത്സമയ നില ഇവിടെ കാണാം.', 'View Order Details': 'ഓർഡർ വിവരങ്ങൾ കാണുക', 'Hide details': 'വിവരങ്ങൾ മറയ്ക്കുക', 'Deliver to': 'വിതരണ വിലാസം', Payment: 'പേയ്മെന്റ്', 'Search name, email or message…': 'പേര്, ഇമെയിൽ അല്ലെങ്കിൽ സന്ദേശം തിരയുക…', 'No products yet': 'ഇതുവരെ ഉൽപ്പന്നങ്ങളില്ല', 'No products in this view': 'ഈ കാഴ്ചയിൽ ഉൽപ്പന്നങ്ങളില്ല', 'Loading products…': 'ഉൽപ്പന്നങ്ങൾ ലോഡ് ചെയ്യുന്നു…', 'Shop catalogue': 'ഷോപ്പ് കാറ്റലോഗ്', 'Add to cart': 'കാർട്ടിലേക്ക് ചേർക്കുക', 'View details': 'വിവരങ്ങൾ കാണുക', 'Out of stock': 'സ്റ്റോക്കില്ല', 'In stock': 'സ്റ്റോക്കുണ്ട്', 'Low stock': 'കുറഞ്ഞ സ്റ്റോക്ക്', 'Order placed!': 'ഓർഡർ നൽകി!', 'Place Order': 'ഓർഡർ നൽകുക', Name: 'പേര്', Address: 'വിലാസം', Quantity: 'എണ്ണം', 'Order status': 'ഓർഡർ നില', 'Payment status': 'പേയ്മെന്റ് നില', Pending: 'തീർപ്പാക്കാത്തത്', Processing: 'പ്രോസസ്സിംഗിൽ', Delivered: 'വിതരിച്ചു', Cancelled: 'റദ്ദാക്കി',
    'Global Sourcing Transparency': 'ആഗോള ഉറവിട സുതാര്യത', 'Where Every': 'ഓരോ', 'Handful Begins': 'കൈപ്പിടിയും തുടങ്ങുന്നിടം', Elevation: 'ഉയരം', 'Growing Climate': 'വളരുന്ന കാലാവസ്ഥ', 'Peak Harvest': 'പ്രധാന വിളവെടുപ്പ്', 'Personalised Wellness': 'വ്യക്തിഗത ആരോഗ്യം', 'Find Your': 'നിങ്ങളുടെ', 'Superfood Match': 'സൂപ്പർഫുഡ് പൊരുത്തം', 'Explore Wellness Collection': 'വെൽനസ് ശേഖരം കാണുക', 'Recommended Superfoods': 'ശുപാർശ ചെയ്യുന്ന സൂപ്പർഫുഡുകൾ', 'The AJR Difference': 'AJR വ്യത്യാസം', 'Why Pure Sourcing': 'ശുദ്ധമായ ഉറവിടം എന്തിന്', Matters: 'പ്രധാനമാണ്', 'Visit Our Studio & Tasting Room': 'സ്റ്റുഡിയോയും ടേസ്റ്റിംഗ് റൂമും സന്ദർശിക്കുക', 'Experience the Harvest': 'വിളവെടുപ്പ് അനുഭവിക്കുക', 'In Person': 'നേരിട്ട്', 'Get Directions on Google Maps': 'Google Maps വഴി കണ്ടെത്തുക', 'Call Studio': 'സ്റ്റുഡിയോയിൽ വിളിക്കുക',
  },
  te: {
    Language: 'భాష', Home: 'హోమ్', 'About us': 'మా గురించి', Shop: 'షాప్', Contact: 'సంప్రదించండి', Login: 'లాగిన్', Signup: 'సైన్ అప్', 'My Orders': 'నా ఆర్డర్లు', Logout: 'లాగ్ అవుట్', Wishlist: 'కోరికల జాబితా', Cart: 'కార్ట్', 'Return home': 'హోమ్‌కు తిరిగి వెళ్లండి',
    Overview: 'అవలోకనం', Orders: 'ఆర్డర్లు', Products: 'ఉత్పత్తులు', Inventory: 'నిల్వ', Messages: 'సందేశాలు', Settings: 'సెట్టింగ్‌లు', Administration: 'నిర్వహణ', 'Sign out': 'సైన్ అవుట్', Refresh: 'రిఫ్రెష్', Search: 'వెతకండి', 'Add product': 'ఉత్పత్తిని జోడించండి', Edit: 'సవరించండి', Delete: 'తొలగించండి', Save: 'సేవ్ చేయండి', Cancel: 'రద్దు చేయండి', All: 'అన్నీ', Visible: 'కనిపించేవి', Hidden: 'దాచినవి', 'Visible in shop': 'షాప్‌లో కనిపిస్తుంది', 'Hidden from shop': 'షాప్‌లో దాచబడింది', 'Hide from shop': 'షాప్‌లో దాచండి', 'Show in shop': 'షాప్‌లో చూపండి',
    'First name': 'మొదటి పేరు', 'Last name': 'ఇంటి పేరు', 'Email address': 'ఈమెయిల్ చిరునామా', Password: 'పాస్‌వర్డ్', 'Phone number': 'ఫోన్ నంబర్', 'Remember me': 'నన్ను గుర్తుంచుకోండి', 'Forgot password?': 'పాస్‌వర్డ్ మర్చిపోయారా?', 'Welcome back': 'తిరిగి స్వాగతం', 'Create your account': 'మీ ఖాతాను సృష్టించండి', 'Create account': 'ఖాతా సృష్టించండి', 'Account access': 'ఖాతా ప్రవేశం', 'Login to my account': 'నా ఖాతాలోకి లాగిన్ అవ్వండి', 'Create free account': 'ఉచిత ఖాతా సృష్టించండి', 'Already have an account?': 'ఇప్పటికే ఖాతా ఉందా?', 'Login here': 'ఇక్కడ లాగిన్ అవ్వండి', 'I agree to the terms': 'నిబంధనలను అంగీకరిస్తున్నాను', 'Checking your session…': 'మీ సెషన్‌ను తనిఖీ చేస్తున్నాం…', 'Not signed in': 'సైన్ ఇన్ కాలేదు', 'Please sign in.': 'దయచేసి సైన్ ఇన్ చేయండి.', 'Loading…': 'లోడ్ అవుతోంది…', 'Try again': 'మళ్లీ ప్రయత్నించండి', 'Continue shopping': 'షాపింగ్ కొనసాగించండి', 'Start shopping': 'షాపింగ్ ప్రారంభించండి',
    'Your Account': 'మీ ఖాతా', 'My orders.': 'నా ఆర్డర్లు.', 'No orders yet.': 'ఇంకా ఆర్డర్లు లేవు.', 'Place your first order and it will show up here with live status updates.': 'మీ మొదటి ఆర్డర్ ఇక్కడ ప్రత్యక్ష స్థితి నవీకరణలతో కనిపిస్తుంది.', 'View Order Details': 'ఆర్డర్ వివరాలు చూడండి', 'Hide details': 'వివరాలు దాచండి', 'Deliver to': 'డెలివరీ చిరునామా', Payment: 'చెల్లింపు', 'Search name, email or message…': 'పేరు, ఈమెయిల్ లేదా సందేశం వెతకండి…', 'No products yet': 'ఇంకా ఉత్పత్తులు లేవు', 'No products in this view': 'ఈ వీక్షణలో ఉత్పత్తులు లేవు', 'Loading products…': 'ఉత్పత్తులు లోడ్ అవుతున్నాయి…', 'Shop catalogue': 'షాప్ కేటలాగ్', 'Add to cart': 'కార్ట్‌కు జోడించండి', 'View details': 'వివరాలు చూడండి', 'Out of stock': 'స్టాక్ లేదు', 'In stock': 'స్టాక్‌లో ఉంది', 'Low stock': 'తక్కువ నిల్వ', 'Order placed!': 'ఆర్డర్ నమోదైంది!', 'Place Order': 'ఆర్డర్ చేయండి', Name: 'పేరు', Address: 'చిరునామా', Quantity: 'పరిమాణం', 'Order status': 'ఆర్డర్ స్థితి', 'Payment status': 'చెల్లింపు స్థితి', Pending: 'పెండింగ్‌లో', Processing: 'ప్రాసెసింగ్‌లో', Delivered: 'డెలివరీ అయింది', Cancelled: 'రద్దు చేయబడింది',
    'Global Sourcing Transparency': 'ప్రపంచవ్యాప్త సోర్సింగ్ పారదర్శకత', 'Where Every': 'ప్రతి', 'Handful Begins': 'గుప్పెడు ప్రారంభమయ్యే చోటు', Elevation: 'ఎత్తు', 'Growing Climate': 'పెరుగుదల వాతావరణం', 'Peak Harvest': 'ప్రధాన పంట కాలం', 'Personalised Wellness': 'వ్యక్తిగత ఆరోగ్యం', 'Find Your': 'మీ', 'Superfood Match': 'సూపర్‌ఫుడ్ జోడీ', 'Explore Wellness Collection': 'వెల్‌నెస్ సేకరణ చూడండి', 'Recommended Superfoods': 'సిఫార్సు చేసిన సూపర్‌ఫుడ్స్', 'The AJR Difference': 'AJR ప్రత్యేకత', 'Why Pure Sourcing': 'స్వచ్ఛమైన సోర్సింగ్ ఎందుకు', Matters: 'ముఖ్యం', 'Visit Our Studio & Tasting Room': 'మా స్టూడియో మరియు టేస్టింగ్ రూమ్‌ను సందర్శించండి', 'Experience the Harvest': 'పంటను అనుభవించండి', 'In Person': 'ప్రత్యక్షంగా', 'Get Directions on Google Maps': 'Google Mapsలో దారి పొందండి', 'Call Studio': 'స్టూడియోకు కాల్ చేయండి',
  },
  hi: {
    Language: 'भाषा', Home: 'होम', 'About us': 'हमारे बारे में', Shop: 'दुकान', Contact: 'संपर्क', Login: 'लॉग इन', Signup: 'साइन अप', 'My Orders': 'मेरे ऑर्डर', Logout: 'लॉग आउट', Wishlist: 'पसंदीदा', Cart: 'कार्ट', 'Return home': 'होम पर लौटें',
    Overview: 'अवलोकन', Orders: 'ऑर्डर', Products: 'उत्पाद', Inventory: 'इन्वेंटरी', Messages: 'संदेश', Settings: 'सेटिंग्स', Administration: 'प्रशासन', 'Sign out': 'साइन आउट', Refresh: 'रीफ़्रेश', Search: 'खोजें', 'Add product': 'उत्पाद जोड़ें', Edit: 'संपादित करें', Delete: 'हटाएँ', Save: 'सहेजें', Cancel: 'रद्द करें', All: 'सभी', Visible: 'दिख रहे', Hidden: 'छिपे हुए', 'Visible in shop': 'दुकान में दिख रहा है', 'Hidden from shop': 'दुकान से छिपा है', 'Hide from shop': 'दुकान से छिपाएँ', 'Show in shop': 'दुकान में दिखाएँ',
    'First name': 'पहला नाम', 'Last name': 'अंतिम नाम', 'Email address': 'ईमेल पता', Password: 'पासवर्ड', 'Phone number': 'फ़ोन नंबर', 'Remember me': 'मुझे याद रखें', 'Forgot password?': 'पासवर्ड भूल गए?', 'Welcome back': 'वापसी पर स्वागत है', 'Create your account': 'अपना खाता बनाएँ', 'Create account': 'खाता बनाएँ', 'Account access': 'खाता प्रवेश', 'Login to my account': 'मेरे खाते में लॉग इन करें', 'Create free account': 'मुफ़्त खाता बनाएँ', 'Already have an account?': 'क्या आपका पहले से खाता है?', 'Login here': 'यहाँ लॉग इन करें', 'I agree to the terms': 'मैं शर्तों से सहमत हूँ', 'Checking your session…': 'आपका सत्र जाँचा जा रहा है…', 'Not signed in': 'लॉग इन नहीं हैं', 'Please sign in.': 'कृपया लॉग इन करें।', 'Loading…': 'लोड हो रहा है…', 'Try again': 'फिर से कोशिश करें', 'Continue shopping': 'खरीदारी जारी रखें', 'Start shopping': 'खरीदारी शुरू करें',
    'Your Account': 'आपका खाता', 'My orders.': 'मेरे ऑर्डर।', 'No orders yet.': 'अभी तक कोई ऑर्डर नहीं।', 'Place your first order and it will show up here with live status updates.': 'अपना पहला ऑर्डर दें; उसकी स्थिति के अपडेट यहाँ दिखेंगे।', 'View Order Details': 'ऑर्डर का विवरण देखें', 'Hide details': 'विवरण छिपाएँ', 'Deliver to': 'डिलीवरी का पता', Payment: 'भुगतान', 'Search name, email or message…': 'नाम, ईमेल या संदेश खोजें…', 'No products yet': 'अभी तक कोई उत्पाद नहीं', 'No products in this view': 'इस दृश्य में कोई उत्पाद नहीं', 'Loading products…': 'उत्पाद लोड हो रहे हैं…', 'Shop catalogue': 'दुकान की सूची', 'Add to cart': 'कार्ट में जोड़ें', 'View details': 'विवरण देखें', 'Out of stock': 'स्टॉक में नहीं', 'In stock': 'स्टॉक में उपलब्ध', 'Low stock': 'कम स्टॉक', 'Order placed!': 'ऑर्डर हो गया!', 'Place Order': 'ऑर्डर करें', Name: 'नाम', Address: 'पता', Quantity: 'मात्रा', 'Order status': 'ऑर्डर की स्थिति', 'Payment status': 'भुगतान की स्थिति', Pending: 'लंबित', Processing: 'प्रक्रिया में', Delivered: 'डिलीवर हो गया', Cancelled: 'रद्द किया गया',
    'Global Sourcing Transparency': 'वैश्विक सोर्सिंग पारदर्शिता', 'Where Every': 'जहाँ हर', 'Handful Begins': 'मुट्ठी की शुरुआत होती है', Elevation: 'ऊँचाई', 'Growing Climate': 'उगाने की जलवायु', 'Peak Harvest': 'मुख्य कटाई का समय', 'Personalised Wellness': 'व्यक्तिगत स्वास्थ्य', 'Find Your': 'अपना', 'Superfood Match': 'सुपरफूड मेल खोजें', 'Explore Wellness Collection': 'वेलनेस संग्रह देखें', 'Recommended Superfoods': 'सुझाए गए सुपरफूड', 'The AJR Difference': 'AJR की खासियत', 'Why Pure Sourcing': 'शुद्ध सोर्सिंग क्यों', Matters: 'महत्वपूर्ण है', 'Visit Our Studio & Tasting Room': 'हमारे स्टूडियो और टेस्टिंग रूम आएँ', 'Experience the Harvest': 'फसल का अनुभव करें', 'In Person': 'व्यक्तिगत रूप से', 'Get Directions on Google Maps': 'Google Maps पर रास्ता पाएँ', 'Call Studio': 'स्टूडियो को कॉल करें',
  },
}

const supplementalTranslations: Record<Exclude<Language, 'en'>, Record<string, string>> = {
  ta: {
    'Open menu': 'மெனுவைத் திற', 'Log out': 'வெளியேறு', 'Fresh Harvest Batch Arrived Today': 'இன்றைய புதிய அறுவடை வந்துவிட்டது', 'Free Express Delivery on orders over ₹999': '₹999க்கு மேல் ஆர்டர்களுக்கு இலவச விரைவு விநியோகம்', '100% Pure & Organic Certified': '100% தூய மற்றும் இயற்கைச் சான்றளிக்கப்பட்டது', 'Fresh harvest': 'புதிய அறுவடை', 'Explore Collection': 'தொகுப்பைப் பாருங்கள்', 'Our Farm Story': 'எங்கள் பண்ணைக் கதை', 'Rooted in nature': 'இயற்கையில் வேரூன்றியது', 'Handpicked Grade A Kernels': 'கையால் தேர்ந்தெடுத்த தரம் A பருப்புகள்', 'Zero Preservatives': 'பாதுகாப்புப் பொருட்கள் இல்லை', 'Small Batch Roasted': 'சிறு தொகுதிகளாக வறுக்கப்பட்டது', 'The AJR Philosophy': 'AJR தத்துவம்', 'Good food is always worth sharing.': 'நல்ல உணவைப் பகிர்வது எப்போதும் சிறந்தது.', 'Read Our Story': 'எங்கள் கதையைப் படியுங்கள்', 'Campaign gallery': 'பிரச்சாரப் படத்தொகுப்பு', 'AJR Everyday Goodness': 'AJR அன்றாட நன்மை', 'Handpicked Bestsellers': 'கையால் தேர்ந்தெடுத்த சிறந்த விற்பனைகள்', 'Meet your new everyday ritual': 'உங்கள் புதிய அன்றாட வழக்கத்தை அறியுங்கள்', 'View Full Pantry': 'முழுத் தொகுப்பைப் பாருங்கள்', 'Happy Households Served': 'சேவை பெற்ற மகிழ்ச்சியான குடும்பங்கள்', 'Accredited Partner Farms': 'அங்கீகரிக்கப்பட்ட கூட்டுப் பண்ணைகள்', 'Pure Natural Sourcing': 'தூய இயற்கை ஆதாரம்', 'Handfuls Shared Daily': 'தினமும் பகிரப்படும் கைப்பிடிகள்', 'Royal Celebrations & Hampers': 'சிறப்பான கொண்டாட்டங்கள் மற்றும் பரிசுத் தொகுப்புகள்', 'Gifting made': 'பரிசளிப்பு ஆனது', unforgettable: 'மறக்க முடியாதது', 'Explore Gift Hampers': 'பரிசுத் தொகுப்புகளைப் பாருங்கள்', 'Laser Engraved Wood': 'லேசர் பொறித்த மரப்பெட்டி', 'Airtight Glass Jars': 'காற்றுப் புகாத கண்ணாடி ஜாடிகள்', 'Custom Bulk Pricing': 'தனிப்பயன் மொத்த விலை',
    'Fresh from the harvest': 'அறுவடையிலிருந்து புதிதாக', 'The AJR Pantry / Full Collection': 'AJR உணவகம் / முழுத் தொகுப்பு', 'Find your everyday superfoods.': 'உங்கள் அன்றாட சூப்பர்ஃபுட்களைக் கண்டறியுங்கள்.', 'Discover your pantry': 'உங்கள் உணவுத் தொகுப்பைக் கண்டறியுங்கள்', 'Search by ingredient, origin, category, or a craving.': 'பொருள், மூலம், வகை அல்லது விருப்பத்தின் அடிப்படையில் தேடுங்கள்.', 'Try “Kashmir”, “protein”, or “berries”': '“Kashmir”, “protein” அல்லது “berries” என்று தேடுங்கள்', 'Browse the harvest': 'அறுவடையைப் பாருங்கள்', 'Find products': 'பொருட்களைக் கண்டறியுங்கள்', 'Filter by product category': 'பொருள் வகையால் வடிகட்டுங்கள்', 'Sort collection': 'தொகுப்பை வரிசைப்படுத்துங்கள்', Bestselling: 'அதிகம் விற்பனையானவை', 'Price: low to high': 'விலை: குறைவிலிருந்து அதிகம்', 'Price: high to low': 'விலை: அதிகத்திலிருந்து குறைவு', 'Name: A–Z': 'பெயர்: அ–ஔ', 'harvest found': 'அறுவடைப் பொருட்கள் கிடைத்தன', 'across the AJR collection': 'AJR தொகுப்பில்', 'No exact harvest match': 'சரியான பொருத்தம் இல்லை', 'Nothing is hiding here.': 'இங்கே பொருட்கள் இல்லை.', 'Try a different ingredient or return to the full collection to discover more.': 'வேறு பொருளைத் தேடுங்கள் அல்லது முழுத் தொகுப்பைப் பாருங்கள்.', 'Reset all filters': 'அனைத்து வடிகட்டிகளையும் மீட்டமை', 'Back to collection': 'தொகுப்புக்குத் திரும்பு', 'Price for': 'இதற்கான விலை', 'Pack size': 'பொதி அளவு', Variety: 'வகை', 'Free express shipping on orders over ₹999': '₹999க்கு மேல் ஆர்டர்களுக்கு இலவச விரைவு விநியோகம்', 'Add to bag': 'பையில் சேர்', 'Storage & Shelf Life': 'சேமிப்பு மற்றும் காலாவதி', 'Nutritional Breakdown': 'ஊட்டச்சத்து விவரம்', 'Out of stock': 'கையிருப்பில் இல்லை',
    'Order placed! Thank you,': 'ஆர்டர் செய்யப்பட்டது. நன்றி,', 'Your order': 'உங்கள் ஆர்டர்', 'is confirmed. We have sent details to': 'உறுதிசெய்யப்பட்டது. விவரங்கள் அனுப்பப்பட்டுள்ளன:', 'View My Orders': 'என் ஆர்டர்களைப் பாருங்கள்', 'Continue Shopping': 'தொடர்ந்து வாங்குங்கள்', 'Your Bag': 'உங்கள் பை', 'Good things,': 'நல்லவை,', 'coming your way.': 'உங்களை வந்தடைகின்றன.', item: 'பொருள்', items: 'பொருட்கள்', 'Your bag is waiting.': 'உங்கள் பை காத்திருக்கிறது.', 'Fill it with fresh dry fruits, nuts and healthy superfood snacks.': 'புதிய உலர் பழங்கள், பருப்புகள் மற்றும் ஆரோக்கியமான சிற்றுண்டிகளைச் சேருங்கள்.', Remove: 'நீக்கு', 'Order Summary': 'ஆர்டர் சுருக்கம்', Subtotal: 'துணைத் தொகை', Shipping: 'விநியோகம்', Total: 'மொத்தம்', FREE: 'இலவசம்', 'Proceed to Checkout': 'செலுத்துவதற்குச் செல்லுங்கள்', 'Sign in so we can attach this order to your account.': 'இந்த ஆர்டரை உங்கள் கணக்குடன் இணைக்க உள்நுழையுங்கள்.', 'Login to checkout': 'செலுத்த உள்நுழையுங்கள்', 'Create an account': 'கணக்கை உருவாக்குங்கள்', 'Full name': 'முழுப் பெயர்', Email: 'மின்னஞ்சல்', Phone: 'தொலைபேசி', 'Delivery address': 'விநியோக முகவரி', 'Payment method': 'கட்டண முறை', 'Cash on delivery': 'பொருள் பெற்றபின் பணம்', 'Placing order…': 'ஆர்டர் செய்யப்படுகிறது…', 'Back to Bag': 'பைக்குத் திரும்பு', 'Encrypted & Secure Checkout': 'மறையாக்கப்பட்ட பாதுகாப்பான செலுத்தல்', 'Saved Items': 'சேமித்த பொருட்கள்', 'Your wishlist.': 'உங்கள் விருப்பப்பட்டியல்.', saved: 'சேமிக்கப்பட்டது', 'Nothing saved yet.': 'இதுவரை எதுவும் சேமிக்கப்படவில்லை.', 'Save your favorite items here to order later.': 'பின்னர் வாங்க விருப்பமானவற்றை இங்கே சேமியுங்கள்.', 'Browse Products': 'பொருட்களைப் பாருங்கள்', Explore: 'ஆராயுங்கள்', Connect: 'தொடர்பு', Newsletter: 'செய்திமடல்', 'Your email address': 'உங்கள் மின்னஞ்சல் முகவரி', Subscribe: 'பதிவு செய்க',
  },
  ml: {
    'Open menu': 'മെനു തുറക്കുക', 'Log out': 'ലോഗ് ഔട്ട്', 'Fresh Harvest Batch Arrived Today': 'ഇന്നത്തെ പുതിയ വിളവെടുപ്പ് എത്തി', 'Free Express Delivery on orders over ₹999': '₹999-ന് മുകളിലുള്ള ഓർഡറുകൾക്ക് സൗജന്യ എക്സ്പ്രസ് ഡെലിവറി', '100% Pure & Organic Certified': '100% ശുദ്ധവും ഓർഗാനിക് സർട്ടിഫൈഡും', 'Fresh harvest': 'പുതിയ വിളവെടുപ്പ്', 'Explore Collection': 'ശേഖരം കാണുക', 'Our Farm Story': 'ഞങ്ങളുടെ ഫാം കഥ', 'Rooted in nature': 'പ്രകൃതിയിൽ വേരൂന്നിയത്', 'Handpicked Grade A Kernels': 'കൈകൊണ്ട് തിരഞ്ഞെടുത്ത ഗ്രേഡ് A കുരുക്കൾ', 'Zero Preservatives': 'പ്രിസർവേറ്റീവുകൾ ഇല്ല', 'Small Batch Roasted': 'ചെറിയ ബാച്ചുകളായി വറുത്തത്', 'The AJR Philosophy': 'AJR തത്ത്വം', 'Good food is always worth sharing.': 'നല്ല ഭക്ഷണം എപ്പോഴും പങ്കിടാൻ നല്ലതാണ്.', 'Read Our Story': 'ഞങ്ങളുടെ കഥ വായിക്കുക', 'Campaign gallery': 'ക്യാമ്പെയ്ൻ ഗാലറി', 'AJR Everyday Goodness': 'AJR ദൈനംദിന നന്മ', 'Handpicked Bestsellers': 'തിരഞ്ഞെടുത്ത ബെസ്റ്റ് സെല്ലറുകൾ', 'Meet your new everyday ritual': 'നിങ്ങളുടെ പുതിയ ദൈനംദിന ശീലം പരിചയപ്പെടുക', 'View Full Pantry': 'മുഴുവൻ ശേഖരം കാണുക', 'Happy Households Served': 'സേവനം ലഭിച്ച സന്തുഷ്ട കുടുംബങ്ങൾ', 'Accredited Partner Farms': 'അംഗീകൃത പങ്കാളി ഫാമുകൾ', 'Pure Natural Sourcing': 'ശുദ്ധമായ പ്രകൃതിദത്ത ഉറവിടം', 'Handfuls Shared Daily': 'ദിവസേന പങ്കിടുന്ന കൈപ്പിടികൾ', 'Royal Celebrations & Hampers': 'രാജകീയ ആഘോഷങ്ങളും ഹാംപറുകളും', 'Gifting made': 'സമ്മാനം', unforgettable: 'മറക്കാനാവാത്തത്', 'Explore Gift Hampers': 'ഗിഫ്റ്റ് ഹാംപറുകൾ കാണുക', 'Laser Engraved Wood': 'ലേസർ കൊത്തുപണിയുള്ള മരം', 'Airtight Glass Jars': 'വായു കടക്കാത്ത ഗ്ലാസ് ജാറുകൾ', 'Custom Bulk Pricing': 'കസ്റ്റം ബൾക്ക് വില',
    'Fresh from the harvest': 'വിളവെടുപ്പിൽ നിന്ന് പുതിയത്', 'The AJR Pantry / Full Collection': 'AJR പാൻട്രി / മുഴുവൻ ശേഖരം', 'Find your everyday superfoods.': 'നിങ്ങളുടെ ദൈനംദിന സൂപ്പർഫുഡുകൾ കണ്ടെത്തുക.', 'Discover your pantry': 'നിങ്ങളുടെ പാൻട്രി കണ്ടെത്തുക', 'Search by ingredient, origin, category, or a craving.': 'ചേരുവ, ഉറവിടം, വിഭാഗം, അല്ലെങ്കിൽ ആഗ്രഹം ഉപയോഗിച്ച് തിരയുക.', 'Try “Kashmir”, “protein”, or “berries”': '“Kashmir”, “protein”, അല്ലെങ്കിൽ “berries” തിരയുക', 'Browse the harvest': 'വിളവെടുപ്പ് ബ്രൗസ് ചെയ്യുക', 'Find products': 'ഉൽപ്പന്നങ്ങൾ കണ്ടെത്തുക', 'Filter by product category': 'ഉൽപ്പന്ന വിഭാഗം അനുസരിച്ച് ഫിൽട്ടർ ചെയ്യുക', 'Sort collection': 'ശേഖരം ക്രമീകരിക്കുക', Bestselling: 'ഏറ്റവും വിറ്റഴിക്കപ്പെടുന്നത്', 'Price: low to high': 'വില: കുറഞ്ഞത് ആദ്യം', 'Price: high to low': 'വില: കൂടിയത് ആദ്യം', 'Name: A–Z': 'പേര്: A–Z', 'harvest found': 'വിളവെടുപ്പ് ഉൽപ്പന്നങ്ങൾ കണ്ടെത്തി', 'across the AJR collection': 'AJR ശേഖരത്തിൽ', 'No exact harvest match': 'കൃത്യമായ പൊരുത്തം കണ്ടെത്തിയില്ല', 'Nothing is hiding here.': 'ഇവിടെ ഒന്നുമില്ല.', 'Try a different ingredient or return to the full collection to discover more.': 'മറ്റൊരു ചേരുവ തിരയുക അല്ലെങ്കിൽ മുഴുവൻ ശേഖരത്തിലേക്ക് മടങ്ങുക.', 'Reset all filters': 'എല്ലാ ഫിൽട്ടറുകളും പുനഃക്രമീകരിക്കുക', 'Back to collection': 'ശേഖരത്തിലേക്ക് മടങ്ങുക', 'Price for': 'വില', 'Pack size': 'പാക്ക് വലുപ്പം', 'Free express shipping on orders over ₹999': '₹999-ന് മുകളിലുള്ള ഓർഡറുകൾക്ക് സൗജന്യ എക്സ്പ്രസ് ഡെലിവറി', 'Add to bag': 'ബാഗിലേക്ക് ചേർക്കുക', 'Storage & Shelf Life': 'സംഭരണവും കാലാവധിയും', 'Nutritional Breakdown': 'പോഷക വിവരങ്ങൾ',
    'Order placed! Thank you,': 'ഓർഡർ നൽകി. നന്ദി,', 'Your order': 'നിങ്ങളുടെ ഓർഡർ', 'is confirmed. We have sent details to': 'സ്ഥിരീകരിച്ചു. വിശദാംശങ്ങൾ അയച്ചത്:', 'View My Orders': 'എന്റെ ഓർഡറുകൾ കാണുക', 'Continue Shopping': 'ഷോപ്പിംഗ് തുടരുക', 'Your Bag': 'നിങ്ങളുടെ ബാഗ്', 'Good things,': 'നല്ല കാര്യങ്ങൾ,', 'coming your way.': 'നിങ്ങളിലേക്ക് വരുന്നു.', item: 'ഇനം', items: 'ഇനങ്ങൾ', 'Your bag is waiting.': 'നിങ്ങളുടെ ബാഗ് കാത്തിരിക്കുന്നു.', 'Fill it with fresh dry fruits, nuts and healthy superfood snacks.': 'പുതിയ ഡ്രൈ ഫ്രൂട്ട്സ്, നട്സ്, ആരോഗ്യകരമായ സ്നാക്കുകൾ ചേർക്കുക.', Remove: 'നീക്കുക', 'Order Summary': 'ഓർഡർ സംഗ്രഹം', Subtotal: 'ഉപമൊത്തം', Shipping: 'ഡെലിവറി', Total: 'ആകെ', FREE: 'സൗജന്യം', 'Proceed to Checkout': 'ചെക്ക്ഔട്ടിലേക്ക് പോകുക', 'Sign in so we can attach this order to your account.': 'ഈ ഓർഡർ നിങ്ങളുടെ അക്കൗണ്ടിൽ ചേർക്കാൻ ലോഗിൻ ചെയ്യുക.', 'Login to checkout': 'ചെക്ക്ഔട്ടിന് ലോഗിൻ ചെയ്യുക', 'Full name': 'പൂർണ്ണ പേര്', Email: 'ഇമെയിൽ', Phone: 'ഫോൺ', 'Delivery address': 'ഡെലിവറി വിലാസം', 'Payment method': 'പേയ്മെന്റ് രീതി', 'Cash on delivery': 'ഡെലിവറിയിൽ പണം', 'Placing order…': 'ഓർഡർ നൽകുന്നു…', 'Back to Bag': 'ബാഗിലേക്ക് മടങ്ങുക', 'Encrypted & Secure Checkout': 'സുരക്ഷിത ചെക്ക്ഔട്ട്', 'Saved Items': 'സേവ് ചെയ്തവ', 'Your wishlist.': 'നിങ്ങളുടെ വിഷ്‌ലിസ്റ്റ്.', saved: 'സേവ് ചെയ്തു', 'Nothing saved yet.': 'ഇതുവരെ ഒന്നും സേവ് ചെയ്തിട്ടില്ല.', 'Save your favorite items here to order later.': 'പിന്നീട് ഓർഡർ ചെയ്യാൻ ഇഷ്ടപ്പെട്ടവ ഇവിടെ സേവ് ചെയ്യുക.', 'Browse Products': 'ഉൽപ്പന്നങ്ങൾ കാണുക', Explore: 'കാണുക', Connect: 'ബന്ധപ്പെടുക', Newsletter: 'വാർത്താക്കുറിപ്പ്', 'Your email address': 'നിങ്ങളുടെ ഇമെയിൽ വിലാസം', Subscribe: 'സബ്സ്ക്രൈബ്',
  },
  te: {
    'Open menu': 'మెనూ తెరవండి', 'Log out': 'లాగ్ అవుట్', 'Fresh Harvest Batch Arrived Today': 'ఈరోజు తాజా పంట వచ్చింది', 'Free Express Delivery on orders over ₹999': '₹999 పైబడిన ఆర్డర్లకు ఉచిత ఎక్స్‌ప్రెస్ డెలివరీ', '100% Pure & Organic Certified': '100% స్వచ్ఛమైన మరియు ఆర్గానిక్ ధృవీకరణ', 'Fresh harvest': 'తాజా పంట', 'Explore Collection': 'సేకరణను చూడండి', 'Our Farm Story': 'మా ఫార్మ్ కథ', 'Rooted in nature': 'ప్రకృతిలో వేళ్లూనుకున్నది', 'Handpicked Grade A Kernels': 'చేతితో ఎంపిక చేసిన గ్రేడ్ A గింజలు', 'Zero Preservatives': 'సంరక్షణ పదార్థాలు లేవు', 'Small Batch Roasted': 'చిన్న బ్యాచ్‌లలో వేయించినవి', 'The AJR Philosophy': 'AJR తత్వం', 'Good food is always worth sharing.': 'మంచి ఆహారాన్ని ఎప్పుడూ పంచుకోవచ్చు.', 'Read Our Story': 'మా కథను చదవండి', 'Campaign gallery': 'క్యాంపెయిన్ గ్యాలరీ', 'AJR Everyday Goodness': 'AJR రోజువారీ మంచితనం', 'Handpicked Bestsellers': 'ఎంపిక చేసిన బెస్ట్‌సెల్లర్లు', 'Meet your new everyday ritual': 'మీ కొత్త రోజువారీ అలవాటును చూడండి', 'View Full Pantry': 'పూర్తి సేకరణ చూడండి', 'Happy Households Served': 'సేవ పొందిన సంతోషకరమైన కుటుంబాలు', 'Accredited Partner Farms': 'గుర్తింపు పొందిన భాగస్వామి పొలాలు', 'Pure Natural Sourcing': 'స్వచ్ఛమైన సహజ సోర్సింగ్', 'Handfuls Shared Daily': 'రోజూ పంచుకునే గుప్పెళ్లు', 'Royal Celebrations & Hampers': 'రాజసమైన వేడుకలు మరియు హ్యాంపర్లు', 'Gifting made': 'బహుమతి ఇవ్వడం', unforgettable: 'మరపురానిది', 'Explore Gift Hampers': 'గిఫ్ట్ హ్యాంపర్లను చూడండి', 'Laser Engraved Wood': 'లేజర్ చెక్కిన కలప', 'Airtight Glass Jars': 'గాలి చొరబడని గాజు సీసాలు', 'Custom Bulk Pricing': 'కస్టమ్ బల్క్ ధరలు',
    'Fresh from the harvest': 'పంట నుంచి తాజాగా', 'The AJR Pantry / Full Collection': 'AJR ప్యాంట్రీ / పూర్తి సేకరణ', 'Find your everyday superfoods.': 'మీ రోజువారీ సూపర్‌ఫుడ్‌లను కనుగొనండి.', 'Discover your pantry': 'మీ ప్యాంట్రీని కనుగొనండి', 'Search by ingredient, origin, category, or a craving.': 'పదార్థం, మూలం, వర్గం లేదా కోరికతో వెతకండి.', 'Try “Kashmir”, “protein”, or “berries”': '“Kashmir”, “protein” లేదా “berries” వెతకండి', 'Browse the harvest': 'పంటను చూడండి', 'Find products': 'ఉత్పత్తులను కనుగొనండి', 'Filter by product category': 'ఉత్పత్తి వర్గంతో ఫిల్టర్ చేయండి', 'Sort collection': 'సేకరణను క్రమబద్ధీకరించండి', Bestselling: 'అత్యధికంగా అమ్ముడైనవి', 'Price: low to high': 'ధర: తక్కువ నుండి ఎక్కువ', 'Price: high to low': 'ధర: ఎక్కువ నుండి తక్కువ', 'Name: A–Z': 'పేరు: A–Z', 'harvest found': 'ఉత్పత్తులు కనుగొనబడ్డాయి', 'across the AJR collection': 'AJR సేకరణలో', 'No exact harvest match': 'సరైన సరిపోలిక లేదు', 'Nothing is hiding here.': 'ఇక్కడ ఏమీ లేదు.', 'Try a different ingredient or return to the full collection to discover more.': 'వేరే పదార్థాన్ని వెతకండి లేదా పూర్తి సేకరణకు తిరిగి వెళ్లండి.', 'Reset all filters': 'అన్ని ఫిల్టర్‌లను రీసెట్ చేయండి', 'Back to collection': 'సేకరణకు తిరిగి వెళ్లండి', 'Price for': 'ధర', 'Pack size': 'ప్యాక్ పరిమాణం', 'Free express shipping on orders over ₹999': '₹999 పైబడిన ఆర్డర్లకు ఉచిత ఎక్స్‌ప్రెస్ డెలివరీ', 'Add to bag': 'బ్యాగ్‌లో చేర్చండి', 'Storage & Shelf Life': 'నిల్వ మరియు నిల్వ కాలం', 'Nutritional Breakdown': 'పోషక వివరాలు',
    'Order placed! Thank you,': 'ఆర్డర్ నమోదైంది. ధన్యవాదాలు,', 'Your order': 'మీ ఆర్డర్', 'is confirmed. We have sent details to': 'నిర్ధారించబడింది. వివరాలు పంపిన చిరునామా:', 'View My Orders': 'నా ఆర్డర్లను చూడండి', 'Continue Shopping': 'షాపింగ్ కొనసాగించండి', 'Your Bag': 'మీ బ్యాగ్', 'Good things,': 'మంచి విషయాలు,', 'coming your way.': 'మీ దారిలో ఉన్నాయి.', item: 'వస్తువు', items: 'వస్తువులు', 'Your bag is waiting.': 'మీ బ్యాగ్ ఎదురుచూస్తోంది.', 'Fill it with fresh dry fruits, nuts and healthy superfood snacks.': 'తాజా డ్రై ఫ్రూట్స్, నట్స్ మరియు ఆరోగ్యకరమైన స్నాక్స్‌తో నింపండి.', Remove: 'తొలగించండి', 'Order Summary': 'ఆర్డర్ సారాంశం', Subtotal: 'ఉపమొత్తం', Shipping: 'డెలివరీ', Total: 'మొత్తం', FREE: 'ఉచితం', 'Proceed to Checkout': 'చెల్లింపుకు వెళ్లండి', 'Sign in so we can attach this order to your account.': 'ఈ ఆర్డర్‌ను మీ ఖాతాకు జోడించడానికి సైన్ ఇన్ చేయండి.', 'Login to checkout': 'చెల్లించడానికి లాగిన్ అవ్వండి', 'Full name': 'పూర్తి పేరు', Email: 'ఈమెయిల్', Phone: 'ఫోన్', 'Delivery address': 'డెలివరీ చిరునామా', 'Payment method': 'చెల్లింపు విధానం', 'Cash on delivery': 'డెలివరీ సమయంలో నగదు', 'Placing order…': 'ఆర్డర్ చేస్తున్నాం…', 'Back to Bag': 'బ్యాగ్‌కు తిరిగి వెళ్లండి', 'Encrypted & Secure Checkout': 'సురక్షిత చెక్అవుట్', 'Saved Items': 'సేవ్ చేసినవి', 'Your wishlist.': 'మీ కోరికల జాబితా.', saved: 'సేవ్ చేయబడింది', 'Nothing saved yet.': 'ఇంకా ఏమీ సేవ్ చేయలేదు.', 'Save your favorite items here to order later.': 'తర్వాత ఆర్డర్ చేయడానికి ఇష్టమైన వాటిని ఇక్కడ సేవ్ చేయండి.', 'Browse Products': 'ఉత్పత్తులను చూడండి', Explore: 'అన్వేషించండి', Connect: 'సంప్రదించండి', Newsletter: 'వార్తా లేఖ', 'Your email address': 'మీ ఈమెయిల్ చిరునామా', Subscribe: 'చందా చేయండి',
  },
  hi: {
    'Open menu': 'मेनू खोलें', 'Log out': 'लॉग आउट', 'Fresh Harvest Batch Arrived Today': 'आज की ताज़ा फसल आ गई है', 'Free Express Delivery on orders over ₹999': '₹999 से अधिक के ऑर्डर पर मुफ़्त एक्सप्रेस डिलीवरी', '100% Pure & Organic Certified': '100% शुद्ध और ऑर्गेनिक प्रमाणित', 'Fresh harvest': 'ताज़ी फसल', 'Explore Collection': 'संग्रह देखें', 'Our Farm Story': 'हमारी फ़ार्म कहानी', 'Rooted in nature': 'प्रकृति से जुड़ा', 'Handpicked Grade A Kernels': 'हाथ से चुने गए ग्रेड A दाने', 'Zero Preservatives': 'कोई प्रिज़र्वेटिव नहीं', 'Small Batch Roasted': 'छोटे बैच में भुने हुए', 'The AJR Philosophy': 'AJR दर्शन', 'Good food is always worth sharing.': 'अच्छा खाना हमेशा साझा करने लायक होता है।', 'Read Our Story': 'हमारी कहानी पढ़ें', 'Campaign gallery': 'अभियान गैलरी', 'AJR Everyday Goodness': 'AJR की रोज़मर्रा की अच्छाई', 'Handpicked Bestsellers': 'चुने हुए लोकप्रिय उत्पाद', 'Meet your new everyday ritual': 'अपनी नई रोज़मर्रा की आदत से मिलें', 'View Full Pantry': 'पूरा संग्रह देखें', 'Happy Households Served': 'सेवा प्राप्त खुशहाल परिवार', 'Accredited Partner Farms': 'मान्यता प्राप्त साझेदार फ़ार्म', 'Pure Natural Sourcing': 'शुद्ध प्राकृतिक स्रोत', 'Handfuls Shared Daily': 'रोज़ साझा की गई मुट्ठियाँ', 'Royal Celebrations & Hampers': 'शाही उत्सव और हैम्पर', 'Gifting made': 'उपहार देना हुआ', unforgettable: 'यादगार', 'Explore Gift Hampers': 'गिफ़्ट हैम्पर देखें', 'Laser Engraved Wood': 'लेज़र नक्काशीदार लकड़ी', 'Airtight Glass Jars': 'हवा-बंद काँच के जार', 'Custom Bulk Pricing': 'कस्टम थोक मूल्य',
    'Fresh from the harvest': 'ताज़ी फसल से', 'The AJR Pantry / Full Collection': 'AJR पेंट्री / पूरा संग्रह', 'Find your everyday superfoods.': 'अपने रोज़मर्रा के सुपरफ़ूड खोजें।', 'Discover your pantry': 'अपनी पेंट्री खोजें', 'Search by ingredient, origin, category, or a craving.': 'सामग्री, स्रोत, श्रेणी या पसंद से खोजें।', 'Try “Kashmir”, “protein”, or “berries”': '“Kashmir”, “protein” या “berries” खोजें', 'Browse the harvest': 'फसल देखें', 'Find products': 'उत्पाद खोजें', 'Filter by product category': 'उत्पाद श्रेणी के अनुसार फ़िल्टर करें', 'Sort collection': 'संग्रह क्रमबद्ध करें', Bestselling: 'सबसे ज़्यादा बिकने वाले', 'Price: low to high': 'कीमत: कम से ज़्यादा', 'Price: high to low': 'कीमत: ज़्यादा से कम', 'Name: A–Z': 'नाम: A–Z', 'harvest found': 'उत्पाद मिले', 'across the AJR collection': 'AJR संग्रह में', 'No exact harvest match': 'सटीक मिलान नहीं मिला', 'Nothing is hiding here.': 'यहाँ कुछ नहीं मिला।', 'Try a different ingredient or return to the full collection to discover more.': 'कोई दूसरी सामग्री खोजें या पूरा संग्रह देखें।', 'Reset all filters': 'सभी फ़िल्टर रीसेट करें', 'Back to collection': 'संग्रह पर वापस जाएँ', 'Price for': 'कीमत', 'Pack size': 'पैक का आकार', 'Free express shipping on orders over ₹999': '₹999 से अधिक के ऑर्डर पर मुफ़्त एक्सप्रेस डिलीवरी', 'Add to bag': 'बैग में जोड़ें', 'Storage & Shelf Life': 'भंडारण और शेल्फ लाइफ़', 'Nutritional Breakdown': 'पोषण विवरण',
    'Order placed! Thank you,': 'ऑर्डर हो गया। धन्यवाद,', 'Your order': 'आपका ऑर्डर', 'is confirmed. We have sent details to': 'पुष्टि हो गई। विवरण भेजे गए:', 'View My Orders': 'मेरे ऑर्डर देखें', 'Continue Shopping': 'खरीदारी जारी रखें', 'Your Bag': 'आपका बैग', 'Good things,': 'अच्छी चीज़ें,', 'coming your way.': 'आपकी ओर आ रही हैं।', item: 'वस्तु', items: 'वस्तुएँ', 'Your bag is waiting.': 'आपका बैग इंतज़ार कर रहा है।', 'Fill it with fresh dry fruits, nuts and healthy superfood snacks.': 'इसे ताज़े सूखे फल, मेवे और हेल्दी स्नैक्स से भरें।', Remove: 'हटाएँ', 'Order Summary': 'ऑर्डर सारांश', Subtotal: 'उप-योग', Shipping: 'डिलीवरी', Total: 'कुल', FREE: 'मुफ़्त', 'Proceed to Checkout': 'चेकआउट पर जाएँ', 'Sign in so we can attach this order to your account.': 'इस ऑर्डर को अपने खाते से जोड़ने के लिए लॉग इन करें।', 'Login to checkout': 'चेकआउट के लिए लॉग इन करें', 'Full name': 'पूरा नाम', Email: 'ईमेल', Phone: 'फ़ोन', 'Delivery address': 'डिलीवरी का पता', 'Payment method': 'भुगतान का तरीका', 'Cash on delivery': 'डिलीवरी पर नकद', 'Placing order…': 'ऑर्डर दिया जा रहा है…', 'Back to Bag': 'बैग पर वापस जाएँ', 'Encrypted & Secure Checkout': 'एन्क्रिप्टेड और सुरक्षित चेकआउट', 'Saved Items': 'सहेजी गई वस्तुएँ', 'Your wishlist.': 'आपकी पसंदीदा सूची।', saved: 'सहेजे गए', 'Nothing saved yet.': 'अभी तक कुछ नहीं सहेजा गया।', 'Save your favorite items here to order later.': 'बाद में ऑर्डर करने के लिए पसंदीदा वस्तुएँ यहाँ सहेजें।', 'Browse Products': 'उत्पाद देखें', Explore: 'देखें', Connect: 'संपर्क', Newsletter: 'न्यूज़लेटर', 'Your email address': 'आपका ईमेल पता', Subscribe: 'सदस्यता लें',
  },
}

// Complete Hindi copy for the richer editorial, support, account, and admin
// surfaces. Product and customer-entered proper names remain untranslated.
const hindiExperienceTranslations: Record<string, string> = {
  'Culinary Inspiration': 'पाक प्रेरणा', 'Simple ways to enjoy everyday superfoods': 'रोज़मर्रा के सुपरफूड का आनंद लेने के आसान तरीके',
  'From Grove to Table': 'बागान से आपकी मेज़ तक', 'How every pack': 'हर पैक', 'finds you.': 'आप तक कैसे पहुँचता है।',
  Add: 'कार्ट में जोड़ें', From: 'शुरुआती कीमत', FROM: 'शुरुआती कीमत', 'View Details': 'विवरण देखें', 'Add to wishlist': 'पसंदीदा सूची में जोड़ें',
  Nuts: 'मेवे', Seeds: 'बीज', Spices: 'मसाले', Berries: 'बेरी', 'Tropical Fruit': 'उष्णकटिबंधीय फल', 'Stone Fruit': 'गुठलीदार फल', Mixes: 'मिश्रण', Snacking: 'स्नैकिंग',
  Almonds: 'बादाम', Cashews: 'काजू', Pistachios: 'पिस्ता', Walnuts: 'अखरोट', Figs: 'अंजीर', Raisins: 'किशमिश', Dates: 'खजूर', Prunes: 'सूखे आलूबुखारे',
  'Goodness worth sharing.': 'ऐसी अच्छाई, जिसे बाँटना चाहें।', Goodness: 'अच्छाई', 'worth sharing.': 'जिसे बाँटना चाहें।',
  'Good food is': 'अच्छा भोजन', always: 'हमेशा', everyday: 'हर दिन', in: 'में', for: 'के लिए', or: 'या', 'superfoods.': 'सुपरफूड।',
  'Handpicked California almonds, jumbo golden cashews, Medjool dates and Kashmiri walnuts — curated for daily wellness and royal gifting.': 'हाथ से चुने कैलिफ़ोर्निया बादाम, जंबो गोल्डन काजू, मेडजूल खजूर और कश्मीरी अखरोट—रोज़ाना सेहत और खास उपहारों के लिए।',
  'Essence of nature.': 'प्रकृति का सार।', 'Our Story': 'हमारी कहानी', 'Shop All': 'सभी उत्पाद देखें', 'Contact Us': 'संपर्क करें',
  'Pure dry fruits, nuts, and handcrafted hampers made for everyday living.': 'रोज़मर्रा के लिए शुद्ध मेवे, नट्स और हाथ से तैयार उपहार हैम्पर।',
  'Join the table for private harvest releases.': 'नई फसल और विशेष संग्रह की जानकारी सबसे पहले पाएँ।', 'Crafted with intention & care': 'सोच और देखभाल से तैयार', 'Privacy · Terms': 'गोपनीयता · शर्तें',
  'Fresh sourcing • Small batch roasting': 'ताज़ा स्रोत • छोटे बैच में भुनाई', 'Member savings • Gift collections': 'सदस्य बचत • उपहार संग्रह', 'Directly sourced · Packed in small batches': 'सीधे स्रोत से · छोटे बैच में पैक',
  'Healthy habits start here': 'स्वस्थ आदतें यहीं से शुरू होती हैं', 'Build your wellness pantry and save your favorites.': 'अपनी सेहतमंद पैंट्री बनाएँ और पसंदीदा उत्पाद सहेजें।',
  'Continue your healthy snacking journey with premium farm-picked dry fruits, wellness blends, and thoughtful gifting.': 'खेतों से चुने प्रीमियम मेवों, वेलनेस मिश्रणों और सोच-समझकर तैयार उपहारों के साथ अपनी सेहतमंद स्नैकिंग जारी रखें।',
  'Join our community for better nutrition, curated product selections, pantry planning, and beautiful seasonal harvest gifts.': 'बेहतर पोषण, चुने हुए उत्पादों, पैंट्री योजना और मौसमी उपहारों के लिए हमारे समुदाय से जुड़ें।',
  '100% natural, Grade A almonds, cashews, walnuts, dates, and festive hampers packed for peak freshness.': '100% प्राकृतिक ग्रेड A बादाम, काजू, अखरोट, खजूर और त्योहारों के हैम्पर—बेहतरीन ताज़गी के साथ पैक।',
  'Harvest · 100% Organic': 'फसल · 100% ऑर्गेनिक', 'Find your': 'अपना खोजें', 'My': 'मेरे', Variety: 'किस्म',
  'Member Login': 'सदस्य लॉग इन', 'New to AJR?': 'AJR पर नए हैं?', 'Sign up': 'साइन अप करें', 'Create an account': 'खाता बनाएँ', 'Creating account...': 'खाता बनाया जा रहा है…',
  'Sign in to manage your orders and nutrition preferences.': 'अपने ऑर्डर और पोषण पसंद प्रबंधित करने के लिए लॉग इन करें।', 'Loading your orders…': 'आपके ऑर्डर लोड हो रहे हैं…',
  'Your orders are stored with your account. Sign in to see them.': 'आपके ऑर्डर आपके खाते में सुरक्षित हैं। उन्हें देखने के लिए लॉग इन करें।', 'Could not load your orders.': 'आपके ऑर्डर लोड नहीं हो सके।',
  'Login failed. Please check your email and password.': 'लॉग इन नहीं हुआ। अपना ईमेल और पासवर्ड जाँचें।', 'Login failed. Please try again.': 'लॉग इन नहीं हुआ। कृपया फिर प्रयास करें।',
  'This email is not confirmed yet. Check your email for the confirmation link.': 'इस ईमेल की पुष्टि अभी नहीं हुई है। पुष्टि लिंक के लिए अपना ईमेल देखें।', 'Please wait...': 'कृपया प्रतीक्षा करें…',
  'Open navigation': 'नेविगेशन खोलें', 'Close navigation': 'नेविगेशन बंद करें', 'Search the collection': 'संग्रह में खोजें', 'Clear product search': 'उत्पाद खोज साफ़ करें', 'Sort products': 'उत्पाद क्रमबद्ध करें', 'Product results': 'उत्पाद परिणाम',
  'Rooted in nature.': 'प्रकृति में रचा-बसा।', 'Our Heritage & Sourcing Philosophy': 'हमारी विरासत और स्रोत दर्शन', 'The AJR Founding Story': 'AJR की स्थापना की कहानी', 'The Family Table': 'परिवार की मेज़',
  'AJR began at a family table in Virudhunagar, Tamil Nadu. We noticed that most store-bought dry fruits were dry, over-bleached with sulfur, or sat in open warehouses for over a year before reaching customers.': 'AJR की शुरुआत तमिलनाडु के विरुधुनगर में एक पारिवारिक मेज़ से हुई। हमने देखा कि बाज़ार के अधिकतर मेवे सूखे, सल्फर से अधिक ब्लीच किए हुए या ग्राहकों तक पहुँचने से पहले लंबे समय तक खुले गोदामों में रखे होते थे।',
  'We set out to change that by establishing direct fair-trade relationships with orchards in Kashmir, California, Mangalore, and Kerman. By packing in small weekly batches with zero chemical glazes, we preserve the natural essential oils and authentic crunch that nature intended.': 'हमने कश्मीर, कैलिफ़ोर्निया, मंगलूरु और केरमान के बागानों से सीधे निष्पक्ष व्यापार संबंध बनाए। साप्ताहिक छोटे बैच और बिना रासायनिक परत के पैकिंग से प्राकृतिक तेल और असली कुरकुरापन सुरक्षित रहता है।',
  'Founded in Virudhunagar, Tamil Nadu with a simple commitment to source clean, unbleached California almonds and dates for friends & family.': 'विरुधुनगर, तमिलनाडु में परिवार और मित्रों के लिए साफ़, बिना ब्लीच किए कैलिफ़ोर्निया बादाम और खजूर उपलब्ध कराने के संकल्प के साथ शुरुआत हुई।',
  'Partnered with Shopian walnut growers and Kerman pistachio orchards for direct single-origin harvest imports.': 'एकल-स्रोत फसल के सीधे आयात के लिए शोपियां के अखरोट किसानों और केरमान के पिस्ता बागानों से साझेदारी की।',
  'Now delivering fresh harvest dry fruits and custom festive hampers to over 28,000 households across India.': 'अब पूरे भारत में 28,000 से अधिक परिवारों तक ताज़ी फसल के मेवे और कस्टम त्योहार हैम्पर पहुँचा रहे हैं।',
  'We source generous, delicious dry fruits and nuts that bring authentic nourishment to your daily routine. Every handful starts with careful selection at peak harvest, honest ingredients, and zero artificial processing.': 'हम स्वादिष्ट और पौष्टिक मेवे चुनते हैं जो आपकी दिनचर्या में असली पोषण जोड़ें। हर मुट्ठी की शुरुआत सही समय की फसल, ईमानदार सामग्री और बिना कृत्रिम प्रसंस्करण के होती है।',
  'We are on a mission to redefine everyday snacking — bringing unbleached, single-origin dry fruits and nuts straight from accredited family orchards to your home.': 'हम रोज़ाना स्नैकिंग को बेहतर बना रहे हैं—मान्यता प्राप्त पारिवारिक बागानों से बिना ब्लीच किए, एकल-स्रोत मेवे सीधे आपके घर तक पहुँचाते हुए।',
  'From harvest selection to eco packaging, we keep our standards non-negotiable.': 'फसल के चयन से पर्यावरण-अनुकूल पैकिंग तक, हमारे मानकों से कोई समझौता नहीं होता।',
  'Not all dry fruits are created equal. Compare how AJR Nature sets a new benchmark for cleanliness, flavor, and integrity.': 'हर मेवा एक जैसा नहीं होता। देखें कि AJR Nature शुद्धता, स्वाद और ईमानदारी का नया मानक कैसे स्थापित करता है।',
  '6 Purity Commitments': 'शुद्धता के 6 संकल्प', '100% Taste & Freshness Money-Back Guarantee': 'स्वाद और ताज़गी की 100% धन-वापसी गारंटी',
  'If any pack of AJR dry fruits or nuts does not meet your expectations in size, crunch, or flavor, we will replace it or refund your order with zero questions asked.': 'यदि AJR मेवों का कोई पैक आकार, कुरकुरापन या स्वाद में आपकी अपेक्षा पूरी न करे, तो हम बिना किसी सवाल के उसे बदलेंगे या धन वापस करेंगे।',
  'Strict Size & Quality Grading': 'कड़ा आकार और गुणवत्ता वर्गीकरण', 'Only hand-selected Jumbo W240 cashews & Mammoth Kashmiri walnuts make the cut.': 'केवल हाथ से चुने जंबो W240 काजू और बड़े कश्मीरी अखरोट ही चुने जाते हैं।',
  'Zero-Plastic Initiative': 'शून्य-प्लास्टिक पहल', 'Eliminated single-use plastics by introducing woven jute pouches, reusable glass jars, and laser-engraved wooden boxes.': 'बुने जूट पाउच, दोबारा उपयोग योग्य काँच के जार और लेज़र-नक्काशी वाले लकड़ी बॉक्स अपनाकर एकल-उपयोग प्लास्टिक हटाया।',
  'Direct Farmer Trade': 'किसानों से सीधा व्यापार', 'Fair trade contracts that pay 25% above market rates directly to single-origin growers.': 'एकल-स्रोत किसानों को बाज़ार दर से 25% अधिक सीधे भुगतान करने वाले निष्पक्ष व्यापार अनुबंध।',
  'Peak Season Harvesting': 'मुख्य मौसम में कटाई', 'We partner with accredited orchards in Kashmir, California, and Iran that harvest at ideal maturity for richest natural flavor.': 'हम कश्मीर, कैलिफ़ोर्निया और ईरान के मान्यता प्राप्त बागानों से साझेदारी करते हैं, जहाँ भरपूर प्राकृतिक स्वाद के लिए सही पकाव पर फसल काटी जाती है।',
  'Small-Batch Nitrogen Flush': 'छोटे बैच में नाइट्रोजन पैकिंग', 'Packed in small batches within hours of roasting to lock in natural moisture, crunch, and aroma without preservatives.': 'भुनाई के कुछ घंटों में छोटे बैच में पैक, ताकि बिना प्रिज़र्वेटिव प्राकृतिक नमी, कुरकुरापन और सुगंध सुरक्षित रहें।',
  'Zero Oil Glazes': 'तेल की परत बिल्कुल नहीं', 'No cheap palm oil coats, no glucose weight additives. Pure dry roasted goodness.': 'न सस्ते पाम ऑयल की परत, न वज़न बढ़ाने वाला ग्लूकोज़—केवल शुद्ध सूखे-भुने मेवे।',
  'Master Taster Guarantee': 'मुख्य स्वाद विशेषज्ञ की गारंटी', 'Every single batch of almonds, cashews, dates, and walnuts is sampled by our master quality tasters before being approved for nitrogen packaging.': 'बादाम, काजू, खजूर और अखरोट के हर बैच को नाइट्रोजन पैकिंग से पहले हमारे गुणवत्ता विशेषज्ञ चखकर मंज़ूर करते हैं।',
  'Uncompromising Standards': 'अटल गुणवत्ता मानक', 'Our Sourcing Journey': 'हमारी स्रोत यात्रा', 'Customer Voices': 'ग्राहकों की आवाज़', 'Bring Goodness Home': 'अच्छाई घर लाएँ',
  '01 / Heritage': '01 / विरासत', 'We bypass commodity traders to partner directly with single-origin family orchards across the world’s finest growing micro-climates.': 'हम बिचौलियों के बजाय दुनिया के श्रेष्ठ उत्पादन क्षेत्रों में स्थित एकल-स्रोत पारिवारिक बागानों से सीधे साझेदारी करते हैं।',
  'Kernel Grade & Sizing': 'दाने का ग्रेड और आकार', 'Hand-sorted Jumbo W240 Cashews & Mammoth Kashmiri Walnuts': 'हाथ से छाँटे जंबो W240 काजू और बड़े कश्मीरी अखरोट', 'Mixed size fragments, split kernels, & Grade-B defect pieces': 'मिश्रित आकार, टूटे दाने और ग्रेड-B के दोषयुक्त टुकड़े',
  'Chemical Bleaching & Treatment': 'रासायनिक ब्लीचिंग और उपचार', '100% Unbleached & Chemical-Free natural shade': '100% बिना ब्लीच किया, रसायन-मुक्त प्राकृतिक रंग', 'Chlorine bleached or sulfur dioxide treated for artificial shine': 'कृत्रिम चमक के लिए क्लोरीन ब्लीच या सल्फर डाइऑक्साइड उपचार',
  'Moisture Control & Crispness': 'नमी नियंत्रण और कुरकुरापन', 'Nitrogen-flushed small batches within 24h of roasting': 'भुनाई के 24 घंटे के भीतर नाइट्रोजन-फ्लश छोटे बैच', 'Stored in open burlap sacks in warehouses for 6–12 months': 'गोदामों में खुले बोरे में 6–12 महीने भंडारण',
  'Additives & Preservatives': 'मिलावट और प्रिज़र्वेटिव', 'Zero mineral oil, no added sugar, zero synthetic glazes': 'न मिनरल ऑयल, न अतिरिक्त चीनी, न कृत्रिम परत', 'Coated in cheap vegetable oil or glucose syrup to add weight': 'वज़न बढ़ाने के लिए सस्ते वनस्पति तेल या ग्लूकोज़ सिरप की परत',
  'Packaging & Shelf Preservation': 'पैकेजिंग और ताज़गी संरक्षण', 'Eco Jute Pouches, Reusable Glass Jars & Laser Wood Hampers': 'जूट पाउच, दोबारा उपयोग योग्य काँच के जार और लेज़र-नक्काशी वाले लकड़ी हैम्पर', 'Thin single-use plastic bags susceptible to oxidation': 'ऑक्सीकरण के प्रति संवेदनशील पतली एकल-उपयोग प्लास्टिक थैलियाँ',
  'Farmer Pay & Traceability': 'किसान भुगतान और स्रोत पता', 'Direct Fair-Trade contracts guaranteeing 25% above market rate': 'बाज़ार दर से 25% अधिक सुनिश्चित करने वाले सीधे निष्पक्ष व्यापार अनुबंध', 'Complex middleman supply chains exploiting small growers': 'छोटे किसानों को नुकसान पहुँचाने वाली जटिल बिचौलिया शृंखला',
  'Need a hand choosing, gifting, or ordering in bulk?': 'चुनने, उपहार देने या थोक ऑर्डर में मदद चाहिए?', 'Talk to us': 'हमसे बात करें', 'Ask the AJR team': 'AJR टीम से पूछें',
  'Concierge & Customer Care': 'व्यक्तिगत और ग्राहक सहायता', 'A personal reply, never an automated queue.': 'व्यक्तिगत उत्तर—कभी स्वचालित कतार नहीं।', 'WhatsApp Support': 'WhatsApp सहायता', 'Open WhatsApp': 'WhatsApp खोलें', 'Write Email': 'ईमेल लिखें', 'Write to us': 'हमें लिखें',
  'We would love': 'हमें खुशी होगी', 'to hear from you.': 'आपसे सुनकर।', 'Tell us what': 'हमें बताएँ आपको', 'you need.': 'क्या चाहिए।',
  'AJR Live Enquiry Desk': 'AJR लाइव सहायता केंद्र', 'LIVE ENQUIRY': 'लाइव पूछताछ', 'How can we help?': 'हम आपकी कैसे मदद कर सकते हैं?', 'Choose your enquiry type.': 'अपनी पूछताछ का प्रकार चुनें।',
  'Enquiry desk online': 'पूछताछ केंद्र ऑनलाइन', 'Product & Retail Support': 'उत्पाद और खुदरा सहायता', 'Custom Festive Hampers': 'कस्टम त्योहार हैम्पर', 'Custom corporate gifts and retail partnerships.': 'कस्टम कॉर्पोरेट उपहार और खुदरा साझेदारी।', 'Corporate Bulk Inquiry': 'कॉर्पोरेट थोक पूछताछ', 'Press & Collaborations': 'मीडिया और सहयोग',
  'Product help, gifting plans, bulk orders, and partnerships — send one enquiry and our team receives it instantly.': 'उत्पाद सहायता, उपहार योजना, थोक ऑर्डर या साझेदारी—एक पूछताछ भेजें और हमारी टीम उसे तुरंत प्राप्त करेगी।',
  'Your Name': 'आपका नाम', 'Full Name': 'पूरा नाम', 'Email Address': 'ईमेल पता', 'Phone / WhatsApp': 'फ़ोन / WhatsApp', 'Message / Special Requests': 'संदेश / विशेष अनुरोध', 'Tell us how we can help...': 'बताएँ कि हम आपकी कैसे मदद कर सकते हैं…',
  'Send Inquiry': 'पूछताछ भेजें', 'Sending…': 'भेजा जा रहा है…', 'Sent directly to our team': 'सीधे हमारी टीम को भेजा जाएगा', 'Message Received!': 'संदेश मिल गया!', 'Send another message': 'एक और संदेश भेजें',
  'Thank you for reaching out. A real person is reviewing your inquiry — we will be in touch within 1 working day.': 'संपर्क करने के लिए धन्यवाद। हमारी टीम का एक सदस्य आपकी पूछताछ देख रहा है; हम एक कार्यदिवस में संपर्क करेंगे।',
  '100% Confidential. Replies within 2 hours during business hours.': '100% गोपनीय। कार्य समय में 2 घंटे के भीतर उत्तर।', 'Human Support Promise': 'मानवीय सहायता का वादा',
  'Share the details that matter.': 'ज़रूरी विवरण साझा करें।', 'Receive a personal reply within business hours.': 'कार्य समय में व्यक्तिगत उत्तर पाएँ।', 'Private, secure, and read by a real AJR team member.': 'निजी, सुरक्षित और AJR टीम के सदस्य द्वारा पढ़ा गया।',
  'When you contact AJR, a real team member reads and replies to your message. No bots, no mystery queues.': 'AJR से संपर्क करने पर हमारी टीम का सदस्य आपका संदेश पढ़कर जवाब देता है—न बॉट, न अनजान कतार।',
  'Whether you have a product question, need custom festival hampers, or want to discuss bulk corporate gifting, our human team replies promptly.': 'उत्पाद, कस्टम त्योहार हैम्पर या कॉर्पोरेट थोक उपहार—हमारी टीम हर सवाल का शीघ्र जवाब देती है।',
  'Instant support for order tracking, gift guidance & quick recommendations.': 'ऑर्डर ट्रैकिंग, उपहार मार्गदर्शन और त्वरित सुझावों के लिए तुरंत सहायता।', 'Avg Reply: ~5 Mins': 'औसत उत्तर: लगभग 5 मिनट',
  'For custom hampers, corporate gifting decks, and retail wholesale inquiries.': 'कस्टम हैम्पर, कॉर्पोरेट उपहार प्रस्तुति और खुदरा थोक पूछताछ के लिए।', 'Avg Reply: < 2 Hours': 'औसत उत्तर: 2 घंटे से कम',
  'Prefer a human voice? Call our Virudhunagar flagship studio directly.': 'सीधे बात करना चाहते हैं? हमारे विरुधुनगर मुख्य स्टूडियो को कॉल करें।',
  'Direct Contact Information': 'सीधी संपर्क जानकारी', 'WhatsApp Concierge (Fastest)': 'WhatsApp सहायता (सबसे तेज़)', 'Email Desk': 'ईमेल सहायता', 'Studio Call Desk': 'स्टूडियो कॉल सहायता',
  'Find us in Virudhunagar': 'हमें विरुधुनगर में पाएँ', 'Open the map for directions to our studio and tasting counter.': 'हमारे स्टूडियो और टेस्टिंग काउंटर का रास्ता मानचित्र पर देखें।',
  'Step into our Virudhunagar studio to taste fresh dry fruit batches, inspect royal wooden gift hampers, and consult with our master tasters.': 'ताज़े मेवों का स्वाद लेने, लकड़ी के प्रीमियम हैम्पर देखने और विशेषज्ञों से सलाह लेने के लिए हमारे विरुधुनगर स्टूडियो आएँ।', 'Virudhunagar Flagship': 'विरुधुनगर मुख्य केंद्र', 'Studio & Tasting Counter': 'स्टूडियो और टेस्टिंग काउंटर', 'Complimentary Saffron Almond Milk': 'मानार्थ केसर बादाम दूध',
  'Studio Open Now (Until 7:00 PM IST)': 'स्टूडियो अभी खुला है (शाम 7:00 बजे IST तक)', 'Studio Currently Closed (Opens 10:00 AM IST)': 'स्टूडियो अभी बंद है (सुबह 10:00 बजे IST खुलेगा)', 'Free Private Parking': 'मुफ़्त निजी पार्किंग', 'Sample Tasting Counter': 'नमूना टेस्टिंग काउंटर', 'Same-Day Custom Engraving': 'उसी दिन कस्टम नक्काशी',
  'First taste of': 'पहला स्वाद', 'something good.': 'कुछ अच्छा।', 'First taste of something good.': 'कुछ अच्छे का पहला स्वाद।', 'Milestones of': 'यात्रा के पड़ाव', growing: 'बढ़ते हुए', 'by families.': 'परिवारों के साथ।',
  'Rooted in good things': 'अच्छी चीज़ों में जड़ें', 'Crafted for living.': 'जीवन के लिए तैयार।', 'A flourishing': 'फलता-फूलता', business: 'व्यवसाय', 'There is magic in an honest handful.': 'ईमानदार मुट्ठी में एक अलग जादू होता है।',
  'Corporate & Wedding Bulk Pricing': 'कॉर्पोरेट और विवाह थोक मूल्य', 'Cost Estimator': 'लागत अनुमानक', 'Estimated Quantity': 'अनुमानित मात्रा', 'Packaging Style Preference': 'पैकेजिंग शैली',
  'Interactive Hamper': 'इंटरैक्टिव हैम्पर', 'Interactive Hamper Studio': 'इंटरैक्टिव हैम्पर स्टूडियो', '/ unit': '/ इकाई', 'Base Tier Price': 'मूल श्रेणी मूल्य', 'Effective Cost per Unit': 'प्रति इकाई प्रभावी लागत', 'Volume Discount': 'थोक छूट', 'Add 1g Kashmiri Saffron Jar': '1 ग्राम कश्मीरी केसर जार जोड़ें',
  'Free Insured Express Shipping Included': 'मुफ़्त बीमित एक्सप्रेस डिलीवरी शामिल', 'Includes GST Invoice & Doorstep Delivery Across India': 'GST चालान और पूरे भारत में घर तक डिलीवरी शामिल', 'Request Official Corporate Deck & Sample Box': 'आधिकारिक कॉर्पोरेट प्रस्तुति और नमूना बॉक्स माँगें',
  'Calculate instant estimated costs for corporate hampers, festival gifts, and wedding favors with volume discounts.': 'थोक छूट के साथ कॉर्पोरेट हैम्पर, त्योहार उपहार और विवाह रिटर्न गिफ्ट की अनुमानित लागत तुरंत जानें।', '1. Choose Gift Box Style': '1. उपहार बॉक्स की शैली चुनें', 'Classic Eco Jute Bag': 'क्लासिक पर्यावरण-अनुकूल जूट बैग', 'Festive Gold Foil Box': 'त्योहार गोल्ड फ़ॉइल बॉक्स', 'Royal Keepsake Wooden Chest': 'प्रीमियम लकड़ी का स्मृति बॉक्स',
  '2. Select Order Quantity:': '2. ऑर्डर मात्रा चुनें:', '10 units': '10 इकाइयाँ', '50 units (10% OFF)': '50 इकाइयाँ (10% छूट)', '100 units (15% OFF)': '100 इकाइयाँ (15% छूट)', '250+ units (20% OFF)': '250+ इकाइयाँ (20% छूट)', '3. Select Custom Branding Add-ons': '3. कस्टम ब्रांडिंग विकल्प चुनें', 'Custom Corporate Logo Engraving': 'कस्टम कॉर्पोरेट लोगो नक्काशी', 'Custom Brand Ribbon & Card': 'कस्टम ब्रांड रिबन और कार्ड',
  'Custom Branding Add-ons': 'कस्टम ब्रांडिंग विकल्प', 'Estimated Grand Total': 'अनुमानित कुल राशि', 'Volume Discount Applied': 'थोक छूट लागू', 'Instant Quote Estimate': 'तुरंत अनुमान पाएँ',
  'Build Your Custom Harvest Box': 'अपना कस्टम हार्वेस्ट बॉक्स बनाएँ', 'Pick up to 4 premium dry fruits, choose your pack size, and select signature packaging.': 'अधिकतम 4 प्रीमियम मेवे चुनें, पैक आकार और खास पैकेजिंग तय करें।',
  'Select 2 to 4 Dry Fruits & Nuts': '2 से 4 मेवे चुनें', 'Choose Pack Quantity': 'पैक मात्रा चुनें', 'Select Packaging Finish': 'पैकेजिंग फ़िनिश चुनें', 'Selected Add-ons': 'चुने गए अतिरिक्त विकल्प',
  'Your Signature Creation': 'आपकी खास पसंद', 'Custom Box Subtotal': 'कस्टम बॉक्स उप-योग', 'Add Custom Box to Cart': 'कस्टम बॉक्स कार्ट में जोड़ें', 'Custom Box Added!': 'कस्टम बॉक्स जुड़ गया!',
  'Personalised Wellness': 'व्यक्तिगत सेहत', 'What is your health focus today? Pick a goal to discover nutrients tailored to your body.': 'आज आपका स्वास्थ्य लक्ष्य क्या है? अपने लिए उपयुक्त पोषक तत्व जानने के लिए लक्ष्य चुनें।',
  'Recommended Superfoods': 'सुझाए गए सुपरफूड', 'Explore Wellness Collection': 'वेलनेस संग्रह देखें', 'Heart & Cholesterol': 'हृदय और कोलेस्ट्रॉल', 'Energy & Stamina': 'ऊर्जा और सहनशक्ति', 'Brain & Memory': 'मस्तिष्क और स्मृति', 'Radiant Skin': 'दमकती त्वचा',
  'Global Sourcing Transparency': 'वैश्विक स्रोत पारदर्शिता', 'Where Every': 'जहाँ हर', 'Handful Begins': 'मुट्ठी की शुरुआत होती है', Elevation: 'ऊँचाई', 'Growing Climate': 'उपज की जलवायु', 'Peak Harvest': 'मुख्य फसल समय',
  'The AJR Difference': 'AJR की खासियत', 'Why Pure Sourcing': 'शुद्ध स्रोत क्यों', Matters: 'महत्त्वपूर्ण है', 'Quality Benchmark': 'गुणवत्ता मानक', 'Generic Market Brands': 'सामान्य बाज़ार ब्रांड',
  'Visit Our Studio & Tasting Room': 'हमारे स्टूडियो और टेस्टिंग रूम आएँ', 'Experience the Harvest': 'फसल का अनुभव करें', 'In Person': 'स्वयं आकर', 'Get Directions on Google Maps': 'Google Maps पर रास्ता देखें', 'Call Studio': 'स्टूडियो को कॉल करें',
  Workspace: 'कार्यस्थल', 'Private workspace': 'निजी कार्यस्थल', 'Visit your store': 'अपना स्टोर देखें', 'Administrator settings': 'व्यवस्थापक सेटिंग्स', 'THE AJR WORKSPACE': 'AJR कार्यस्थल',
  'STORE WORKSPACE': 'स्टोर कार्यस्थल', 'Your store, thoughtfully managed': 'आपका स्टोर, समझदारी से प्रबंधित', 'Sign in with your administrator account to tend to your store.': 'स्टोर प्रबंधित करने के लिए व्यवस्थापक खाते से लॉग इन करें।',
  'Enter your workspace': 'अपने कार्यस्थल में प्रवेश करें', 'Enter your email address': 'अपना ईमेल पता दर्ज करें', 'Enter your password': 'अपना पासवर्ड दर्ज करें', 'Signing in…': 'लॉग इन हो रहा है…',
  'Welcome back.': 'फिर से स्वागत है।', 'Welcome back. Here’s how your store is doing.': 'फिर से स्वागत है। आपके स्टोर की वर्तमान स्थिति यहाँ है।', 'Your products, your people, your progress.': 'आपके उत्पाद, आपके ग्राहक और आपकी प्रगति।',
  'Made for everyday growth.': 'हर दिन की प्रगति के लिए।', 'AJR Pure Sourcing': 'AJR शुद्ध स्रोत',
  'A little care.': 'थोड़ी-सी देखभाल।', 'A thoughtful space to bring it all together.': 'सब कुछ सहजता से सँभालने की एक सुविचारित जगह।', 'Back to the store': 'स्टोर पर वापस जाएँ', 'Checking session…': 'सत्र की जाँच हो रही है…',
  'Skip to workspace': 'कार्यस्थल पर जाएँ', 'Store navigation': 'स्टोर नेविगेशन', 'Administration': 'प्रशासन', Admin: 'व्यवस्थापक', 'See the customer experience': 'ग्राहक अनुभव देखें',
  'Good things are': 'अच्छी चीज़ें', 'growing.': 'बढ़ रही हैं।', Refresh: 'रीफ़्रेश करें', 'Add product': 'उत्पाद जोड़ें', 'View orders': 'ऑर्डर देखें', 'Offline sales': 'ऑफ़लाइन बिक्री', 'Online sales': 'ऑनलाइन बिक्री',
  'Signed-in administrator': 'लॉग इन व्यवस्थापक', 'Administrator access list': 'व्यवस्थापक पहुँच सूची', 'These accounts are permitted to open the admin workspace.': 'इन खातों को व्यवस्थापक कार्यस्थल खोलने की अनुमति है।',
  'Total revenue': 'कुल आय', 'Total orders': 'कुल ऑर्डर', 'Pending fulfilments': 'लंबित पूर्ति', 'Customer messages': 'ग्राहक संदेश', unread: 'अपठित', total: 'कुल',
  'Gathering your sales…': 'बिक्री का विवरण जुटाया जा रहा है…', 'Updating your store overview…': 'स्टोर का अवलोकन अपडेट हो रहा है…', 'Revenue will take shape as your first orders arrive.': 'पहले ऑर्डर आने के साथ आय का विवरण दिखाई देगा।',
  'Some store data couldn’t be loaded. Refresh to try again.': 'स्टोर का कुछ डेटा लोड नहीं हो सका। फिर प्रयास करने के लिए रीफ़्रेश करें।', 'A little overview. A bigger picture.': 'संक्षिप्त अवलोकन, पूरी तस्वीर।',
  'Add Product': 'उत्पाद जोड़ें', 'Edit Product': 'उत्पाद संपादित करें', 'Create product': 'उत्पाद बनाएँ', 'Save product': 'उत्पाद सहेजें', 'Save changes': 'बदलाव सहेजें', 'Saving…': 'सहेजा जा रहा है…',
  'Product name *': 'उत्पाद का नाम *', 'Type / category': 'प्रकार / श्रेणी', 'Price per kg (₹) *': 'प्रति किलो मूल्य (₹) *', Stock: 'स्टॉक', Description: 'विवरण', 'Product image': 'उत्पाद चित्र', Upload: 'अपलोड करें', Uploading: 'अपलोड हो रहा है',
  'Show this product in the shop': 'यह उत्पाद दुकान में दिखाएँ', 'Varieties (price per kg)': 'किस्में (प्रति किलो मूल्य)', 'Variety name': 'किस्म का नाम', 'Add variety': 'किस्म जोड़ें', 'Pack sizes in the gram dropdown': 'ग्राम सूची में पैक आकार',
  'Order detail': 'ऑर्डर विवरण', Customer: 'ग्राहक', Date: 'तारीख', Status: 'स्थिति', Items: 'वस्तुएँ', Summary: 'सारांश', Paid: 'भुगतान हुआ', Unpaid: 'भुगतान बाकी', Refunded: 'धनवापसी', Shipped: 'भेज दिया गया', Completed: 'पूरा हुआ', Confirmed: 'पुष्टि हुई',
  'Customer name *': 'ग्राहक का नाम *', 'Walk-in customer name': 'काउंटर ग्राहक का नाम', 'Product sold *': 'बेचा गया उत्पाद *', 'Select a shop product…': 'दुकान का उत्पाद चुनें…', Units: 'इकाइयाँ', 'Note (optional)': 'नोट (वैकल्पिक)', 'Add Offline Order': 'ऑफ़लाइन ऑर्डर जोड़ें',
  'Search AJR frequently asked questions': 'AJR के अक्सर पूछे जाने वाले प्रश्न खोजें', 'Find your answer': 'अपना उत्तर पाएँ', 'Still curious?': 'अब भी कोई सवाल है?', 'Everything you might wonder before your first handful arrives.': 'पहली मुट्ठी आने से पहले आपके हर सवाल का जवाब।',
  'No answers match that search just yet.': 'इस खोज से अभी कोई उत्तर नहीं मिला।', 'Clear FAQ search': 'प्रश्न खोज साफ़ करें', 'Search questions (e.g. freshness, organic, bulk)...': 'सवाल खोजें (जैसे ताज़गी, ऑर्गेनिक, थोक)…',
  '© 2026 AJR Essence of Nature. All rights reserved.': '© 2026 AJR Essence of Nature. सर्वाधिकार सुरक्षित।', 'AJR site footer': 'AJR साइट फ़ुटर',
}

// Copy used by the richer interactive sections.  Keeping these phrases as
// complete sentences (rather than translating word-by-word) makes the Tamil
// read naturally and also gives the DOM fallback a dependable exact match.
const tamilExperienceTranslations: Record<string, string> = {
  'Goodness worth sharing.': 'பகிர்ந்துகொள்ளத் தகுந்த நன்மை.',
  'Goodness': 'நன்மை', 'worth sharing.': 'பகிர்ந்துகொள்ளத் தகுந்தது.',
  'Handpicked California almonds, jumbo golden cashews, Medjool dates and Kashmiri walnuts — curated for daily wellness and royal gifting.': 'கையால் தேர்ந்தெடுக்கப்பட்ட கலிஃபோர்னியா பாதாம், ஜம்போ தங்க முந்திரி, மெட்ஜூல் பேரீச்சை மற்றும் காஷ்மீர் வால்நட்—அன்றாட நலனுக்கும் சிறப்பான பரிசளிப்புக்கும் தேர்ந்தெடுக்கப்பட்டவை.',
  'Good food is': 'நல்ல உணவு', always: 'எப்போதும்',
  'Royal Celebrations & Hampers': 'சிறப்பான கொண்டாட்டங்கள் மற்றும் பரிசுத் தொகுப்புகள்',
  'Royal Celebrations & Gift Collections': 'சிறப்பான கொண்டாட்டங்கள் மற்றும் பரிசுத் தொகுப்புகள்',
  'From Grove to Table': 'தோப்பிலிருந்து உங்கள் மேசை வரை', 'How every pack': 'ஒவ்வொரு பொதியும்', 'finds you.': 'உங்களை வந்தடையும் விதம்.',
  'Culinary Inspiration': 'சமையல் ஊக்கம்', 'Simple ways to enjoy everyday superfoods': 'அன்றாட சத்துணவுகளை ரசிக்க எளிய வழிகள்',
  'Customer Voices': 'வாடிக்கையாளர் கருத்துகள்', Loved: 'விரும்பப்படுகிறது', 'by families.': 'குடும்பங்களால்.',
  'AJR support library': 'AJR உதவி மையம்', 'Questions,': 'கேள்விகளா?', answered: 'பதில்கள் இங்கே',
  Add: 'கூடையில் சேர்க்கவும்', 'View Details': 'விவரங்களைக் காண்க', FROM: 'விலை தொடக்கம்',
  'Continue your healthy snacking journey with premium farm-picked dry fruits, wellness blends, and thoughtful gifting.': 'பண்ணைகளிலிருந்து தேர்ந்தெடுக்கப்பட்ட உயர்தர உலர் பழங்கள், நலக் கலவைகள் மற்றும் அன்பான பரிசுகளுடன் உங்கள் ஆரோக்கியமான சிற்றுண்டிப் பயணத்தைத் தொடருங்கள்.',
  'Fresh sourcing • Small batch roasting': 'புதிய நேரடி கொள்முதல் • சிறு தொகுதியாக வறுத்தல்',
  'Member Login': 'உறுப்பினர் உள்நுழைவு',
  'Sign in to manage your orders and nutrition preferences.': 'உங்கள் ஆர்டர்களையும் ஊட்டச்சத்து விருப்பங்களையும் நிர்வகிக்க உள்நுழையுங்கள்.',
  or: 'அல்லது', 'New to AJR?': 'AJR-க்கு புதியவரா?',
  'Please wait...': 'சற்று காத்திருக்கவும்...',
  'Join our community for better nutrition, curated product selections, pantry planning, and beautiful seasonal harvest gifts.': 'மேம்பட்ட ஊட்டச்சத்து, தேர்ந்தெடுக்கப்பட்ட பொருட்கள், உணவறைத் திட்டமிடல் மற்றும் அழகிய பருவகாலப் பரிசுகளுக்காக எங்கள் சமூகத்தில் இணையுங்கள்.',
  'Member savings • Gift collections': 'உறுப்பினர் சேமிப்பு • பரிசுத் தொகுப்புகள்',
  'Healthy habits start here': 'ஆரோக்கியமான பழக்கங்கள் இங்கிருந்து தொடங்குகின்றன', 'Sign up': 'பதிவு செய்யுங்கள்',
  'Build your wellness pantry and save your favorites.': 'உங்கள் ஆரோக்கிய உணவுத் தொகுப்பை உருவாக்கி, விருப்பமானவற்றைச் சேமியுங்கள்.',
  'Create password': 'கடவுச்சொல்லை உருவாக்கவும்', 'Creating account...': 'கணக்கு உருவாக்கப்படுகிறது...',
  'Rooted in good things': 'நல்லவற்றில் வேரூன்றியது', 'A little care.': 'சிறிதளவு அக்கறை.', 'A flourishing': 'செழித்து வளரும்', business: 'வணிகம்.',
  'Your products, your people, your progress.': 'உங்கள் பொருட்கள், உங்கள் மக்கள், உங்கள் வளர்ச்சி.',
  'A thoughtful space to bring it all together.': 'அனைத்தையும் ஒருங்கிணைக்க உருவாக்கப்பட்ட சிறப்பான இடம்.',
  'Your store, thoughtfully managed': 'உங்கள் கடை, அக்கறையுடன் நிர்வகிக்கப்படுகிறது', 'Welcome back.': 'மீண்டும் வரவேற்கிறோம்.',
  'Sign in with your administrator account to tend to your store.': 'உங்கள் கடையை நிர்வகிக்க நிர்வாகி கணக்கில் உள்நுழையுங்கள்.',
  'Enter your password': 'உங்கள் கடவுச்சொல்லை உள்ளிடவும்', 'Signing in…': 'உள்நுழைகிறது…',
  'Enter your workspace': 'நிர்வாகப் பகுதிக்குள் செல்லவும்', 'Back to the store': 'கடைக்குத் திரும்பவும்',
  'AJR store workspace': 'AJR கடை நிர்வாகப் பகுதி', 'Skip to workspace': 'நிர்வாகப் பகுதிக்குச் செல்லவும்',
  'Close navigation': 'வழிசெலுத்தலை மூடவும்', 'Store navigation': 'கடை வழிசெலுத்தல்', 'STORE WORKSPACE': 'கடை நிர்வாகம்', Admin: 'நிர்வாகி',
  'A little overview. A bigger picture.': 'சிறிய கண்ணோட்டம். முழுமையான பார்வை.',
  'Good things are': 'நல்லவை', growing: 'வளர்கின்றன.', 'Welcome back. Here’s how your store is doing.': 'மீண்டும் வரவேற்கிறோம். உங்கள் கடையின் தற்போதைய நிலை இதோ.',
  'Total revenue': 'மொத்த வருவாய்', 'Total orders': 'மொத்த ஆர்டர்கள்', 'Store products': 'கடைப் பொருட்கள்', 'Customer messages': 'வாடிக்கையாளர் செய்திகள்',
  'awaiting fulfilment': 'நிறைவேற்றக் காத்திருக்கின்றன', 'unread messages': 'படிக்காத செய்திகள்',
  'Some store data couldn’t be loaded. Refresh to try again.': 'சில கடைத் தரவுகளை ஏற்ற முடியவில்லை. மீண்டும் முயற்சிக்க புதுப்பிக்கவும்.',
  'Updating your store overview…': 'கடை கண்ணோட்டம் புதுப்பிக்கப்படுகிறது…', 'Gathering your sales…': 'விற்பனைத் தகவல்கள் சேகரிக்கப்படுகின்றன…',
  'Your next chapter starts here': 'உங்கள் அடுத்த வளர்ச்சி இங்கிருந்து தொடங்குகிறது', 'Revenue will take shape as your first orders arrive.': 'முதல் ஆர்டர்கள் வரும்போது வருவாய் விவரங்கள் இங்கே தோன்றும்.',
  'View orders': 'ஆர்டர்களைக் காண்க', 'Online sales': 'இணைய விற்பனை', 'Offline sales': 'நேரடி விற்பனை', 'Pending fulfilments': 'நிலுவையிலுள்ள விநியோகங்கள்',
  'Workspace access': 'நிர்வாக அணுகல்', 'Signed-in administrator': 'உள்நுழைந்த நிர்வாகி', 'Administrator access list': 'நிர்வாகி அணுகல் பட்டியல்',
  'These accounts are permitted to open the admin workspace.': 'இந்தக் கணக்குகளுக்கு நிர்வாகப் பகுதியைத் திறக்க அனுமதி உள்ளது.',
  'Order detail': 'ஆர்டர் விவரம்', Customer: 'வாடிக்கையாளர்', Channel: 'விற்பனை வழி', Date: 'தேதி', Items: 'பொருட்கள்', Status: 'நிலை',
  'Close order details': 'ஆர்டர் விவரங்களை மூடவும்', 'Create product': 'பொருளை உருவாக்கவும்', 'Edit Product': 'பொருளைத் திருத்தவும்', 'Add Product': 'பொருளைச் சேர்க்கவும்',
  'Close product form': 'பொருள் படிவத்தை மூடவும்', 'Save changes': 'மாற்றங்களைச் சேமிக்கவும்', 'Save product': 'பொருளைச் சேமிக்கவும்', 'Saving…': 'சேமிக்கப்படுகிறது…',
  'A sale from your store': 'உங்கள் கடையின் நேரடி விற்பனை', 'Add Offline Order': 'நேரடி ஆர்டரைச் சேர்க்கவும்', 'Close offline order form': 'நேரடி ஆர்டர் படிவத்தை மூடவும்',
  'Customer name *': 'வாடிக்கையாளர் பெயர் *', 'Walk-in customer name': 'நேரில் வந்த வாடிக்கையாளர் பெயர்', 'Email (optional)': 'மின்னஞ்சல் (விருப்பம்)',
  'Product sold *': 'விற்கப்பட்ட பொருள் *', 'Select a shop product…': 'கடைப் பொருளைத் தேர்ந்தெடுக்கவும்…', 'Note (optional)': 'குறிப்பு (விருப்பம்)',
  'In-store / counter note': 'கடை / விற்பனை மேசைக் குறிப்பு', 'Product name *': 'பொருளின் பெயர் *', 'Type / category': 'வகை / பிரிவு',
  'Price per kg (₹) *': 'ஒரு கிலோவின் விலை (₹) *', 'Pack sizes in the gram dropdown': 'கிராம் தேர்விலுள்ள பொதி அளவுகள்', 'Clear all': 'அனைத்தையும் நீக்கு',
  'Varieties (price per kg)': 'வகைகள் (ஒரு கிலோவின் விலை)', 'Add variety': 'வகையைச் சேர்க்கவும்', 'Variety name': 'வகையின் பெயர்',
  Description: 'விளக்கம்', 'Short description shown on the product page': 'பொருள் பக்கத்தில் காட்டப்படும் சுருக்கமான விளக்கம்', 'Product image': 'பொருள் படம்', Upload: 'பதிவேற்று', Uploading: 'பதிவேற்றப்படுகிறது',
  Stock: 'கையிருப்பு', Origin: 'மூலம்', 'Nutrients (comma separated)': 'ஊட்டச்சத்துகள் (காற்புள்ளியால் பிரிக்கவும்)', 'Show this product in the shop': 'இந்தப் பொருளைக் கடையில் காட்டவும்',
  'Gifting made': 'பரிசளிப்பை', unforgettable: 'மறக்கமுடியாததாக மாற்றுங்கள்', 'unforgettable.': 'மறக்கமுடியாததாக மாற்றுங்கள்.',
  'Elevate weddings, festive celebrations, and corporate milestones with AJR handcrafted wooden presentation boxes, embossed gold foils, and custom handwritten cards.': 'AJR கைவினை மரப் பெட்டிகள், பொறிக்கப்பட்ட தங்க நிறப் பொதிகள் மற்றும் தனிப்பயன் கையெழுத்து அட்டைகளுடன் திருமணம், விழா மற்றும் நிறுவன நிகழ்வுகளை மேலும் சிறப்பாக்குங்கள்.',
  'Royal Festive Gift Box': 'AJR சிறப்பு விழாக்காலப் பரிசுப் பெட்டி',
  'Three rigorous steps between harvest and your table — zero shortcuts, nothing rushed.': 'அறுவடையிலிருந்து உங்கள் மேசை வரை மூன்று கடுமையான தரநிலைகள்—குறுக்குவழியோ அவசரமோ இல்லை.',
  'Peak Season Harvesting': 'உச்ச பருவ அறுவடை', 'Strict Size & Quality Grading': 'கடுமையான அளவு மற்றும் தரத் தேர்வு', 'Small-Batch Nitrogen Flush': 'சிறு தொகுதி நைட்ரஜன் பாதுகாப்புப் பொதி',
  'We partner with accredited orchards in Kashmir, California, and Iran that harvest at ideal maturity for richest natural flavor.': 'செறிவான இயற்கைச் சுவைக்காக சரியான முதிர்ச்சியில் அறுவடை செய்யும் காஷ்மீர், கலிஃபோர்னியா மற்றும் ஈரானின் அங்கீகரிக்கப்பட்ட தோட்டங்களுடன் இணைகிறோம்.',
  'Every batch is sorted by hand and optical scanners. Only whole, generous kernels make it into our signature pouches.': 'ஒவ்வொரு தொகுதியும் கையாலும் ஒளி வருடிகளாலும் தரம் பிரிக்கப்படுகிறது. முழுமையான உயர்தரப் பருப்புகள் மட்டுமே எங்கள் சிறப்புப் பொதிகளில் இடம்பெறுகின்றன.',
  'Packed in small batches within hours of roasting to lock in natural moisture, crunch, and aroma without preservatives.': 'பாதுகாப்புப் பொருட்களின்றி இயற்கை ஈரப்பதம், மொறுமொறுப்பு மற்றும் மணத்தைப் பாதுகாக்க வறுத்த சில மணி நேரத்திலேயே சிறு தொகுதிகளாகப் பொதியப்படுகிறது.',
  'Saffron & Almond Golden Elixir': 'குங்குமப்பூ பாதாம் பானம்', 'Honey Date & Walnut Energy Bites': 'தேன், பேரீச்சை மற்றும் வால்நட் சத்துருண்டைகள்', 'Herb-Roasted Cashew Snack Bowl': 'மூலிகை வறுத்த முந்திரி சிற்றுண்டி',
  '10 mins prep': '10 நிமிடத் தயாரிப்பு', '15 mins prep': '15 நிமிடத் தயாரிப்பு', '8 mins prep': '8 நிமிடத் தயாரிப்பு', 'Shop Ingredients': 'தேவையான பொருட்களை வாங்கவும்',
  'Warm almond milk infused with Kashmiri saffron strands, cardamom, and crushed AJR Royal Almonds for bedtime calm.': 'காஷ்மீர் குங்குமப்பூ, ஏலக்காய் மற்றும் நொறுக்கிய AJR பாதாமுடன் தயாரிக்கப்படும் இதமான பாதாம் பால்.',
  'No-bake protein balls made with Medjool Date Reserve, raw walnuts, chia seeds, and a drizzle of wild forest honey.': 'மெட்ஜூல் பேரீச்சை, வால்நட், சியா விதைகள் மற்றும் காட்டுத் தேன் கொண்டு சுடாமல் தயாரிக்கப்படும் புரத உருண்டைகள்.',
  'Jumbo golden cashews tossed with rosemary, pink Himalayan salt, and cold-pressed extra virgin olive oil.': 'ரோஸ்மேரி, இமயமலை இளஞ்சிவப்பு உப்பு மற்றும் செக்கில் ஆட்டிய ஆலிவ் எண்ணெயுடன் கலந்த ஜம்போ தங்க முந்திரி.',
  'good company.': 'அன்பான குடும்பங்களால்.', '4.95 / 5 Average Rating (1,400+ Reviews)': 'சராசரி மதிப்பீடு 4.95 / 5 (1,400+ விமர்சனங்கள்)',
  'Verified Buyer · Bengaluru': 'சரிபார்க்கப்பட்ட வாங்குபவர் · பெங்களூரு', 'Verified Buyer · Mumbai': 'சரிபார்க்கப்பட்ட வாங்குபவர் · மும்பை', 'Verified Buyer · Delhi': 'சரிபார்க்கப்பட்ட வாங்குபவர் · டெல்லி', 'Nutritionist · Hyderabad': 'ஊட்டச்சத்து நிபுணர் · ஹைதராபாத்',
  'Everything you might wonder before your first handful arrives.': 'உங்கள் முதல் பொதி வந்து சேரும் முன் நீங்கள் அறிய விரும்பும் அனைத்தும்.',
  'Need a hand choosing, gifting, or ordering in bulk?': 'தேர்வு செய்ய, பரிசளிக்க அல்லது மொத்தமாக ஆர்டர் செய்ய உதவி வேண்டுமா?', 'Write to us': 'எங்களுக்கு எழுதுங்கள்',
  'Find your answer': 'உங்கள் பதிலைக் கண்டறியுங்கள்', 'Search AJR frequently asked questions': 'AJR அடிக்கடி கேட்கப்படும் கேள்விகளில் தேடவும்',
  'Search questions (e.g. freshness, organic, bulk)...': 'கேள்விகளைத் தேடுங்கள் (எ.கா. புதுமை, இயற்கை, மொத்தம்)...', 'Clear FAQ search': 'கேள்வித் தேடலை அழிக்கவும்',
  'No answers match that search just yet.': 'இந்தத் தேடலுக்கான பதில் இன்னும் கிடைக்கவில்லை.', 'Ask the AJR team': 'AJR குழுவிடம் கேளுங்கள்',
  'Still curious?': 'மேலும் தெரிந்துகொள்ள வேண்டுமா?', 'Our people love a thoughtful question.': 'உங்கள் கேள்விகளுக்கு உதவ எங்கள் குழு தயாராக உள்ளது.', 'Talk to us': 'எங்களுடன் பேசுங்கள்',
  'Stay Connected': 'தொடர்பில் இருங்கள்', 'First taste of something good.': 'நல்லவற்றை முதலில் சுவையுங்கள்.', 'First taste of': 'முதலில் சுவையுங்கள்', 'something good.': 'நல்லவற்றை.',
  'Subscribe to receive private harvest releases, seasonal box discounts, and natural health guides delivered to your inbox.': 'புதிய அறுவடை அறிவிப்புகள், பருவகாலப் பெட்டி சலுகைகள் மற்றும் இயற்கை நல வழிகாட்டிகளை மின்னஞ்சலில் பெற பதிவு செய்யுங்கள்.',
  'Enter your email address': 'உங்கள் மின்னஞ்சல் முகவரியை உள்ளிடவும்',
  'Are AJR dry fruits and nuts 100% natural and organic?': 'AJR உலர் பழங்களும் பருப்புகளும் 100% இயற்கையானவையா?',
  'Yes. We work directly with certified farms and growers. All our dry fruits and nuts are 100% natural, non-GMO, zero artificial preservatives, and chemical-free.': 'ஆம். சான்றளிக்கப்பட்ட பண்ணைகள் மற்றும் விவசாயிகளுடன் நேரடியாக இணைகிறோம். எங்கள் உலர் பழங்களும் பருப்புகளும் 100% இயற்கையானவை; செயற்கைப் பாதுகாப்புப் பொருட்களும் வேதிப்பொருட்களும் இல்லை.',
  'How fresh is the stock when it arrives at my doorstep?': 'என் வீட்டிற்கு வரும் பொருட்கள் எவ்வளவு புதிதாக இருக்கும்?',
  'Everything is packed in small batches weekly in vacuum-sealed nitrogen-flushed packaging. Orders ship within 24 hours of packing so freshness is guaranteed.': 'அனைத்தும் வாரந்தோறும் சிறு தொகுதிகளாக காற்றுப் புகாத நைட்ரஜன் பொதியில் அடைக்கப்படுகின்றன. பொதியப்பட்ட 24 மணி நேரத்திற்குள் அனுப்பப்படுவதால் புதுமை உறுதி செய்யப்படுகிறது.',
  'Can I customize gift boxes for weddings or corporate events?': 'திருமணம் அல்லது நிறுவன நிகழ்வுகளுக்குப் பரிசுப் பெட்டிகளைத் தனிப்பயனாக்கலாமா?',
  'Absolutely! Our Interactive Custom Box Builder lets you pick dry fruit combinations, custom box finishes, and laser-engraved personal notes for any occasion.': 'நிச்சயமாக! உலர் பழக் கலவைகள், பெட்டி வடிவங்கள் மற்றும் லேசர் பொறித்த தனிப்பட்ட செய்திகளை எந்த நிகழ்விற்கும் நீங்கள் தேர்ந்தெடுக்கலாம்.',
  'What is your shipping policy and delivery timeline?': 'உங்கள் அனுப்புதல் கொள்கையும் விநியோக காலமும் என்ன?',
  'Free express shipping on orders over ₹999': '₹999-க்கு மேற்பட்ட ஆர்டர்களுக்கு இலவச விரைவு விநியோகம்',
  'Interactive Hamper Studio': 'உங்கள் பரிசுத் தொகுப்பை வடிவமைக்கும் பகுதி',
  'Build Your Custom': 'உங்களுக்கான தனிப்பயன்',
  'Harvest Box': 'அறுவடைப் பெட்டியை உருவாக்குங்கள்',
  'Build Your Custom Harvest Box': 'உங்களுக்கான தனிப்பயன் அறுவடைப் பெட்டியை உருவாக்குங்கள்',
  'Pick up to 4 premium dry fruits, choose your pack size, and select signature packaging.': '4 வகை வரை உயர்தர உலர் பழங்கள் மற்றும் பருப்புகளைத் தேர்ந்தெடுத்து, பொதி அளவையும் சிறப்பு பொதி வடிவத்தையும் தேர்வு செய்யுங்கள்.',
  'Step 1': 'படி 1',
  'Step 2': 'படி 2',
  'Step 3': 'படி 3',
  'Select 2 to 4 Dry Fruits & Nuts': '2 முதல் 4 வகை உலர் பழங்கள் மற்றும் பருப்புகளைத் தேர்ந்தெடுக்கவும்',
  'Choose Pack Quantity': 'பொதி அளவைத் தேர்ந்தெடுக்கவும்',
  'Select Packaging Finish': 'பொதி வடிவத்தைத் தேர்ந்தெடுக்கவும்',
  '250g Packets': '250 கிராம் பொதிகள்',
  '500g Packs (Save 10%)': '500 கிராம் பொதிகள் (10% சேமிப்பு)',
  '1kg Royal Tins (Save 18%)': '1 கிலோ சிறப்பு டின்கள் (18% சேமிப்பு)',
  'Eco-Friendly Jute Bag': 'சுற்றுச்சூழலுக்கு உகந்த சணல் பை',
  'Royal Wooden Gift Box': 'சிறப்பு மரப் பரிசுப் பெட்டி',
  'Festive Gold Foil Hamper': 'விழாக்காலத் தங்க நிறப் பரிசுத் தொகுப்பு',
  'Sustainable woven jute pouch with cotton ribbon tie.': 'பருத்தி நாடாவுடன் கூடிய நீடித்த நெய்த சணல் பை.',
  'Laser-etched keepsake wooden box with velvet lining.': 'வெல்வெட் உட்புறமும் லேசர் பொறிப்பும் கொண்ட நினைவுப் பரிசு மரப் பெட்டி.',
  'Embossed gold foil box with personalized gift card.': 'தனிப்பயன் வாழ்த்து அட்டையுடன் கூடிய பொறிக்கப்பட்ட தங்க நிறப் பெட்டி.',
  'Your Signature Creation': 'உங்களின் தனித்துவமான உருவாக்கம்',
  'Custom Harvest Hamper': 'தனிப்பயன் அறுவடைப் பரிசுத் தொகுப்பு',
  'Packed in:': 'பொதி வகை:',
  'Remove item': 'பொருளை நீக்கு',
  'Custom Box Subtotal': 'தனிப்பயன் பெட்டியின் இடைக்கூட்டுத்தொகை',
  'Free Insured Express Shipping Included': 'காப்பீட்டுடன் கூடிய இலவச விரைவு விநியோகம் சேர்க்கப்பட்டுள்ளது',
  'Custom Box Added!': 'தனிப்பயன் பெட்டி சேர்க்கப்பட்டது!',
  'Add Custom Box to Cart': 'தனிப்பயன் பெட்டியை கூடையில் சேர்க்கவும்',
  'High Protein': 'அதிக புரதம்', Creamy: 'மென்மையான சுவை', 'Omega-3 Rich': 'ஒமேகா-3 நிறைந்தது',
  'Natural Caramel': 'இயற்கை கேரமல் சுவை', 'Lightly Salted': 'மிதமான உப்பு', 'Fiber Packed': 'நார்ச்சத்து நிறைந்தது',
  'What is your health focus today? Pick a goal to discover nutrients tailored to your body.': 'இன்று உங்கள் உடல்நல இலக்கு என்ன? உங்கள் உடலுக்கு ஏற்ற ஊட்டச்சத்துகளை அறிய ஓர் இலக்கைத் தேர்ந்தெடுக்கவும்.',
  'Energy & Stamina': 'ஆற்றல் மற்றும் சகிப்புத்தன்மை', 'Heart & Cholesterol': 'இதயம் மற்றும் கொழுப்பு அளவு',
  'Brain & Memory': 'மூளை மற்றும் நினைவாற்றல்', 'Glow & Anti-Aging': 'சருமப் பொலிவு மற்றும் இளமைப் பராமரிப்பு',
  'Active Lifestyle': 'சுறுசுறுப்பான வாழ்க்கைமுறை', 'Cardio Wellness': 'இதய நலம்', 'Cognitive Focus': 'மன ஒருமைப்பாடு', 'Radiant Skin': 'பொலிவான சருமம்',
  'Sustained energy without the sugar crash': 'சர்க்கரை ஏற்ற இறக்கமின்றி நீடித்த ஆற்றல்',
  'Nourish your vascular health naturally': 'இயற்கையாக இரத்த நாள்களின் நலனைப் பேணுங்கள்',
  'Sharpen mental clarity & focus': 'மனத் தெளிவையும் கவனத்தையும் மேம்படுத்துங்கள்',
  'Hydrate skin from within with natural oils': 'இயற்கை எண்ணெய்ச்சத்தால் சருமத்தை உள்ளிருந்து ஊட்டுங்கள்',
  "Today's ritual": 'இன்றைய ஆரோக்கியப் பழக்கம்',
  'Protein': 'புரதம்', 'Good': 'நல்ல', 'Fats': 'கொழுப்புகள்', 'Whole': 'முழுமையான', 'Nuts': 'பருப்புகள்',
  'Natural Source': 'இயற்கை மூலம்', 'Daily': 'தினசரி', 'Ritual': 'பழக்கம்', 'Mindful': 'கவனமுடன்', 'Snack': 'சிற்றுண்டி',
  'Not all dry fruits are created equal. Compare how AJR Nature sets a new benchmark for cleanliness, flavor, and integrity.': 'அனைத்து உலர் பழங்களும் ஒரே தரத்தில் இருப்பதில்லை. தூய்மை, சுவை மற்றும் நேர்மையில் AJR Nature அமைக்கும் புதிய தரத்தை ஒப்பிட்டுப் பாருங்கள்.',
  'Quality Benchmark': 'தர அளவுகோல்', 'AJR Pure Sourcing': 'AJR தூய நேரடி கொள்முதல்', 'Generic Market Brands': 'பொதுவான சந்தைப் பொருட்கள்',
  'Kernel Grade & Sizing': 'பருப்பு தரமும் அளவும்', 'Chemical Bleaching & Treatment': 'வேதியியல் வெளுப்பாக்கமும் பதப்படுத்தலும்',
  'Moisture Control & Crispness': 'ஈரப்பதக் கட்டுப்பாடும் மொறுமொறுப்பும்', 'Additives & Preservatives': 'சேர்க்கைப் பொருட்களும் பாதுகாப்புப் பொருட்களும்',
  'Packaging & Shelf Preservation': 'பொதியும் சேமிப்புக் காலமும்', 'Farmer Pay & Traceability': 'விவசாயிக்கான நியாயமான விலையும் மூலத்தைக் கண்டறியும் வசதியும்',
  '100% Taste & Freshness Money-Back Guarantee': '100% சுவை மற்றும் புதுமைக்கான பணம் திரும்ப உத்தரவாதம்',
  'Visit Our Studio & Tasting Room': 'எங்கள் விற்பனை மற்றும் சுவை அறைக்கு வாருங்கள்',
  'Experience the Harvest': 'அறுவடையின் சிறப்பை', 'In Person': 'நேரில் அனுபவியுங்கள்',
  'Step into our Virudhunagar studio to taste fresh dry fruit batches, inspect royal wooden gift hampers, and consult with our master tasters.': 'விருதுநகரிலுள்ள எங்கள் நிலையத்திற்கு வந்து புதிய உலர் பழங்களைச் சுவைத்து, சிறப்பு மரப் பரிசுத் தொகுப்புகளைப் பார்த்து, எங்கள் சுவை நிபுணர்களிடம் ஆலோசனை பெறுங்கள்.',
  'Studio Open Now (Until 7:00 PM IST)': 'விற்பனை நிலையம் இப்போது திறந்துள்ளது (மாலை 7:00 வரை)',
  'Studio Currently Closed (Opens 10:00 AM IST)': 'விற்பனை நிலையம் தற்போது மூடப்பட்டுள்ளது (காலை 10:00 மணிக்கு திறக்கும்)',
  'Virudhunagar Flagship': 'விருதுநகர் முதன்மை நிலையம்', 'Studio & Tasting Counter': 'விற்பனை மற்றும் சுவை அறை',
  'Complimentary Saffron Almond Milk': 'இலவச குங்குமப்பூ பாதாம் பால்', 'Free Private Parking': 'இலவச தனியார் வாகன நிறுத்தம்',
  'Sample Tasting Counter': 'மாதிரி சுவை அறை', 'Same-Day Custom Engraving': 'அன்றே தனிப்பயன் பொறிப்பு',
  'Find us in Virudhunagar': 'விருதுநகரில் எங்களைக் கண்டறியுங்கள்',
  'Open the map for directions to our studio and tasting counter.': 'எங்கள் விற்பனை மற்றும் சுவை அறைக்கான வழியை அறிய வரைபடத்தைத் திறக்கவும்.',
  'AJR site footer': 'AJR தளத்தின் அடிப்பகுதி', 'All rights reserved.': 'அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை.',
  'Summary': 'சுருக்கம்', 'Paid': 'செலுத்தப்பட்டது', 'Unpaid': 'செலுத்தப்படவில்லை', 'Refunded': 'திருப்பிச் செலுத்தப்பட்டது',
  'Shipped': 'அனுப்பப்பட்டது', 'Confirmed': 'உறுதிசெய்யப்பட்டது', 'Completed': 'நிறைவடைந்தது',
  'Harvest · 100% Organic': 'அறுவடை · 100% இயற்கை',
  'The AJR Pantry / Full Collection': 'AJR உணவுக் களஞ்சியம் / முழுத் தொகுப்பு',
  'Find your': 'உங்களுக்கான', everyday: 'அன்றாட', 'superfoods.': 'சத்துணவுகளைக் கண்டறியுங்கள்.',
  '100% natural, Grade A almonds, cashews, walnuts, dates, and festive hampers packed for peak freshness.': '100% இயற்கையான தரம் A பாதாம், முந்திரி, வால்நட், பேரீச்சை மற்றும் விழாக்காலப் பரிசுத் தொகுப்புகள் மிகுந்த புதுமையுடன் பொதியப்படுகின்றன.',
  'Directly sourced · Packed in small batches': 'நேரடிக் கொள்முதல் · சிறு தொகுதிகளாகப் பொதியப்பட்டது',
  'Search the collection': 'தொகுப்பில் தேடுங்கள்', 'Clear product search': 'பொருள் தேடலை அழிக்கவும்', 'Sort products': 'பொருட்களை வரிசைப்படுத்தவும்', 'Product results': 'பொருள் முடிவுகள்',
  'harvests found': 'அறுவடைப் பொருட்கள் கிடைத்தன', in: 'இந்தப் பிரிவில்',
  Almonds: 'பாதாம்', Cashews: 'முந்திரி', Pistachios: 'பிஸ்தா', Walnuts: 'வால்நட்', Figs: 'அத்திப்பழம்', Raisins: 'உலர் திராட்சை', Dates: 'பேரீச்சை', Prunes: 'உலர் பிளம்', Seeds: 'விதைகள்', Spices: 'மசாலா வகைகள்', Berries: 'பெர்ரி பழங்கள்', 'Tropical Fruit': 'வெப்பமண்டலப் பழங்கள்', 'Stone Fruit': 'கொட்டைப் பழங்கள்', Mixes: 'கலவைகள்', Snacking: 'சிற்றுண்டிகள்',
  'Add to cart': 'கூடையில் சேர்க்கவும்', Plant: 'தாவரச் சார்ந்த',
  'Plant Protein, Vitamin E & Magnesium': 'தாவரப் புரதம், வைட்டமின் E மற்றும் மக்னீசியம்',
  'Omega-3 ALA & Natural Polyphenols': 'ஒமேகா-3 ALA மற்றும் இயற்கை பாலிபீனால்கள்',
  'A satisfying daily pairing of plant protein and naturally occurring healthy fats to support your on-the-go routine.': 'உங்கள் சுறுசுறுப்பான நாளை ஆதரிக்கத் தாவரப் புரதமும் இயற்கையான நல்ல கொழுப்புகளும் சேர்ந்த நிறைவான அன்றாட இணை.',
  'Pair a small handful with fruit or yoghurt for a balanced afternoon snack.': 'சமநிலையான மாலைச் சிற்றுண்டிக்காக ஒரு சிறு கைப்பிடி அளவைப் பழம் அல்லது தயிருடன் சேர்த்து உண்ணுங்கள்.',
  'Walnuts and almonds bring naturally occurring unsaturated fats to a thoughtful everyday snack ritual.': 'வால்நட் மற்றும் பாதாமில் உள்ள இயற்கை நிறைவுறா கொழுப்புகள் அன்றாட ஆரோக்கியச் சிற்றுண்டிக்கு ஏற்றவை.',
  'Enjoy them plain, unsalted, or folded into your breakfast bowl.': 'உப்பு சேர்க்காமல் அப்படியே அல்லது காலை உணவுடன் சேர்த்து உண்ணுங்கள்.',
  'Walnuts and almonds are a naturally rich source of omega-3 ALA, Vitamin E, and satisfying texture.': 'வால்நட் மற்றும் பாதாம் ஒமேகா-3 ALA, வைட்டமின் E மற்றும் நிறைவான ஊட்டச்சத்துகளின் இயற்கை மூலம்.',
  'Keep a small portion at your desk for a mindful mid-day break.': 'மதிய இடைவேளைக்காக ஒரு சிறு அளவை அருகில் வைத்துக்கொள்ளுங்கள்.',
  'A simple whole-food pair with Vitamin E, minerals, and good fats for a nourishing daily routine.': 'வைட்டமின் E, தாதுக்கள் மற்றும் நல்ல கொழுப்புகள் கொண்ட எளிய முழு உணவு இணை.',
  'Add a few crushed almonds and walnuts to oats, salads, or warm porridge.': 'ஓட்ஸ், சாலட் அல்லது சூடான கஞ்சியில் சிறிது நொறுக்கிய பாதாம் மற்றும் வால்நட் சேர்க்கவும்.',
  'The Medjool dates are the softest I have ever had. We keep a bowl on the table and it empties itself within minutes!': 'நான் சுவைத்த மெட்ஜூல் பேரீச்சைகளில் இதுவே மிகவும் மென்மையானது. மேசையில் வைத்த சில நிமிடங்களிலேயே கிண்ணம் காலியாகிவிடுகிறது!',
  'I ordered the trail mix for my office drawer. It has genuinely changed my afternoons — fresh, crunchy, never stale.': 'அலுவலகத்திற்காக வாங்கிய கலவை என் மாலை நேரத்தை மாற்றிவிட்டது—புதியது, மொறுமொறுப்பானது, ஒருபோதும் பழைய சுவையில்லை.',
  'Gifted AJR royal wooden boxes for Diwali and the packaging alone got endless compliments. Truly premium quality.': 'தீபாவளிக்கு AJR மரப் பெட்டிகளைப் பரிசளித்தேன்; பொதிக்கே ஏராளமான பாராட்டுகள் கிடைத்தன. உண்மையிலேயே உயர்தரம்.',
  'The Kashmiri mammoth walnuts are whole, creamy and completely zero bitter taste. Superior to any brand in the market.': 'காஷ்மீர் வால்நட்கள் முழுமையாகவும் மென்மையாகவும் கசப்பே இல்லாமலும் உள்ளன. சந்தையில் கிடைப்பவற்றைவிட சிறந்தவை.',
  'Essence of nature.': 'இயற்கையின் சாரம்.', 'Pure dry fruits, nuts, and handcrafted hampers made for everyday living.': 'அன்றாட வாழ்வுக்காகத் தூய உலர் பழங்கள், பருப்புகள் மற்றும் கைவினைப் பரிசுத் தொகுப்புகள்.',
  'Our Story': 'எங்கள் கதை', 'Shop All': 'அனைத்தையும் வாங்குங்கள்', 'Contact Us': 'எங்களைத் தொடர்புகொள்ளுங்கள்',
  'Join the table for private harvest releases.': 'புதிய அறுவடை அறிவிப்புகளைப் பெற எங்களுடன் இணையுங்கள்.',
  '© 2026 AJR Essence of Nature. All rights reserved.': '© 2026 AJR Essence of Nature. அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை.',
  'Crafted with intention & care': 'அக்கறையுடனும் நோக்கத்துடனும் உருவாக்கப்பட்டது', 'Privacy · Terms': 'தனியுரிமை · விதிமுறைகள்',

  '01 / Heritage': '01 / பாரம்பரியம்', 'Our Heritage & Sourcing Philosophy': 'எங்கள் பாரம்பரியமும் கொள்முதல் நெறியும்',
  'Rooted in nature.': 'இயற்கையில் வேரூன்றியது.', 'Crafted for living.': 'வாழ்விற்காக உருவாக்கப்பட்டது.',
  'We are on a mission to redefine everyday snacking — bringing unbleached, single-origin dry fruits and nuts straight from accredited family orchards to your home.': 'அங்கீகரிக்கப்பட்ட குடும்பத் தோட்டங்களிலிருந்து வெளுப்பாக்கப்படாத, ஒரே மூலத்தைச் சேர்ந்த உலர் பழங்களையும் பருப்புகளையும் நேரடியாக உங்கள் இல்லத்திற்கு கொண்டு வந்து அன்றாடச் சிற்றுண்டியை மறுவரையறை செய்கிறோம்.',
  'Handpicked nuts and dry fruits': 'கையால் தேர்ந்தெடுக்கப்பட்ட பருப்புகள் மற்றும் உலர் பழங்கள்', 'The AJR Founding Story': 'AJR உருவான கதை',
  'There is magic in an honest handful.': 'நேர்மையான ஒரு கைப்பிடியில் தனிச்சிறப்பு உள்ளது.',
  'AJR began at a family table in Virudhunagar, Tamil Nadu. We noticed that most store-bought dry fruits were dry, over-bleached with sulfur, or sat in open warehouses for over a year before reaching customers.': 'தமிழ்நாட்டின் விருதுநகரில் ஒரு குடும்ப உணவு மேசையில் AJR தொடங்கியது. கடைகளில் கிடைத்த பல உலர் பழங்கள் அதிகமாக உலர்ந்தும், சல்பரால் வெளுப்பாக்கப்பட்டும், வாடிக்கையாளரை அடைவதற்கு முன் நீண்டகாலம் திறந்த கிடங்குகளில் வைக்கப்பட்டும் இருந்ததை கவனித்தோம்.',
  'We set out to change that by establishing direct fair-trade relationships with orchards in Kashmir, California, Mangalore, and Kerman. By packing in small weekly batches with zero chemical glazes, we preserve the natural essential oils and authentic crunch that nature intended.': 'இதனை மாற்ற காஷ்மீர், கலிஃபோர்னியா, மங்களூர் மற்றும் கெர்மான் தோட்டங்களுடன் நேரடி நியாய வணிக உறவுகளை உருவாக்கினோம். வேதியியல் பூச்சில்லாமல் வாரந்தோறும் சிறு தொகுதிகளாகப் பொதியுவதால் இயற்கை எண்ணெய்ச்சத்தும் உண்மையான மொறுமொறுப்பும் பாதுகாக்கப்படுகின்றன.',
  'Explore Our Collection': 'எங்கள் தொகுப்பைப் பாருங்கள்',
  '“The finest things in life are often the simplest: good ingredients, good company, and time to enjoy both.”': '“வாழ்க்கையின் சிறந்தவை பெரும்பாலும் எளிமையானவை: நல்ல பொருட்கள், நல்ல உறவுகள், இரண்டையும் ரசிக்கும் நேரம்.”',
  '— The AJR Family Table': '— AJR குடும்ப மேசை', 'Uncompromising Standards': 'சமரசமற்ற தரநிலைகள்', '6 Purity Commitments': 'தூய்மைக்கான 6 உறுதிமொழிகள்',
  'From harvest selection to eco packaging, we keep our standards non-negotiable.': 'அறுவடைத் தேர்விலிருந்து சுற்றுச்சூழல் பொதிவரை எங்கள் தரத்தில் சமரசமில்லை.',
  '100% Unbleached': '100% வெளுப்பாக்கப்படாதது', 'Nitrogen-Flush Packed': 'நைட்ரஜன் பாதுகாப்புப் பொதி', 'Direct Farmer Trade': 'விவசாயியிடமிருந்து நேரடி கொள்முதல்', 'Optically Size Graded': 'ஒளி வருடியால் அளவு தரப்படுத்தப்பட்டது', 'Zero Oil Glazes': 'எண்ணெய் பூச்சு இல்லை', 'Eco Jute & Glass': 'சுற்றுச்சூழல் சணல் மற்றும் கண்ணாடி',
  'Zero chlorine, no sulfur dioxide, and no artificial color processing. Just natural shade.': 'குளோரின், சல்பர் டையாக்சைடு அல்லது செயற்கை நிறப் பதப்படுத்தல் இல்லை. இயற்கையான நிறம் மட்டுமே.',
  'Sealed in small batches weekly to lock in crispness and protect natural Vitamin E & ALA.': 'மொறுமொறுப்பையும் இயற்கை வைட்டமின் E மற்றும் ALA-வையும் காக்க வாரந்தோறும் சிறு தொகுதிகளாக அடைக்கப்படுகிறது.',
  'Fair trade contracts that pay 25% above market rates directly to single-origin growers.': 'ஒரே மூல விவசாயிகளுக்கு சந்தை விலையைவிட 25% அதிகமாக நேரடியாக வழங்கும் நியாய வணிக ஒப்பந்தங்கள்.',
  'Only hand-selected Jumbo W240 cashews & Mammoth Kashmiri walnuts make the cut.': 'கையால் தேர்ந்தெடுக்கப்பட்ட ஜம்போ W240 முந்திரியும் காஷ்மீர் வால்நட்டும் மட்டுமே இடம்பெறும்.',
  'No cheap palm oil coats, no glucose weight additives. Pure dry roasted goodness.': 'மலிவு பாமாயில் பூச்சோ, எடை கூட்டும் குளுக்கோஸோ இல்லை. தூய உலர் வறுவல் மட்டுமே.',
  'Sustainable, zero-plastic packaging options designed for reuse and lower carbon footprint.': 'மீண்டும் பயன்படுத்தவும் கார்பன் தடத்தை குறைக்கவும் வடிவமைக்கப்பட்ட பிளாஸ்டிக் இல்லாத நிலைத்த பொதிகள்.',
  'Our Sourcing Journey': 'எங்கள் கொள்முதல் பயணம்', 'Milestones of': 'நன்மையின் மைல்கற்கள்', 'The Family Table': 'குடும்ப மேசை', 'Kashmir & Iran Direct': 'காஷ்மீர் மற்றும் ஈரான் நேரடிக் கொள்முதல்', 'Zero-Plastic Initiative': 'பிளாஸ்டிக் இல்லா முயற்சி', '28,000+ Happy Homes': '28,000+ மகிழ்ச்சியான இல்லங்கள்',
  'Master Taster Guarantee': 'முதன்மை சுவை நிபுணரின் உறுதி', '“If it isn\'t crisp, sweet, and pure, it never leaves our door.”': '“மொறுமொறுப்பாகவும் இனிமையாகவும் தூய்மையாகவும் இல்லாவிட்டால் அது எங்கள் வாசலைத் தாண்டாது.”',
  'Every single batch of almonds, cashews, dates, and walnuts is sampled by our master quality tasters before being approved for nitrogen packaging.': 'ஒவ்வொரு பாதாம், முந்திரி, பேரீச்சை மற்றும் வால்நட் தொகுதியும் நைட்ரஜன் பொதிக்கு அனுமதிக்கப்படும் முன் எங்கள் தர நிபுணர்களால் சுவைத்துச் சரிபார்க்கப்படுகிறது.',
  'We stand behind every pouch with our 100% Taste & Freshness Money-Back Guarantee.': 'ஒவ்வொரு பொதிக்கும் 100% சுவை மற்றும் புதுமைக்கான பணம் திரும்ப உத்தரவாதம் வழங்குகிறோம்.',
  'Shop Fresh Harvest Now': 'புதிய அறுவடைப் பொருட்களை வாங்குங்கள்', 'Bring Goodness Home': 'நன்மையை இல்லத்திற்கு கொண்டு வாருங்கள்', 'Your next favorite': 'உங்கள் அடுத்த விருப்பமானது', 'is waiting.': 'காத்திருக்கிறது.', 'Explore Pantry': 'உணவுக் களஞ்சியத்தைப் பாருங்கள்',

  'Concierge & Customer Care': 'தனிப்பட்ட உதவி மற்றும் வாடிக்கையாளர் சேவை', 'We would love': 'உங்களிடமிருந்து', 'to hear from you.': 'கேட்க விரும்புகிறோம்.',
  'Whether you have a product question, need custom festival hampers, or want to discuss bulk corporate gifting, our human team replies promptly.': 'பொருள் குறித்த கேள்வி, தனிப்பயன் விழாக்காலப் பரிசுத் தொகுப்பு அல்லது நிறுவன மொத்தப் பரிசளிப்பு—எதுவாக இருந்தாலும் எங்கள் குழு விரைவாகப் பதிலளிக்கும்.',
  'WhatsApp Concierge (Fastest)': 'WhatsApp உதவி (விரைவானது)', 'A personal reply, never an automated queue.': 'தானியங்கி பதில் அல்ல; எங்கள் குழுவினரிடமிருந்து நேரடிப் பதில்.',
  'WhatsApp Support': 'WhatsApp உதவி', 'Instant support for order tracking, gift guidance & quick recommendations.': 'ஆர்டர் கண்காணிப்பு, பரிசுத் தேர்வு மற்றும் விரைவான பரிந்துரைகளுக்கு உடனடி உதவி.', 'Avg Reply: ~5 Mins': 'சராசரி பதில்: சுமார் 5 நிமிடங்கள்', 'Open WhatsApp': 'WhatsApp-ஐத் திறக்கவும்',
  'Email Desk': 'மின்னஞ்சல் உதவி', 'For custom hampers, corporate gifting decks, and retail wholesale inquiries.': 'தனிப்பயன் தொகுப்புகள், நிறுவனப் பரிசுகள் மற்றும் மொத்த விற்பனை விசாரணைகளுக்கு.', 'Avg Reply: < 2 Hours': 'சராசரி பதில்: 2 மணி நேரத்திற்குள்', 'Write Email': 'மின்னஞ்சல் அனுப்பவும்',
  'Studio Call Desk': 'தொலைபேசி உதவி', 'Prefer a human voice? Call our Virudhunagar flagship studio directly.': 'நேரடியாகப் பேச விரும்புகிறீர்களா? விருதுநகர் முதன்மை நிலையத்தை அழைக்கவும்.',
  'Corporate & Wedding Bulk Pricing': 'நிறுவனம் மற்றும் திருமண மொத்த விலை', 'Interactive Hamper': 'பரிசுத் தொகுப்பு', 'Cost Estimator': 'விலை மதிப்பீட்டுக் கருவி',
  'Calculate instant estimated costs for corporate hampers, festival gifts, and wedding favors with volume discounts.': 'நிறுவனத் தொகுப்புகள், விழாப் பரிசுகள் மற்றும் திருமண நினைவுப் பரிசுகளுக்கான மொத்தத் தள்ளுபடி விலையை உடனே கணக்கிடுங்கள்.',
  '1. Choose Gift Box Style': '1. பரிசுப் பெட்டி வடிவத்தைத் தேர்ந்தெடுக்கவும்', '2. Select Order Quantity:': '2. ஆர்டர் எண்ணிக்கையைத் தேர்ந்தெடுக்கவும்:', '3. Select Custom Branding Add-ons': '3. தனிப்பயன் பிராண்ட் கூடுதல் அம்சங்களைத் தேர்ந்தெடுக்கவும்', Units: 'அலகுகள்',
  'Classic Eco Jute Bag': 'சுற்றுச்சூழல் சணல் பை', 'Royal Keepsake Wooden Chest': 'நினைவுப் பரிசு மரப் பெட்டி', 'Custom Corporate Logo Engraving': 'நிறுவன இலச்சினை தனிப்பயன் பொறிப்பு', 'Custom Brand Ribbon & Card': 'தனிப்பயன் நாடா மற்றும் அட்டை', 'Add 1g Kashmiri Saffron Jar': '1 கிராம் காஷ்மீர் குங்குமப்பூ ஜாடி',
  'Instant Quote Estimate': 'உடனடி விலை மதிப்பீடு', 'Base Tier Price': 'அடிப்படைப் பெட்டி விலை', 'Selected Add-ons': 'தேர்ந்தெடுத்த கூடுதல் அம்சங்கள்', 'Volume Discount': 'மொத்தத் தள்ளுபடி', 'Effective Cost per Unit': 'ஒரு அலகிற்கான இறுதி விலை', 'Estimated Grand Total': 'மதிப்பிடப்பட்ட மொத்தம்',
  'Includes GST Invoice & Doorstep Delivery Across India': 'GST விலைப்பட்டியல் மற்றும் இந்தியா முழுவதும் வீட்டு வாசல் விநியோகம் உட்பட', 'Request Official Corporate Deck & Sample Box': 'நிறுவன விவரத் தொகுப்பு மற்றும் மாதிரிப் பெட்டியைக் கோரவும்',
  'Enquiry desk online': 'விசாரணை உதவி தற்போது செயலில் உள்ளது', 'AJR Live Enquiry Desk': 'AJR நேரடி விசாரணை உதவி', 'Tell us what': 'உங்களுக்குத் தேவையானதை', 'you need.': 'எங்களிடம் கூறுங்கள்.',
  'Choose your enquiry type.': 'விசாரணை வகையைத் தேர்ந்தெடுக்கவும்.', 'Share the details that matter.': 'தேவையான விவரங்களைப் பகிரவும்.', 'Receive a personal reply within business hours.': 'வேலை நேரத்திற்குள் நேரடிப் பதிலைப் பெறுங்கள்.',
  'Private, secure, and read by a real AJR team member.': 'தனிப்பட்டதும் பாதுகாப்பானதும்; AJR குழுவினர் நேரடியாகப் படிப்பார்கள்.', 'Direct Contact Information': 'நேரடித் தொடர்பு விவரம்', 'Wholesale & Bulk Orders': 'மொத்த விற்பனை மற்றும் பெரிய ஆர்டர்கள்', 'Custom corporate gifts and retail partnerships.': 'தனிப்பயன் நிறுவனப் பரிசுகள் மற்றும் சில்லறை வணிகக் கூட்டாண்மை.', 'Flagship Studio': 'முதன்மை விற்பனை நிலையம்',
  'Human Support Promise': 'மனித உதவி உறுதி', 'When you contact AJR, a real team member reads and replies to your message. No bots, no mystery queues.': 'AJR-ஐ தொடர்புகொள்ளும்போது எங்கள் குழுவினர் உங்கள் செய்தியைப் படித்து பதிலளிப்பார்கள். தானியங்கி பதில்கள் இல்லை.',
  'LIVE ENQUIRY': 'நேரடி விசாரணை', 'How can we help?': 'நாங்கள் எவ்வாறு உதவலாம்?', 'Sent directly to our team': 'எங்கள் குழுவிற்கு நேரடியாக அனுப்பப்படும்',
  'Product & Retail Support': 'பொருள் மற்றும் சில்லறை உதவி', 'Custom Festive Hampers': 'தனிப்பயன் விழாக்காலத் தொகுப்புகள்', 'Corporate Bulk Inquiry': 'நிறுவன மொத்த விசாரணை', 'Press & Collaborations': 'ஊடகம் மற்றும் கூட்டாண்மைகள்',
  'Your Name': 'உங்கள் பெயர்', 'Full Name': 'முழுப் பெயர்', 'Phone / WhatsApp': 'தொலைபேசி / WhatsApp', 'Email Address': 'மின்னஞ்சல் முகவரி', 'Company / Organization Name': 'நிறுவனம் / அமைப்பின் பெயர்', 'Estimated Quantity': 'மதிப்பிடப்பட்ட எண்ணிக்கை', 'e.g. 50 hampers': 'எ.கா. 50 பரிசுத் தொகுப்புகள்', 'Event / Festival Date': 'நிகழ்வு / விழா தேதி', 'Packaging Style Preference': 'விருப்பமான பொதி வடிவம்', 'Message / Special Requests': 'செய்தி / சிறப்புக் கோரிக்கைகள்', 'Tell us how we can help...': 'எவ்வாறு உதவ வேண்டும் என்பதைத் தெரிவிக்கவும்...',
  'Sending…': 'அனுப்பப்படுகிறது…', 'Send Inquiry': 'விசாரணையை அனுப்பவும்', '100% Confidential. Replies within 2 hours during business hours.': '100% ரகசியம். வேலை நேரத்தில் 2 மணி நேரத்திற்குள் பதில்.', 'Message Received!': 'செய்தி பெறப்பட்டது!', 'Send another message': 'மற்றொரு செய்தியை அனுப்பவும்',
  'ALWAYS JUST ROYAL': 'தரம் எப்போதும் சிறப்பு', 'THE AJR WORKSPACE': 'AJR நிர்வாகப் பகுதி', 'Made for everyday growth.': 'அன்றாட வளர்ச்சிக்காக உருவாக்கப்பட்டது.',
  'Founded in Virudhunagar, Tamil Nadu with a simple commitment to source clean, unbleached California almonds and dates for friends & family.': 'நண்பர்களுக்கும் குடும்பத்திற்கும் தூய, வெளுப்பாக்கப்படாத கலிஃபோர்னியா பாதாம் மற்றும் பேரீச்சையை வழங்கும் எளிய உறுதியுடன் தமிழ்நாட்டின் விருதுநகரில் தொடங்கப்பட்டது.',
  'Partnered with Shopian walnut growers and Kerman pistachio orchards for direct single-origin harvest imports.': 'ஒரே மூல அறுவடையை நேரடியாகப் பெற ஷோபியான் வால்நட் விவசாயிகளுடனும் கெர்மான் பிஸ்தா தோட்டங்களுடனும் இணைந்தோம்.',
  'Eliminated single-use plastics by introducing woven jute pouches, reusable glass jars, and laser-engraved wooden boxes.': 'நெய்த சணல் பைகள், மீண்டும் பயன்படுத்தக்கூடிய கண்ணாடி ஜாடிகள் மற்றும் லேசர் பொறித்த மரப் பெட்டிகள் மூலம் ஒருமுறைப் பயன்பாட்டு பிளாஸ்டிக்கை நீக்கினோம்.',
  'Now delivering fresh harvest dry fruits and custom festive hampers to over 28,000 households across India.': 'இப்போது இந்தியா முழுவதும் 28,000-க்கும் மேற்பட்ட இல்லங்களுக்கு புதிய உலர் பழங்களையும் தனிப்பயன் விழாக்காலத் தொகுப்புகளையும் வழங்குகிறோம்.',
  'AJR Master Tasters & Farm Sourcing Team': 'AJR சுவை நிபுணர்கள் மற்றும் பண்ணைக் கொள்முதல் குழு',
  'We bypass commodity traders to partner directly with single-origin family orchards across the world’s finest growing micro-climates.': 'இடைத்தரகர்களைத் தவிர்த்து உலகின் சிறந்த விளைச்சல் பகுதிகளில் உள்ள குடும்பத் தோட்டங்களுடன் நேரடியாக இணைகிறோம்.',
  'Hand-sorted Jumbo W240 Cashews & Mammoth Kashmiri Walnuts': 'கையால் தரம் பிரிக்கப்பட்ட ஜம்போ W240 முந்திரி மற்றும் காஷ்மீர் வால்நட்',
  'Mixed size fragments, split kernels, & Grade-B defect pieces': 'கலவையான அளவுகள், உடைந்த பருப்புகள் மற்றும் தரம் B குறைபாடுள்ள துண்டுகள்',
  '100% Unbleached & Chemical-Free natural shade': '100% வெளுப்பாக்கப்படாத, வேதிப்பொருள் இல்லாத இயற்கை நிறம்',
  'Chlorine bleached or sulfur dioxide treated for artificial shine': 'செயற்கைப் பளபளப்புக்காக குளோரின் அல்லது சல்பர் டையாக்சைடால் பதப்படுத்தப்பட்டது',
  'Nitrogen-flushed small batches within 24h of roasting': 'வறுத்த 24 மணி நேரத்திற்குள் நைட்ரஜன் நிரப்பிய சிறு தொகுதிப் பொதி',
  'Stored in open burlap sacks in warehouses for 6–12 months': 'கிடங்குகளில் திறந்த சாக்குகளில் 6–12 மாதங்கள் சேமிப்பு',
  'Zero mineral oil, no added sugar, zero synthetic glazes': 'கனிம எண்ணெய், சேர்க்கப்பட்ட சர்க்கரை மற்றும் செயற்கைப் பூச்சு இல்லை',
  'Coated in cheap vegetable oil or glucose syrup to add weight': 'எடையை கூட்ட மலிவு தாவர எண்ணெய் அல்லது குளுக்கோஸ் பாகு பூசப்பட்டது',
  'Eco Jute Pouches, Reusable Glass Jars & Laser Wood Hampers': 'சணல் பைகள், மீண்டும் பயன்படுத்தும் கண்ணாடி ஜாடிகள் மற்றும் லேசர் பொறித்த மரப் பெட்டிகள்',
  'Thin single-use plastic bags susceptible to oxidation': 'ஆக்சிஜனேற்றம் ஏற்படக்கூடிய மெல்லிய ஒருமுறைப் பயன்பாட்டு பிளாஸ்டிக் பைகள்',
  'Direct Fair-Trade contracts guaranteeing 25% above market rate': 'சந்தை விலையைவிட 25% அதிகம் உறுதி செய்யும் நேரடி நியாய வணிக ஒப்பந்தங்கள்',
  'Complex middleman supply chains exploiting small growers': 'சிறு விவசாயிகளை பாதிக்கும் சிக்கலான இடைத்தரகர் விநியோகச் சங்கிலி',
  'If any pack of AJR dry fruits or nuts does not meet your expectations in size, crunch, or flavor, we will replace it or refund your order with zero questions asked.': 'AJR உலர் பழம் அல்லது பருப்பு அளவு, மொறுமொறுப்பு அல்லது சுவையில் உங்கள் எதிர்பார்ப்பை பூர்த்தி செய்யாவிட்டால் கேள்வியின்றி மாற்றித் தருவோம் அல்லது பணத்தைத் திருப்பித் தருவோம்.',
  'Sustainable woven jute bag with 3 glass jars of almonds, cashews & dates.': 'பாதாம், முந்திரி மற்றும் பேரீச்சை கொண்ட 3 கண்ணாடி ஜாடிகளுடன் நிலைத்த நெய்த சணல் பை.',
  'Embossed gold foil box with 4 premium dry fruit jars & customized message card.': '4 உயர்தர உலர் பழ ஜாடிகள் மற்றும் தனிப்பயன் செய்தி அட்டையுடன் பொறித்த தங்க நிறப் பெட்டி.',
  'Laser-etched teakwood chest with 4 luxury jars including Kashmiri Walnuts & Pistachios.': 'காஷ்மீர் வால்நட் மற்றும் பிஸ்தா உள்ளிட்ட 4 உயர்தர ஜாடிகளுடன் லேசர் பொறித்த தேக்கு மரப் பெட்டி.',
  'Volume Discount Applied': 'மொத்தத் தள்ளுபடி வழங்கப்பட்டது', '10 units': '10 அலகுகள்', '50 units (10% OFF)': '50 அலகுகள் (10% தள்ளுபடி)', '100 units (15% OFF)': '100 அலகுகள் (15% தள்ளுபடி)', '250+ units (20% OFF)': '250+ அலகுகள் (20% தள்ளுபடி)',
  'Product help, gifting plans, bulk orders, and partnerships — send one enquiry and our team receives it instantly.': 'பொருள் உதவி, பரிசுத் திட்டம், மொத்த ஆர்டர் அல்லது கூட்டாண்மை—ஒரே விசாரணையை அனுப்புங்கள்; எங்கள் குழு உடனே பெறும்.',
  'Thank you for reaching out. A real person is reviewing your inquiry — we will be in touch within 1 working day.': 'தொடர்புகொண்டதற்கு நன்றி. எங்கள் குழுவினர் உங்கள் விசாரணையைப் பரிசீலிக்கிறார்கள்; ஒரு வேலை நாளுக்குள் தொடர்புகொள்வோம்.',
  'Checking session…': 'அமர்வு சரிபார்க்கப்படுகிறது…',
}

function translateCopy(language: Language, text: string) {
  if (language === 'en') return text
  const dictionary = {
    ...translations[language],
    ...supplementalTranslations[language],
    ...(language === 'ta' ? tamilExperienceTranslations : {}),
    ...(language === 'hi' ? hindiExperienceTranslations : {}),
  }
  if (dictionary[text]) return dictionary[text]

  if (language === 'ta') {
    const selected = text.match(/^(\d+)\/4 selected$/)
    if (selected) return `${selected[1]}/4 தேர்ந்தெடுக்கப்பட்டுள்ளன`
    const results = text.match(/^(\d+) (item|items|order|orders|saved)$/i)
    if (results) {
      const label = results[2].toLowerCase() === 'saved' ? 'சேமிக்கப்பட்டவை' : results[2].toLowerCase().startsWith('order') ? 'ஆர்டர்கள்' : 'பொருட்கள்'
      return `${results[1]} ${label}`
    }
  }

  if (language === 'hi') {
    const selected = text.match(/^(\d+)\/4 selected$/)
    if (selected) return `${selected[1]}/4 चुने गए`
    const results = text.match(/^(\d+) (item|items|order|orders|saved)$/i)
    if (results) {
      const kind = results[2].toLowerCase()
      const label = kind === 'saved' ? 'सहेजे गए' : kind.startsWith('order') ? 'ऑर्डर' : 'वस्तुएँ'
      return `${results[1]} ${label}`
    }
    const harvests = text.match(/^(\d+) harvests found$/i)
    if (harvests) return `${harvests[1]} उत्पाद मिले`
  }

  // Content cards sometimes decorate a translated label with a bullet/star or
  // terminal punctuation. Preserve that decoration while translating the copy.
  const match = text.match(/^(\s*[✦●•⚡✉📞]?\s*)(.*?)([.!?:;,]?\s*)$/)
  if (!match) return text
  const [, prefix, core, suffix] = match
  return dictionary[core] ? `${prefix}${dictionary[core]}${suffix}` : text
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en')
  const selectionMadeRef = useRef(false)
  const textSourcesRef = useRef(new WeakMap<Text, { source: string; rendered: string }>())
  const attributeSourcesRef = useRef(new WeakMap<Element, Map<string, { source: string; rendered: string }>>())

  useEffect(() => {
    const saved = window.localStorage.getItem(LANGUAGE_KEY) as Language | null
    if (selectionMadeRef.current) return
    const validSavedLanguage = saved && LANGUAGE_NAMES.some((item) => item.value === saved) ? saved : 'en'
    setLanguageState(validSavedLanguage)
    document.documentElement.lang = validSavedLanguage
  }, [])

  const setLanguage = (nextLanguage: Language) => {
    selectionMadeRef.current = true
    setLanguageState(nextLanguage)
    document.documentElement.lang = nextLanguage
    window.localStorage.setItem(LANGUAGE_KEY, nextLanguage)
  }

  const t = useCallback((text: string) => {
    return translateCopy(language, text)
  }, [language])

  // A few older page sections pre-date the language context and contain plain
  // JSX text. Localise those text nodes and accessible attributes from the same
  // in-app dictionary so the selector applies consistently across every route.
  // This stays entirely local: no page copy is sent to a translation service.
  useEffect(() => {
    document.documentElement.lang = language
    const textSources = textSourcesRef.current
    const attributeSources = attributeSourcesRef.current
    const translatedAttributes = ['aria-label', 'placeholder', 'title', 'alt'] as const
    let applying = false

    const translateTextNode = (node: Text) => {
      const parent = node.parentElement
      if (!parent || parent.closest('[data-no-translate]') || ['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(parent.tagName)) return
      const current = node.nodeValue || ''
      const previous = textSources.get(node)
      const source = previous && current === previous.rendered ? previous.source : current
      const trimmed = source.trim()
      if (!trimmed) return
      const translated = t(trimmed)
      const rendered = translated === trimmed ? source : source.replace(trimmed, translated)
      textSources.set(node, { source, rendered })
      if (current !== rendered) node.nodeValue = rendered
    }

    const translateElement = (element: Element) => {
      const sources = attributeSources.get(element) || new Map<string, { source: string; rendered: string }>()
      for (const attribute of translatedAttributes) {
        const current = element.getAttribute(attribute)
        if (!current) continue
        const previous = sources.get(attribute)
        const source = previous && current === previous.rendered ? previous.source : current
        const rendered = t(source)
        sources.set(attribute, { source, rendered })
        if (current !== rendered) element.setAttribute(attribute, rendered)
      }
      if (sources.size) attributeSources.set(element, sources)
    }

    const translateTree = (root: Node) => {
      applying = true
      if (root.nodeType === Node.TEXT_NODE) translateTextNode(root as Text)
      if (root.nodeType === Node.ELEMENT_NODE) translateElement(root as Element)
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text)
        else translateElement(node as Element)
        node = walker.nextNode()
      }
      applying = false
    }

    translateTree(document.body)
    const observer = new MutationObserver((mutations) => {
      if (applying) return
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') translateTree(mutation.target)
        if (mutation.type === 'attributes') translateElement(mutation.target as Element)
        for (const node of mutation.addedNodes) translateTree(node)
      }
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...translatedAttributes],
    })
    return () => observer.disconnect()
  }, [language, t])

  const value = useMemo<LanguageContextValue>(() => ({ language, setLanguage, t }), [language, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider.')
  return context
}

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { language, setLanguage, t } = useLanguage()

  return (
    <label className={`language-switcher ${className}`.trim()}>
      <Globe2 size={16} aria-hidden="true" />
      <span className="sr-only">{t('Language')}</span>
      <select aria-label={t('Language')} value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
        {LANGUAGE_NAMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>
  )
}
