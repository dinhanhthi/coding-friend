import Hero from "@/components/landing/Hero";
import StatsSection from "@/components/landing/StatsSection";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";
import InstallSection from "@/components/landing/InstallSection";

export default function Home() {
  return (
    <>
      <Hero />
      <StatsSection />
      <HowItWorks />
      <Features />
      <InstallSection />
    </>
  );
}
