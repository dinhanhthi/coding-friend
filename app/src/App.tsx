import { CliGate } from "@/components/CliGate";
import { Dashboard } from "@/components/Dashboard";

export function App() {
  return <CliGate>{(cli) => <Dashboard cli={cli} />}</CliGate>;
}
