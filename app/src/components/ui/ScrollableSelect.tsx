import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { LOGOS } from "@/lib/constants";

type SelectOption = {
  value: string;
  label: string;
  iconUrl?: string;
};

interface ScrollableSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function OptionContent({ option }: { option: SelectOption }) {
  return (
    <>
      {option.iconUrl && (
        <img
          src={option.iconUrl}
          alt=""
          className="mr-2 h-4 w-4 shrink-0 rounded-full object-cover"
        />
      )}
      {option.label}
    </>
  );
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
        <span className={cn("flex items-center", !selected && "text-amplifi-muted")}>
          {selected ? <OptionContent option={selected} /> : placeholder}
        </span>
        <img
          src={LOGOS.dropdown}
          alt=""
          className={cn("ml-2 h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")}
          aria-hidden
        />
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
                  "w-full px-3 py-2.5 text-left text-sm font-medium transition-colors flex items-center",
                  "hover:bg-amplifi-surface text-amplifi-text",
                  option.value === value && "bg-amplifi-best-offer text-amplifi-best-offer-text"
                )}
              >
                <OptionContent option={option} />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
