"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/portal" ? path === href : path.startsWith(href);
  return (
    <Link href={href} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${active ? "bg-white/10 font-medium text-white" : "hover:bg-white/5 hover:text-white"}`}>
      {children}
    </Link>
  );
}
