export function App() {
  return (
    <div className="flex h-screen bg-paper text-ink">
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-rule bg-paper-2 p-4">
        <h1 className="text-sm font-semibold">Coding Friend</h1>
        <p className="font-mono text-xs text-muted">desktop</p>
      </aside>
      <main className="flex-1 overflow-auto p-6" />
    </div>
  );
}
