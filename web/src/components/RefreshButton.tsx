interface Props {
  onClick: () => void;
  isPending: boolean;
  title?: string;
  className?: string;
}

export function RefreshButton({
  onClick,
  isPending,
  title = "Atualizar",
  className = "",
}: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      disabled={isPending}
      className={`icon-btn ${className} ${isPending ? "animate-pulse-dot" : ""}`}
      title={title}
      aria-label={title}
    >
      ↻
    </button>
  );
}
