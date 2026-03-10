import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type SelectOption = {
  value: string;
  label: string;
};

interface ScrollableSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function ScrollableSelect({
  value,
  options,
  onChange,
  placeholder = "Select",
  className,
  disabled = false,
}: ScrollableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "w-full border-2 border-amplifi-border bg-amplifi-surface px-3 py-2.5 font-medium text-sm rounded-amplifi",
          "flex items-center justify-between text-left text-amplifi-text",
          disabled && "opacity-60 cursor-not-allowed"
        )}
      >
        <span className={cn(!selected && "text-amplifi-muted")}>
          {selected?.label ?? placeholder}
        </span>
        <span className="ml-2 text-xs text-amplifi-muted">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 mt-1 z-40 border-2 border-amplifi-border bg-white rounded-amplifi shadow-amplifi max-h-64 overflow-y-auto py-1">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-amplifi-muted">
              No options
            </div>
          ) : (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  "hover:bg-amplifi-surface text-amplifi-text",
                  option.value === value && "bg-amplifi-best-offer text-amplifi-best-offer-text"
                )}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
