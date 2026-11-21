import Play from "./Play";

// The daily loop from the docs' Workflow diagram, in order: the command, then what it leaves behind.
const STOPS = [
  { cmd: "/cf-plan", leaves: "docs/plans/" },
  { cmd: "cf-tdd", leaves: "your code" },
  { cmd: "/cf-review", leaves: "a verdict" },
  { cmd: "/cf-commit", leaves: "git history" },
  { cmd: "/cf-ship", leaves: "a pull request" },
];

export default function LoopTrack() {
  return (
    <div className="loop">
      <div className="loop__track">
        <Play className="loop__rail">
          <span className="loop__runner" />
        </Play>
        <ol className="loop__stops">
          {STOPS.map((stop) => (
            <li key={stop.cmd}>
              <span className="loop__dot" aria-hidden="true" />
              <code>{stop.cmd}</code>
              <p className="loop__leaves">{stop.leaves}</p>
            </li>
          ))}
        </ol>
      </div>
      <p className="loop__bug">
        <span className="loop__bug-arc" aria-hidden="true" />
        <span>
          Bug? <code>/cf-fix</code>, then <code>cf-sys-debug</code> if it comes
          back.
        </span>
      </p>
    </div>
  );
}
