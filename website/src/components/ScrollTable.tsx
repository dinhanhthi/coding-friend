/** MDX `table`: a real table inside a sideways scroller, so narrow screens scroll it instead of crushing columns. */
export default function ScrollTable(props: React.ComponentProps<"table">) {
  return (
    <div className="table-scroll">
      <table {...props} />
    </div>
  );
}
