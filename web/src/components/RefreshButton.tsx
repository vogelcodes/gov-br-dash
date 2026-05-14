interface Props {
  onClick: () => void;
  isPending: boolean;
  title?: string;
  className?: string;
  disabled?: boolean;
  hidden?: boolean;
}

export function RefreshButton({
  onClick,
  isPending,
  title = "Atualizar",
  className = "",
  disabled = false,
  hidden = false,
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
      className={`icon-btn ${className} ${
        disabled ? "hidden" : ""
      } ${hidden ? "hidden" : ""} ${isPending ? "animate-pulse-dot" : ""}`}
      title={title}
      aria-label={title}
    >
      ↻
    </button>
  );
}
