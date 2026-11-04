import { CallWidget } from "@/components/call/CallWidget";

// Temporary page to test the call flow end to end. The real landing page replaces it.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-bold">ByteVoice এখন বাংলাদেশে</h1>
      <p className="max-w-md text-slate-300">রাকিব ডেন্টাল কেয়ারের AI রিসেপশনিস্টের সাথে বাংলায় কথা বলে দেখুন।</p>
      <CallWidget />
    </main>
  );
}
