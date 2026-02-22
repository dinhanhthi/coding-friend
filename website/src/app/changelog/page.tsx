import Container from "@/components/ui/Container";
import {
  parseChangelog,
  getPluginChangelog,
  getCliChangelog,
} from "@/lib/changelog";
import ChangelogTabs from "./ChangelogTabs";

export default function ChangelogPage() {
  const pluginEntries = parseChangelog(getPluginChangelog());
  const cliEntries = parseChangelog(getCliChangelog());

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
          />
        </div>
      </Container>
    </div>
  );
}
