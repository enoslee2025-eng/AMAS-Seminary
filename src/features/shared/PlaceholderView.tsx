export function PlaceholderView({ title, summary, detail }: { title: string; summary: string; detail: string }) {
  return (
    <section className="content-card placeholder-card">
      <p className="eyebrow">Queued Module</p>
      <h2>{title}</h2>
      <p>{summary}</p>
      <div className="placeholder-divider" />
      <p>{detail}</p>
    </section>
  );
}
