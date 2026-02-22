interface Props {
  type?: "info" | "warning" | "tip";
  title?: string;
  children: React.ReactNode;
}

const styles = {
  info: "border-violet-700/40 bg-violet-900/20",
  warning: "border-amber-700 bg-amber-900/20",
  tip: "border-emerald-700 bg-emerald-900/20",
};

const icons = {
  info: (
    <svg
      className="h-5 w-5 text-violet-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  warning: (
    <svg
      className="h-5 w-5 text-amber-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  ),
  tip: (
    <svg
      className="h-5 w-5 text-emerald-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  ),
};

export default function Callout({ type = "info", title, children }: Props) {
  return (
    <div className={`my-6 rounded-lg border-l-4 p-4 ${styles[type]}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{icons[type]}</div>
        <div>
          {title && <div className="mb-1 font-medium text-white">{title}</div>}
          <div className="text-sm leading-relaxed text-slate-300">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
