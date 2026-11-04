import { Hero } from "@/components/landing/Hero";
import { LangProvider } from "@/components/landing/i18n";
import { DemoCta, Features, Footer, HowItWorks, Nav, Pricing, Problem, UseCases } from "@/components/landing/Sections";

export default function Home() {
  return (
    <LangProvider>
      <div id="top" className="overflow-x-hidden">
        <Nav />
        <main>
          <Hero />
          <Problem />
          <HowItWorks />
          <Features />
          <UseCases />
          <Pricing />
          <DemoCta />
        </main>
        <Footer />
      </div>
    </LangProvider>
  );
}
