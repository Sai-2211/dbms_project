import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";

export default function Drawer({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  active = true,
  onBack,
  backLabel = "Back",
  navigation,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  active?: boolean;
  onBack?: () => void;
  backLabel?: string;
  navigation?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        (onBack || onClose)();
      }
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select, textarea, a[href], [tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [active, onClose, onBack]);
  return (
    <div
      className="overlay"
      style={active ? undefined : { display: "none" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`drawer ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="drawer-header">
          <div>
            {onBack && (
              <button
                type="button"
                className="text-button drawer-back"
                onClick={onBack}
              >
                <ArrowLeft size={16} />
                {backLabel}
              </button>
            )}
            {navigation}
            <span className="eyebrow">REGISTRY RECORD</span>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Close panel"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
