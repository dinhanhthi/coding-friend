import Hero from "@/components/landing/Hero";
import StatsSection from "@/components/landing/StatsSection";
import EcosystemSection from "@/components/landing/EcosystemSection";
import Features from "@/components/landing/Features";
import Skills from "@/components/landing/Skills";
import Agents from "@/components/landing/Agents";
import HowItWorks from "@/components/landing/HowItWorks";
import InstallSection from "@/components/landing/InstallSection";

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Coding Friend",
    description:
      "A lean toolkit that enforces TDD, systematic debugging, smart commits, code review, and knowledge capture across your engineering workflow.",
    url: "https://cf.dinhanhthi.com",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Cross-platform",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    author: {
      "@type": "Person",
      name: "Anh-Thi Dinh",
      url: "https://dinhanhthi.com",
    },
  };

  return (
    <div className="overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Hero has its own gradient bg */}
      <Hero />
      <div className="bg-navy-950/50">
        <StatsSection />
      </div>
      <EcosystemSection />
      <div className="bg-navy-950/50">
        <Features />
      </div>
      <HowItWorks />
      <div className="bg-navy-950/50">
        <Skills />
      </div>
      <Agents />
      <div className="bg-navy-950/50">
        <InstallSection />
      </div>
    </div>
  );
}
