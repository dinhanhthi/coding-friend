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
        <p className="text-muted mb-1 text-xs">Harness only</p>
        <p className="compare-title">Without CF</p>
        <p className="compare-body">{without}</p>
      </div>
      <div className="compare-pane compare-pane--with">
        <p className="text-muted mb-1 text-xs">Standards · memory</p>
        <p className="compare-title">With CF</p>
        <p className="compare-body">{withCf}</p>
      </div>
      <span className="compare-join" aria-hidden="true">
        →
      </span>
    </section>
  );
}
