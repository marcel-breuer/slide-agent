"use client";

import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Link2, MapPin, Trash2, X } from "lucide-react";

import type { SlidePointer } from "@slide-agent/editor-core";
import { SlideRenderer } from "@slide-agent/presentation-renderer";
import type { PresentationDocument, SlideDocument } from "@slide-agent/presentation-schema";

export type PresentationPreviewProps = {
  initialSlideId: string;
  onClose: () => void;
  onClearPointers?: (slideId: string) => void;
  onPointerAdd?: (slideId: string, point: { x: number; y: number }) => void;
  onPointerChange?: (
    pointerId: string,
    changes: Pick<SlidePointer, "instruction" | "label">,
  ) => void;
  onPointerRemove?: (pointerId: string) => void;
  onPointerReferenceToggle?: (pointerId: string) => void;
  pointers?: readonly SlidePointer[];
  presentation: PresentationDocument;
  referencedPointerIds?: readonly string[];
};

export function PresentationPreview({
  initialSlideId,
  onClose,
  onClearPointers,
  onPointerAdd,
  onPointerChange,
  onPointerRemove,
  onPointerReferenceToggle,
  pointers = [],
  presentation,
  referencedPointerIds = [],
}: PresentationPreviewProps) {
  const [previewSlideId, setPreviewSlideId] = useState(() =>
    resolveInitialPreviewSlideId(presentation.slides, initialSlideId),
  );
  const activeSlideIndex = Math.max(
    0,
    presentation.slides.findIndex((slide) => slide.id === previewSlideId),
  );
  const activeSlide = presentation.slides[activeSlideIndex] ?? presentation.slides[0];
  const canGoPrevious = activeSlideIndex > 0;
  const canGoNext = activeSlideIndex >= 0 && activeSlideIndex < presentation.slides.length - 1;
  const [pointerMode, setPointerMode] = useState(false);
  const [selectedPointerId, setSelectedPointerId] = useState<string | null>(null);
  const activePointers = useMemo(
    () => pointers.filter((pointer) => pointer.slideId === activeSlide?.id),
    [activeSlide?.id, pointers],
  );
  const selectedPointer = activePointers.find((pointer) => pointer.id === selectedPointerId);
  const referencedPointerIdSet = useMemo(
    () => new Set(referencedPointerIds),
    [referencedPointerIds],
  );

  useEffect(() => {
    setPreviewSlideId(resolveInitialPreviewSlideId(presentation.slides, previewSlideId));
  }, [presentation.slides, previewSlideId]);

  useEffect(() => {
    const previousOverflow = globalThis.document?.body.style.overflow ?? "";
    if (globalThis.document?.body) {
      globalThis.document.body.style.overflow = "hidden";
    }

    return () => {
      if (globalThis.document?.body) {
        globalThis.document.body.style.overflow = previousOverflow;
      }
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: globalThis.Event): void {
      const key = "key" in event ? String(event.key) : "";

      if (key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (["ArrowRight", "PageDown", " "].includes(key)) {
        event.preventDefault();
        setPreviewSlideId((current) =>
          getPreviewNavigationSlideId(presentation.slides, current, 1),
        );
        return;
      }

      if (["ArrowLeft", "PageUp"].includes(key)) {
        event.preventDefault();
        setPreviewSlideId((current) =>
          getPreviewNavigationSlideId(presentation.slides, current, -1),
        );
      }
    }

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [onClose, presentation.slides]);

  const slideLabel = useMemo(() => {
    return `Slide ${activeSlideIndex + 1} of ${presentation.slides.length}`;
  }, [activeSlideIndex, presentation.slides.length]);

  if (!activeSlide) return null;

  return (
    <section
      aria-label="Presentation preview"
      className="fixed inset-0 z-50 flex min-h-screen flex-col bg-ink text-white"
      role="dialog"
      aria-modal="true"
    >
      <header className="flex min-h-16 items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
            {slideLabel}
          </div>
          <h2 className="truncate text-base font-bold">
            {activeSlide.title ?? presentation.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-app border border-white/20 bg-white/10 text-white hover:bg-white/20"
          aria-label="Close preview"
          title="Close preview"
        >
          <X size={18} />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[64px_minmax(0,1fr)_280px_64px] items-center gap-3 px-3 py-4 max-[900px]:grid-cols-[48px_minmax(0,1fr)_48px]">
        <PreviewNavigationButton
          label="Previous slide"
          disabled={!canGoPrevious}
          onClick={() =>
            setPreviewSlideId((current) =>
              getPreviewNavigationSlideId(presentation.slides, current, -1),
            )
          }
        >
          <ChevronLeft size={24} />
        </PreviewNavigationButton>

        <div className="grid min-h-0 place-items-center">
          <div className="max-w-6xl" style={{ width: "min(100%, calc((100vh - 7rem) * 16 / 9))" }}>
            <SlideRenderer
              interactionMode={pointerMode ? "pointer" : "preview"}
              onPointerSelect={setSelectedPointerId}
              onSlidePointerDown={(point) => onPointerAdd?.(activeSlide.id, point)}
              pointers={activePointers.map((pointer) => ({
                ...pointer,
                selected: pointer.id === selectedPointerId,
              }))}
              presentation={presentation}
              slide={activeSlide}
            />
          </div>
        </div>

        <aside className="self-stretch overflow-y-auto border-l border-white/10 px-3 py-2 max-[900px]:fixed max-[900px]:inset-x-3 max-[900px]:bottom-3 max-[900px]:z-10 max-[900px]:max-h-64 max-[900px]:rounded-app max-[900px]:border max-[900px]:border-white/15 max-[900px]:bg-ink max-[900px]:shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-white/60">
                Pointers
              </div>
              <div className="text-sm font-semibold">{activePointers.length} on this slide</div>
            </div>
            <button
              type="button"
              aria-label="Toggle pointer mode"
              title="Toggle pointer mode"
              onClick={() => setPointerMode((current) => !current)}
              className={`grid h-10 w-10 place-items-center rounded-app border ${
                pointerMode
                  ? "border-white bg-white text-ink"
                  : "border-white/20 bg-white/10 text-white"
              }`}
            >
              <MapPin size={17} />
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {activePointers.map((pointer) => {
              const isReferenced = referencedPointerIdSet.has(pointer.id);
              return (
                <div
                  key={pointer.id}
                  className={`rounded-app border p-2 ${
                    pointer.id === selectedPointerId
                      ? "border-white bg-white/10"
                      : "border-white/15"
                  }`}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 text-left"
                    onClick={() => setSelectedPointerId(pointer.id)}
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white">
                      {pointer.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{pointer.instruction}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onPointerReferenceToggle?.(pointer.id)}
                    className={`mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-app text-xs font-semibold ${
                      isReferenced ? "bg-white text-ink" : "border border-white/20 text-white"
                    }`}
                  >
                    <Link2 size={14} />
                    {isReferenced ? "Linked in chat" : "Link in chat"}
                  </button>
                </div>
              );
            })}
          </div>

          {selectedPointer ? (
            <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
              <label className="block text-xs font-semibold text-white/70">
                Label
                <input
                  aria-label="Pointer label"
                  maxLength={12}
                  value={selectedPointer.label}
                  onChange={(event) =>
                    onPointerChange?.(selectedPointer.id, {
                      instruction: selectedPointer.instruction,
                      label: event.target.value,
                    })
                  }
                  className="mt-1 h-9 w-full rounded-app border border-white/20 bg-white/10 px-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs font-semibold text-white/70">
                Instruction
                <textarea
                  aria-label="Pointer instruction"
                  value={selectedPointer.instruction}
                  onChange={(event) =>
                    onPointerChange?.(selectedPointer.id, {
                      instruction: event.target.value,
                      label: selectedPointer.label,
                    })
                  }
                  className="mt-1 min-h-20 w-full resize-none rounded-app border border-white/20 bg-white/10 p-2 text-sm text-white"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  onPointerRemove?.(selectedPointer.id);
                  setSelectedPointerId(null);
                }}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-app border border-white/20 text-sm font-semibold"
              >
                <Trash2 size={15} /> Remove pointer
              </button>
            </div>
          ) : null}

          {activePointers.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                onClearPointers?.(activeSlide.id);
                setSelectedPointerId(null);
              }}
              className="mt-4 w-full text-xs font-semibold text-white/60 hover:text-white"
            >
              Clear slide pointers
            </button>
          ) : null}
        </aside>

        <PreviewNavigationButton
          label="Next slide"
          disabled={!canGoNext}
          onClick={() =>
            setPreviewSlideId((current) =>
              getPreviewNavigationSlideId(presentation.slides, current, 1),
            )
          }
        >
          <ChevronRight size={24} />
        </PreviewNavigationButton>
      </div>
    </section>
  );
}

function PreviewNavigationButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-12 w-12 place-items-center rounded-app border text-white transition ${
        disabled
          ? "cursor-not-allowed border-white/10 bg-white/5 text-white/30"
          : "border-white/20 bg-white/10 hover:bg-white/20"
      }`}
    >
      {children}
    </button>
  );
}

export function resolveInitialPreviewSlideId(
  slides: readonly SlideDocument[],
  requestedSlideId: string,
): string {
  return slides.some((slide) => slide.id === requestedSlideId)
    ? requestedSlideId
    : (slides[0]?.id ?? "");
}

export function getPreviewNavigationSlideId(
  slides: readonly SlideDocument[],
  currentSlideId: string,
  delta: -1 | 1,
): string {
  if (slides.length === 0) return "";

  const currentIndex = Math.max(
    0,
    slides.findIndex((slide) => slide.id === currentSlideId),
  );
  const nextIndex = Math.min(slides.length - 1, Math.max(0, currentIndex + delta));

  return slides[nextIndex]?.id ?? slides[0]!.id;
}
