export default function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="adm-page-title">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}
