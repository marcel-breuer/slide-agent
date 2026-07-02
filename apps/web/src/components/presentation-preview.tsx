"use client";

import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { SlideRenderer } from "@slide-agent/presentation-renderer";
import type { PresentationDocument, SlideDocument } from "@slide-agent/presentation-schema";

export type PresentationPreviewProps = {
  initialSlideId: string;
  onClose: () => void;
  presentation: PresentationDocument;
};

export function PresentationPreview({
  initialSlideId,
  onClose,
  presentation
}: PresentationPreviewProps) {
  const [previewSlideId, setPreviewSlideId] = useState(() => resolveInitialPreviewSlideId(presentation.slides, initialSlideId));
  const activeSlideIndex = Math.max(
    0,
    presentation.slides.findIndex((slide) => slide.id === previewSlideId)
  );
  const activeSlide = presentation.slides[activeSlideIndex] ?? presentation.slides[0];
  const canGoPrevious = activeSlideIndex > 0;
  const canGoNext = activeSlideIndex >= 0 && activeSlideIndex < presentation.slides.length - 1;

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
        setPreviewSlideId((current) => getPreviewNavigationSlideId(presentation.slides, current, 1));
        return;
      }

      if (["ArrowLeft", "PageUp"].includes(key)) {
        event.preventDefault();
        setPreviewSlideId((current) => getPreviewNavigationSlideId(presentation.slides, current, -1));
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
          <div className="text-xs font-semibold uppercase tracking-wide text-white/60">{slideLabel}</div>
          <h2 className="truncate text-base font-bold">{activeSlide.title ?? presentation.title}</h2>
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

      <div className="grid min-h-0 flex-1 grid-cols-[64px_minmax(0,1fr)_64px] items-center gap-3 px-3 py-4">
        <PreviewNavigationButton
          label="Previous slide"
          disabled={!canGoPrevious}
          onClick={() => setPreviewSlideId((current) => getPreviewNavigationSlideId(presentation.slides, current, -1))}
        >
          <ChevronLeft size={24} />
        </PreviewNavigationButton>

        <div className="grid min-h-0 place-items-center">
          <div className="max-w-6xl" style={{ width: "min(100%, calc((100vh - 7rem) * 16 / 9))" }}>
            <SlideRenderer interactionMode="preview" presentation={presentation} slide={activeSlide} />
          </div>
        </div>

        <PreviewNavigationButton
          label="Next slide"
          disabled={!canGoNext}
          onClick={() => setPreviewSlideId((current) => getPreviewNavigationSlideId(presentation.slides, current, 1))}
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
  onClick
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

export function resolveInitialPreviewSlideId(slides: readonly SlideDocument[], requestedSlideId: string): string {
  return slides.some((slide) => slide.id === requestedSlideId) ? requestedSlideId : (slides[0]?.id ?? "");
}

export function getPreviewNavigationSlideId(
  slides: readonly SlideDocument[],
  currentSlideId: string,
  delta: -1 | 1
): string {
  if (slides.length === 0) return "";

  const currentIndex = Math.max(
    0,
    slides.findIndex((slide) => slide.id === currentSlideId)
  );
  const nextIndex = Math.min(slides.length - 1, Math.max(0, currentIndex + delta));

  return slides[nextIndex]?.id ?? slides[0]!.id;
}
