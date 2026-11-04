import type { Metadata } from "next";
import { Hind_Siliguri, Inter } from "next/font/google";
import "./globals.css";

const bangla = Hind_Siliguri({ subsets: ["bengali", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-bangla" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "ByteVoice Bangladesh | বাংলায় AI রিসেপশনিস্ট",
  description: "An AI receptionist that answers your clinic's calls in natural Bangla, books appointments and keeps every call organised.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="bn" className={`${bangla.variable} ${inter.variable}`}>
      <body className="bg-[#070b1a] font-[family-name:var(--font-bangla)] text-white antialiased">{children}</body>
    </html>
  );
}
