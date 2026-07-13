import { X } from "lucide-react";
import type { LayoutSuggestion } from "@slide-agent/editor-core";

export function LayoutSuggestionPreview({
  suggestions,
  onApply,
  onReject,
}: {
  suggestions: LayoutSuggestion[];
  onApply: (suggestion: LayoutSuggestion) => void;
  onReject: () => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div
      className="mt-3 rounded-app border border-primary/30 bg-primary/5 px-3 py-3"
      aria-label="Layout suggestions"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink">Layout suggestions</div>
          <div className="mt-1 text-xs text-muted">
            Preview alternatives without changing the active slide.
          </div>
        </div>
        <button
          type="button"
          onClick={onReject}
          className="grid h-8 w-8 place-items-center rounded-app border border-line bg-white text-muted hover:border-primary hover:text-primary"
          title="Reject layout suggestions"
          aria-label="Reject layout suggestions"
        >
          <X size={15} />
        </button>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {suggestions.map((suggestion) => (
          <div className="rounded-app border border-line bg-white px-3 py-3" key={suggestion.id}>
            <div className="text-sm font-semibold text-ink">{suggestion.title}</div>
            <div className="mt-1 text-xs leading-5 text-muted">{suggestion.summary}</div>
            <div className="mt-2 text-xs leading-5 text-muted">
              {suggestion.designProfileCompatibility}
              {suggestion.overflowRisk
                ? ` ${suggestion.overflowRisk}`
                : " No overflow risk detected."}
            </div>
            {suggestion.preservedElementIds.length > 0 ? (
              <div className="mt-1 text-xs font-semibold text-amber-700">
                Locked elements preserved: {suggestion.preservedElementIds.length}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => onApply(suggestion)}
              className="mt-3 h-8 rounded-app bg-primary px-3 text-xs font-semibold text-white"
            >
              Apply suggestion
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
