import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { signOut } from "../actions";
import { NavLink } from "@/components/portal/NavLink";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");
  const { data: staff } = await supabase.from("staff").select("full_name, role, clinics(name_en, name_bn)").eq("user_id", user.id).single();
  const clinic = (staff?.clinics as unknown as { name_en: string; name_bn: string } | null);

  return (
    <div className="min-h-screen bg-slate-50 font-[family-name:var(--font-inter)] text-slate-900 lg:flex">
      <aside className="bg-[#0b1226] text-slate-300 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-col">
        <div className="px-5 py-5">
          <Link href="/" className="text-xs font-semibold uppercase tracking-widest text-amber-400">ByteVoice · BD</Link>
          <p className="mt-1 font-semibold text-white">{clinic?.name_en ?? "Clinic"}</p>
          <p className="text-sm font-[family-name:var(--font-bangla)] text-slate-400">{clinic?.name_bn}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible">
          <NavLink href="/portal">Dashboard</NavLink>
          <NavLink href="/portal/calls">Calls</NavLink>
          <NavLink href="/portal/appointments">Appointments</NavLink>
          <NavLink href="/portal/callbacks">Callbacks</NavLink>
          <NavLink href="/portal/patients">Patients</NavLink>
          <NavLink href="/portal/data-model">Data model</NavLink>
        </nav>
        <div className="hidden border-t border-white/10 px-5 py-4 text-sm lg:block">
          <p className="text-white">{staff?.full_name}</p>
          <p className="text-xs capitalize text-slate-400">{staff?.role} · {user.email}</p>
          <form action={signOut}><button className="mt-2 text-xs text-amber-400 hover:underline">Sign out</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
