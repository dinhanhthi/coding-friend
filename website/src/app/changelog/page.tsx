import type { Metadata } from "next";
import Container from "@/components/ui/Container";
import {
  parseChangelog,
  getPluginChangelog,
  getCliChangelog,
  getLearnHostChangelog,
  getLearnMcpChangelog,
} from "@/lib/changelog";
import ChangelogTabs from "./ChangelogTabs";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "New features, improvements, and fixes across Coding Friend releases.",
  alternates: {
    canonical: "https://cf.dinhanhthi.com/changelog/",
  },
};

export default function ChangelogPage() {
  const pluginEntries = parseChangelog(getPluginChangelog());
  const cliEntries = parseChangelog(getCliChangelog());
  const learnHostEntries = parseChangelog(getLearnHostChangelog());
  const learnMcpEntries = parseChangelog(getLearnMcpChangelog());

  return (
    <div className="min-h-screen py-16 sm:py-20">
      <Container>
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold text-white">Changelog</h1>
            <p className="mt-3 text-lg text-slate-300">
              New features, improvements, and fixes across releases.
            </p>
          </div>

          <ChangelogTabs
            pluginEntries={pluginEntries}
            cliEntries={cliEntries}
            learnHostEntries={learnHostEntries}
            learnMcpEntries={learnMcpEntries}
          />
        </div>
      </Container>
    </div>
  );
}
