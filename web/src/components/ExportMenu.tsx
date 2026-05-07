interface Props {
  csvUrl: string;
  xlsxUrl: string;
  label?: string;
  disabled?: boolean;
}

export function ExportMenu({
  csvUrl,
  xlsxUrl,
  label = "Exportar",
  disabled,
}: Props) {
  const baseClass =
    "text-sm px-3 py-1 rounded border border-govbr-blue text-govbr-blue hover:bg-govbr-lightblue disabled:opacity-50 disabled:cursor-not-allowed";
  if (disabled) {
    return (
      <div className="inline-flex gap-1">
        <span className="text-[11px] uppercase tracking-wider text-slate-700 self-center mr-1">
          {label}
        </span>
        <span className={baseClass} aria-disabled>
          CSV
        </span>
        <span className={baseClass} aria-disabled>
          XLSX
        </span>
      </div>
    );
  }
  return (
    <div className="inline-flex gap-1">
      <span className="text-[11px] uppercase tracking-wider text-slate-700 self-center mr-1">
        {label}
      </span>
      <a className={baseClass} href={csvUrl} download>
        CSV
      </a>
      <a className={baseClass} href={xlsxUrl} download>
        XLSX
      </a>
    </div>
  );
}
