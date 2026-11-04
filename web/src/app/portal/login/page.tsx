"use client";

import { useActionState } from "react";
import { signIn } from "../actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#070b1a] px-4">
      <form action={action} className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-8 text-slate-900 shadow-2xl">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">ByteVoice · Bangladesh</p>
          <h1 className="mt-1 text-2xl font-bold">Clinic portal</h1>
          <p className="mt-1 text-sm text-slate-500">Rakib Dental Care · রাকিব ডেন্টাল কেয়ার</p>
        </div>
        <label className="block text-sm font-medium">
          Email
          <input name="email" type="email" required autoComplete="username" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input name="password" type="password" required autoComplete="current-password" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" />
        </label>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <button disabled={pending} className="w-full rounded-lg bg-slate-900 py-2.5 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
