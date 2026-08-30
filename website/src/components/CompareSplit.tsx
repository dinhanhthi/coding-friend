type CompareSplitProps = {
  without: string;
  withCf: string;
};

export default function CompareSplit({ without, withCf }: CompareSplitProps) {
  return (
    <section
      className="compare-split not-prose"
      aria-label="Without Coding Friend versus with Coding Friend"
    >
      <div className="compare-pane compare-pane--without">
        <p className="mono-label">harness only</p>
        <p className="compare-title">without cf</p>
        <p className="compare-body">{without}</p>
      </div>
      <div className="compare-pane compare-pane--with">
        <p className="mono-label">standards · memory</p>
        <p className="compare-title">
          with <span>cf</span>
        </p>
        <p className="compare-body">{withCf}</p>
      </div>
      <span className="compare-join" aria-hidden="true">
        →
      </span>
    </section>
  );
}
