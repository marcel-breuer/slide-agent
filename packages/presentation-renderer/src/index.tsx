import type { CSSProperties, PointerEvent, ReactElement } from "react";

import {
  LOGICAL_SLIDE_HEIGHT,
  LOGICAL_SLIDE_WIDTH,
  type PresentationDocument,
  type SlideDocument,
  type SlideElement
} from "@slide-agent/presentation-schema";

export type SlideRendererProps = {
  presentation: PresentationDocument;
  slide: SlideDocument;
  selectedElementIds?: readonly string[];
  pointers?: readonly SlidePointerOverlay[];
  interactionMode?: "preview" | "select" | "pointer";
  onElementPointerDown?: (elementId: string) => void;
  onSlidePointerDown?: (point: { x: number; y: number }) => void;
  onPointerSelect?: (pointerId: string) => void;
};

const slideStyle: CSSProperties = {
  aspectRatio: `${LOGICAL_SLIDE_WIDTH} / ${LOGICAL_SLIDE_HEIGHT}`,
  containerType: "inline-size",
  position: "relative",
  width: "100%",
  overflow: "hidden"
};

export type SlidePointerOverlay = {
  id: string;
  x: number;
  y: number;
  label: string;
  instruction?: string;
  selected?: boolean;
};

function elementFrameStyle(element: SlideElement): CSSProperties {
  const { frame } = element;

  return {
    position: "absolute",
    left: `${(frame.x / LOGICAL_SLIDE_WIDTH) * 100}%`,
    top: `${(frame.y / LOGICAL_SLIDE_HEIGHT) * 100}%`,
    width: `${(frame.width / LOGICAL_SLIDE_WIDTH) * 100}%`,
    height: `${(frame.height / LOGICAL_SLIDE_HEIGHT) * 100}%`,
    transform: `rotate(${frame.rotation}deg)`,
    zIndex: element.zIndex,
    opacity: element.opacity,
    display: element.visible ? "block" : "none",
    pointerEvents: element.locked ? "none" : "auto"
  };
}

function getLogicalPoint(event: PointerEvent): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;

  return {
    x: (localX / rect.width) * LOGICAL_SLIDE_WIDTH,
    y: (localY / rect.height) * LOGICAL_SLIDE_HEIGHT
  };
}

function renderText(element: Extract<SlideElement, { type: "text" }>): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent:
          element.verticalAlign === "middle"
            ? "center"
            : element.verticalAlign === "bottom"
              ? "flex-end"
              : "flex-start"
      }}
    >
      {element.paragraphs.map((paragraph, paragraphIndex) => (
        <p
          key={paragraphIndex}
          style={{
            margin: `0 0 ${paragraph.spacingAfter}px 0`,
            textAlign: paragraph.align,
            lineHeight: paragraph.lineHeight,
            paddingLeft: paragraph.indent
          }}
        >
          {paragraph.runs.map((run, runIndex) => (
            <span
              key={runIndex}
              style={{
                color: run.color,
                fontFamily: run.fontFamily,
                fontSize: `${(run.fontSize / LOGICAL_SLIDE_WIDTH) * 100}cqw`,
                fontWeight: run.fontWeight,
                fontStyle: run.italic ? "italic" : "normal",
                textDecoration: run.underline ? "underline" : "none"
              }}
            >
              {run.text}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

function renderElement(element: SlideElement): ReactElement | null {
  switch (element.type) {
    case "text":
      return renderText(element);
    case "shape":
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: element.fill,
            border: `${element.borderWidth}px solid ${element.borderColor}`,
            borderRadius: element.shape === "roundedRectangle" ? 8 : element.shape === "ellipse" ? "50%" : 0
          }}
        />
      );
    case "image":
      return (
        <img
          src={element.src}
          alt={element.alt}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      );
    case "icon":
      return (
        <div
          aria-label={element.accessibilityLabel ?? element.icon}
          style={{ width: "100%", height: "100%", color: element.color }}
        >
          {element.svg ? (
            <span dangerouslySetInnerHTML={{ __html: element.svg }} />
          ) : (
            <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="9" strokeWidth={element.strokeWidth} />
              <path d="M8 12h8M12 8v8" strokeWidth={element.strokeWidth} strokeLinecap="round" />
            </svg>
          )}
        </div>
      );
    case "line":
    case "arrow":
      return (
        <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none">
          <defs>
            <marker id={`${element.id}-arrow`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill={element.stroke} />
            </marker>
          </defs>
          <line
            x1={element.start.x}
            y1={element.start.y}
            x2={element.end.x}
            y2={element.end.y}
            stroke={element.stroke}
            strokeWidth={element.strokeWidth}
            markerEnd={element.type === "arrow" ? `url(#${element.id}-arrow)` : undefined}
          />
        </svg>
      );
    case "table":
      return (
        <table style={{ width: "100%", height: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <tbody>
            {element.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    style={{
                      border: `1px solid ${element.borderColor}`,
                      padding: 8,
                      fontWeight: rowIndex < element.headerRows ? 700 : 400
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "chart":
      return (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: "100%", padding: 12 }}>
          {element.series[0]?.values.map((value, index) => (
            <div
              key={`${element.categories[index]}-${value}`}
              title={`${element.categories[index]}: ${value}`}
              style={{
                flex: 1,
                height: `${Math.max(5, Math.min(100, value))}%`,
                background: "#9333ea",
                borderRadius: 4
              }}
            />
          ))}
        </div>
      );
    case "group":
      return null;
  }
}

export function SlideRenderer({
  presentation,
  slide,
  selectedElementIds = [],
  pointers = [],
  interactionMode = "select",
  onElementPointerDown,
  onSlidePointerDown,
  onPointerSelect
}: SlideRendererProps): ReactElement {
  const selected = new Set(selectedElementIds);
  const isPreview = interactionMode === "preview";

  return (
    <section
      aria-label={slide.title ?? "Slide"}
      onPointerDown={(event) => {
        if (interactionMode !== "pointer") return;
        onSlidePointerDown?.(getLogicalPoint(event));
      }}
      style={{
        ...slideStyle,
        background: slide.background.color,
        fontFamily: presentation.theme.fonts.body,
        color: presentation.theme.colors.text ?? "#0f172a",
        cursor: interactionMode === "pointer" ? "crosshair" : "default"
      }}
    >
      {slide.elements
        .slice()
        .sort((left, right) => left.zIndex - right.zIndex)
        .map((element) => (
          <div
            key={element.id}
            role={isPreview ? undefined : "button"}
            tabIndex={isPreview || element.locked ? -1 : 0}
            aria-label={element.accessibilityLabel ?? element.semanticRole}
            onPointerDown={(event) => {
              if (interactionMode === "pointer" || isPreview) return;
              event.stopPropagation();
              onElementPointerDown?.(element.id);
            }}
            style={{
              ...elementFrameStyle(element),
              outline: !isPreview && selected.has(element.id) ? "2px solid #9333ea" : "1px solid transparent",
              outlineOffset: 2
            }}
          >
            {renderElement(element)}
          </div>
        ))}
      {pointers.map((pointer, index) => (
        <button
          key={pointer.id}
          type="button"
          aria-label={`Pointer ${pointer.label}: ${pointer.instruction ?? "slide edit target"}`}
          title={pointer.instruction}
          onPointerDown={(event) => {
            event.stopPropagation();
            onPointerSelect?.(pointer.id);
          }}
          style={{
            position: "absolute",
            left: `${(pointer.x / LOGICAL_SLIDE_WIDTH) * 100}%`,
            top: `${(pointer.y / LOGICAL_SLIDE_HEIGHT) * 100}%`,
            zIndex: 1000 + index,
            transform: "translate(-50%, -100%)",
            display: "grid",
            placeItems: "center",
            width: 34,
            height: 34,
            border: pointer.selected ? "2px solid #7e22ce" : "2px solid #ffffff",
            borderRadius: 999,
            background: "#9333ea",
            color: "#ffffff",
            boxShadow: "0 12px 24px rgb(15 23 42 / 0.25)",
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1,
            cursor: "pointer"
          }}
        >
          {pointer.label}
        </button>
      ))}
    </section>
  );
}
