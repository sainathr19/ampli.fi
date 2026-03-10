interface PaginationControlsProps {
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onPageChange: (page: number) => void;
  /** Optional: show "Page X of Y" text */
  showLabel?: boolean;
}

export function PaginationControls({
  page,
  totalPages,
  hasNextPage,
  hasPrevPage,
  onPageChange,
  showLabel = true,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-4 pt-4 border-t border-amplifi-border">
      {showLabel && (
        <span className="text-sm text-amplifi-muted">
          Page {page} of {totalPages}
        </span>
      )}
      <div className="flex items-center gap-2 ml-auto">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrevPage}
          className="rounded-amplifi px-3 py-2 text-sm font-medium text-amplifi-text bg-amplifi-surface border border-amplifi-border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amplifi-border transition-colors"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNextPage}
          className="rounded-amplifi px-3 py-2 text-sm font-medium text-amplifi-text bg-amplifi-surface border border-amplifi-border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amplifi-border transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
