// All landing page text, Bangla first. Content is a demo pitch, not real company claims.
export const COPY = {
  nav: {
    how: { bn: "কীভাবে কাজ করে", en: "How it works" },
    features: { bn: "সুবিধা", en: "Features" },
    useCases: { bn: "কাদের জন্য", en: "Who it's for" },
    pricing: { bn: "মূল্য", en: "Pricing" },
    portal: { bn: "ক্লিনিক পোর্টাল", en: "Clinic portal" },
    demo: { bn: "ডেমো নিন", en: "Book a demo" },
  },
  hero: {
    badge: { bn: "ByteVoice এখন বাংলাদেশে", en: "ByteVoice is now in Bangladesh" },
    title1: { bn: "আপনার ক্লিনিকের ফোন", en: "Your clinic's phone," },
    title2: { bn: "এখন বাংলায়, ২৪ ঘণ্টা।", en: "answered in Bangla, 24/7." },
    sub: {
      bn: "Byte আপনার AI রিসেপশনিস্ট। ঢাকার মানুষের মতো স্বাভাবিক বাংলায় কথা বলে, appointment বুক করে, সময় বদলায়, বাতিল করে, আর প্রতিটা কলের সব তথ্য গুছিয়ে রাখে।",
      en: "Byte is your AI receptionist. It speaks natural, everyday Dhaka Bangla, books, moves and cancels appointments, and keeps every call neatly organised for your staff.",
    },
    try: { bn: "এখনই কথা বলে দেখুন: রাকিব ডেন্টাল কেয়ার (ডেমো ক্লিনিক)", en: "Try it now: Rakib Dental Care (demo clinic)" },
    portalCta: { bn: "কল কোথায় জমা হয় দেখুন →", en: "See where calls are stored →" },
    chips: [
      { bn: "Appointment বুক হয়েছে", en: "Appointment booked", sub: { bn: "রবি, বিকাল ৪টা", en: "Sun, 4:00 PM" } },
      { bn: "বাংলা + English", en: "Bangla + English", sub: { bn: "মিশিয়ে বললেও বোঝে", en: "Understands code-switching" } },
      { bn: "কোনো কল মিস না", en: "No missed calls", sub: { bn: "রাত ২টাতেও", en: "Even at 2 AM" } },
    ],
  },
  problem: {
    title: { bn: "রিসেপশন ডেস্কের চেনা সমস্যা", en: "The front-desk problems every clinic knows" },
    items: [
      { stat: "৩০%", statEn: "30%", bn: "ব্যস্ত সময়ে কল ধরা হয় না, রোগী অন্য জায়গায় চলে যায়", en: "of calls go unanswered at busy times, and patients book elsewhere" },
      { stat: "রাত ৯টার পর", statEn: "After 9 PM", bn: "কেউ ফোন ধরে না, কিন্তু রোগীরা তখনই কল করে", en: "no one picks up, yet that's when many patients call" },
      { stat: "খাতা-কলম", statEn: "Pen & paper", bn: "ডাবল বুকিং, হারানো নম্বর, খুঁজে না পাওয়া তথ্য", en: "means double bookings, lost numbers and nothing searchable" },
    ],
    note: { bn: "*ডেমোর জন্য আনুমানিক উদাহরণ", en: "*Illustrative figures for this demo" },
  },
  how: {
    title: { bn: "কীভাবে কাজ করে", en: "How it works" },
    steps: [
      { bn: "রোগী ফোন করেন", en: "A patient calls", d: { bn: "সাথে সাথে Byte ধরে, সালাম দিয়ে শুরু করে। কোনো hold নেই।", en: "Byte answers instantly with a warm greeting. No hold music." } },
      { bn: "Byte কাজটা করে দেয়", en: "Byte handles it", d: { bn: "খালি সময় দেখে appointment বুক করে, নাম আর নম্বর পড়ে শুনিয়ে নিশ্চিত করে।", en: "Checks real availability, books the slot, and reads the name and number back to confirm." } },
      { bn: "আপনার টিম সব দেখে", en: "Your team sees everything", d: { bn: "প্রতিটা কল, transcript, বুকিং আর callback পোর্টালে সাথে সাথে চলে আসে।", en: "Every call, transcript, booking and callback appears in the portal within seconds." } },
    ],
  },
  features: {
    title: { bn: "একজন দক্ষ রিসেপশনিস্টের সব কাজ", en: "Everything a great receptionist does" },
    items: [
      { icon: "🗣️", bn: "স্বাভাবিক ঢাকার বাংলা", en: "Natural Dhaka Bangla", d: { bn: "বইয়ের ভাষা না, কলকাতার টানও না। \"জি\", \"আচ্ছা\" - রোজকার কথার মতো।", en: "Not textbook, not Kolkata. Everyday words like “জি” and “আচ্ছা”." } },
      { icon: "📅", bn: "বুক, রিশিডিউল, বাতিল", en: "Book, reschedule, cancel", d: { bn: "আসল খালি সময় দেখে। একই slot-এ দুইজনের বুকিং ডাটাবেসই আটকে দেয়।", en: "Uses real availability. The database itself blocks double bookings." } },
      { icon: "🔢", bn: "নম্বর আর তারিখ ঠিকঠাক", en: "Numbers and dates, right", d: { bn: "\"আগামী রবিবার বিকালে\", \"জিরো ওয়ান সেভেন\", \"ডাবল ওয়ান\" - সব বোঝে, পড়ে শুনিয়ে নিশ্চিত করে।", en: "Understands “next Sunday evening” and “double one”, then reads it back to confirm." } },
      { icon: "🩺", bn: "নিরাপদ সীমা", en: "Safe by design", d: { bn: "ওষুধ বা চিকিৎসার পরামর্শ দেয় না; জরুরি হলে হাসপাতালে যেতে বলে আর টিমকে জানায়।", en: "Never gives medical advice; flags emergencies and asks staff to call back." } },
      { icon: "🧹", bn: "অপ্রাসঙ্গিক কথা সামলায়", en: "Stays on task", d: { bn: "খেলা, রাজনীতি বা ফাজলামি - ভদ্রভাবে কাজের কথায় ফিরিয়ে আনে।", en: "Cricket, politics or pranks: politely brought back to the appointment." } },
      { icon: "📊", bn: "গোছানো ডেটা", en: "Organised data", d: { bn: "প্রতিটা কলের সারাংশ, ইংরেজি অনুবাদসহ transcript, আর খোঁজা যায় এমন রেকর্ড।", en: "Summaries, translated transcripts and searchable records for every call." } },
    ],
  },
  useCases: {
    title: { bn: "বাংলাদেশের স্বাস্থ্যসেবার জন্য তৈরি", en: "Built for healthcare in Bangladesh" },
    items: [
      { bn: "ডেন্টাল ক্লিনিক", en: "Dental clinics", d: { bn: "চেক-আপ, স্কেলিং, রুট ক্যানেলের serial", en: "Check-ups, scaling, root canal serials" } },
      { bn: "ডায়াগনস্টিক সেন্টার", en: "Diagnostic centres", d: { bn: "টেস্টের সময়, খালি পেটে আসার নিয়ম, রিপোর্টের খবর", en: "Test slots, fasting instructions, report status" } },
      { bn: "হাসপাতাল আউটডোর", en: "Hospital outpatients", d: { bn: "কোন ডাক্তার কবে বসেন, চেম্বারের সময়", en: "Which doctor sits when, chamber hours" } },
      { bn: "রিমাইন্ডার কল", en: "Reminder calls", d: { bn: "appointment-এর আগের দিন মনে করিয়ে দেওয়া", en: "A friendly call the day before each visit" } },
    ],
  },
  pricing: {
    title: { bn: "সহজ মাসিক মূল্য", en: "Simple monthly pricing" },
    note: { bn: "ডেমোর জন্য উদাহরণ মূল্য", en: "Example prices for this demo" },
    month: { bn: "/মাস", en: "/month" },
    plans: [
      { name: { bn: "শুরু", en: "Starter" }, price: "৳৪,৯৯৯", priceEn: "৳4,999", d: { bn: "ছোট চেম্বার", en: "Small chambers" }, f: [{ bn: "মাসে ৩০০ কল", en: "300 calls / month" }, { bn: "বাংলা কলার", en: "Bangla caller" }, { bn: "কল পোর্টাল", en: "Call portal" }] },
      { name: { bn: "ক্লিনিক", en: "Clinic" }, price: "৳১২,৯৯৯", priceEn: "৳12,999", d: { bn: "সবচেয়ে জনপ্রিয়", en: "Most popular" }, f: [{ bn: "মাসে ১,২০০ কল", en: "1,200 calls / month" }, { bn: "একসাথে ৫টি কল", en: "5 calls at once" }, { bn: "SMS কনফার্মেশন", en: "SMS confirmations" }, { bn: "রিমাইন্ডার কল", en: "Reminder calls" }], featured: true },
      { name: { bn: "হাসপাতাল", en: "Hospital" }, price: { bn: "কথা বলুন", en: "Let's talk" }, d: { bn: "একাধিক বিভাগ", en: "Multiple departments" }, f: [{ bn: "আনলিমিটেড কল", en: "Unlimited calls" }, { bn: "HIS / সফটওয়্যার ইন্টিগ্রেশন", en: "HIS / software integration" }, { bn: "নিজস্ব কণ্ঠ", en: "Custom voice" }] },
    ],
  },
  cta: {
    title: { bn: "আপনার ক্লিনিকে Byte চালু করতে চান?", en: "Want Byte answering your clinic's phone?" },
    sub: { bn: "১৫ মিনিটের ডেমোতে দেখাবো আপনার ক্লিনিকের জন্য কীভাবে কাজ করবে।", en: "A 15-minute demo, set up for your own clinic." },
    name: { bn: "আপনার নাম", en: "Your name" },
    clinic: { bn: "ক্লিনিক / হাসপাতালের নাম", en: "Clinic or hospital" },
    phone: { bn: "মোবাইল নম্বর", en: "Mobile number" },
    send: { bn: "ডেমোর অনুরোধ পাঠান", en: "Request a demo" },
    sent: { bn: "ধন্যবাদ! (এটা ডেমো ফর্ম, কোনো তথ্য পাঠানো হয়নি।)", en: "Thank you! (Demo form: nothing was sent.)" },
  },
  footer: { bn: "StrategyByte-এর ByteVoice-এর জন্য একটি ডেমো · সব রোগী ও ক্লিনিকের তথ্য কাল্পনিক", en: "A demo for StrategyByte's ByteVoice · all patient and clinic data is fictional" },
};
