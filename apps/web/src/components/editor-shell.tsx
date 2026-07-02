"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  AlignCenter,
  ArrowUpRight,
  Bot,
  ClipboardList,
  Download,
  Eye,
  FilePlus2,
  FolderPlus,
  Image,
  Layers,
  Lock,
  MapPin,
  MousePointer2,
  Palette,
  PanelRight,
  Plus,
  Redo2,
  Settings,
  Sparkles,
  Trash2,
  Type,
  Undo2
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  buildSlidePointerContext,
  createSlidePointer,
  type SlidePointer
} from "@slide-agent/editor-core";
import { SlideRenderer } from "@slide-agent/presentation-renderer";
import { validatePresentation, type PresentationDocument } from "@slide-agent/presentation-schema";

const navProjects = ["Board reporting", "Product launch", "Banking pitch"];

type InspectorTab = "properties" | "layers" | "design" | "assets";
type TextElement = Extract<PresentationDocument["slides"][number]["elements"][number], { type: "text" }>;

const inspectorTabs: [InspectorTab, LucideIcon][] = [
  ["properties", PanelRight],
  ["layers", Layers],
  ["design", Palette],
  ["assets", Image]
];

type LoadState = "loading" | "loaded" | "not-found" | "error";

type PresentationApiResponse =
  | { ok: true; data: PresentationDocument }
  | { ok: false; error: { code: string; message: string } };

type PresentationSaveResponse = PresentationApiResponse;

type SaveStatus = "saved" | "dirty" | "saving" | "failed";

function IconButton({
  label,
  children,
  active = false,
  onClick
}: {
  label: string;
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-app border text-sm transition ${
        active ? "border-primary bg-primary text-white" : "border-line bg-white text-ink hover:border-primary"
      }`}
    >
      {children}
    </button>
  );
}

async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  globalThis.location.assign("/login");
}

export function EditorShell({ presentationId }: { presentationId: string }) {
  const [document, setDocument] = useState<PresentationDocument | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPresentation(): Promise<void> {
      setLoadState("loading");
      setLoadError(null);

      try {
        const response = await fetch(`/api/presentations/${encodeURIComponent(presentationId)}`);
        const payload = (await response.json()) as PresentationApiResponse;

        if (cancelled) return;

        if (!response.ok || !payload.ok) {
          if (response.status === 404) {
            setLoadState("not-found");
            return;
          }

          setLoadError(payload.ok ? "Presentation could not be loaded." : payload.error.message);
          setLoadState("error");
          return;
        }

        setDocument(validatePresentation(payload.data));
        setLoadState("loaded");
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Presentation could not be loaded.");
        setLoadState("error");
      }
    }

    void loadPresentation();

    return () => {
      cancelled = true;
    };
  }, [presentationId]);

  if (loadState === "loading") {
    return <EditorStateMessage title="Loading presentation" message="Preparing the editor document." />;
  }

  if (loadState === "not-found") {
    return <EditorStateMessage title="Presentation not found" message="The requested presentation does not exist." />;
  }

  if (loadState === "error" || !document) {
    return (
      <EditorStateMessage
        title="Presentation could not be loaded"
        message={loadError ?? "The editor could not load this document."}
      />
    );
  }

  if (document.slides.length === 0) {
    return <EditorStateMessage title="No slides available" message="This presentation does not contain slides yet." />;
  }

  return <LoadedEditor document={document} presentationId={presentationId} setDocument={setDocument} />;
}

function LoadedEditor({
  document,
  presentationId,
  setDocument
}: {
  document: PresentationDocument;
  presentationId: string;
  setDocument: Dispatch<SetStateAction<PresentationDocument | null>>;
}) {
  const [selectedElementId, setSelectedElementId] = useState("title");
  const [selectedSlideId, setSelectedSlideId] = useState(document.slides[0]?.id ?? "");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("properties");
  const [assistantText, setAssistantText] = useState("");
  const [pointerMode, setPointerMode] = useState(false);
  const [slidePointers, setSlidePointers] = useState<SlidePointer[]>([]);
  const [selectedPointerId, setSelectedPointerId] = useState<string | null>(null);
  const { error: saveError, status: saveStatus } = usePresentationAutosave({
    document,
    presentationId,
    setDocument
  });
  const activeSlide = document.slides.find((slide) => slide.id === selectedSlideId) ?? document.slides[0]!;

  const thumbnails = document.slides.map((slide) => slide.title ?? `Slide ${slide.order}`);

  const selectedElement = useMemo(
    () => activeSlide.elements.find((element) => element.id === selectedElementId),
    [activeSlide.elements, selectedElementId]
  );
  const titleElement = useMemo(
    () =>
      activeSlide.elements.find(
        (element): element is TextElement => element.id === "title" && element.type === "text"
      ),
    [activeSlide.elements]
  );
  const activeSlidePointers = useMemo(
    () => slidePointers.filter((pointer) => pointer.slideId === activeSlide.id),
    [activeSlide.id, slidePointers]
  );
  const selectedPointer = useMemo(
    () => activeSlidePointers.find((pointer) => pointer.id === selectedPointerId),
    [activeSlidePointers, selectedPointerId]
  );
  const pointerContext = useMemo(
    () => buildSlidePointerContext(activeSlide.id, activeSlidePointers),
    [activeSlide.id, activeSlidePointers]
  );
  const assistantPreview = [assistantText.trim(), pointerContext].filter(Boolean).join("\n\n");
  const selectedShapeFill = selectedElement?.type === "shape" ? selectedElement.fill : undefined;
  const fillValue = selectedShapeFill ?? activeSlide.background.color ?? "#ffffff";
  const accentValue = document.theme.colors.primary ?? "#9333ea";

  useEffect(() => {
    const storedSlideId = globalThis.localStorage?.getItem(selectedSlideStorageKey(presentationId));
    if (storedSlideId && document.slides.some((slide) => slide.id === storedSlideId)) {
      setSelectedSlideId(storedSlideId);
    }
  }, [document.id, document.slides, presentationId]);

  useEffect(() => {
    if (!document.slides.some((slide) => slide.id === selectedSlideId)) {
      setSelectedSlideId(document.slides[0]?.id ?? "");
    }
  }, [document.slides, selectedSlideId]);

  useEffect(() => {
    if (selectedSlideId) {
      globalThis.localStorage?.setItem(selectedSlideStorageKey(presentationId), selectedSlideId);
    }
  }, [presentationId, selectedSlideId]);

  useEffect(() => {
    if (!activeSlide.elements.some((element) => element.id === selectedElementId)) {
      setSelectedElementId(activeSlide.elements[0]?.id ?? "");
    }
  }, [activeSlide.elements, selectedElementId]);

  function updateTitleText(nextText: string): void {
    setDocument((current) => {
      if (!current) return current;

      return {
        ...current,
        slides: current.slides.map((slide) =>
          slide.id === activeSlide.id
            ? {
                ...slide,
                title: nextText,
                elements: slide.elements.map((element) => {
                  if (element.id !== "title" || element.type !== "text") return element;
                  const firstParagraph = element.paragraphs[0];
                  const firstRun = firstParagraph?.runs[0];
                  if (!firstParagraph || !firstRun) return element;
                  return {
                    ...element,
                    paragraphs: [
                      {
                        ...firstParagraph,
                        runs: [{ ...firstRun, text: nextText }]
                      },
                      ...element.paragraphs.slice(1)
                    ]
                  };
                })
              }
            : slide
        )
      };
    });
  }

  function updateFillColor(nextColor: string): void {
    setDocument((current) => {
      if (!current) return current;

      return {
        ...current,
        slides: current.slides.map((slide) => {
          if (slide.id !== activeSlide.id) return slide;

          if (selectedElement?.type === "shape") {
            return {
              ...slide,
              elements: slide.elements.map((element) =>
                element.id === selectedElement.id && element.type === "shape" ? { ...element, fill: nextColor } : element
              )
            };
          }

          return {
            ...slide,
            background: {
              ...slide.background,
              color: nextColor
            }
          };
        })
      };
    });
  }

  function updateAccentColor(nextColor: string): void {
    setDocument((current) => {
      if (!current) return current;

      return {
        ...current,
        theme: {
          ...current.theme,
          colors: {
            ...current.theme.colors,
            accent: nextColor,
            primary: nextColor
          }
        }
      };
    });
  }

  function addSlidePointer(point: { x: number; y: number }): void {
    const pointer = createSlidePointer({
      id: `${activeSlide.id}-pointer-${Date.now()}`,
      slideId: activeSlide.id,
      x: point.x,
      y: point.y
    });

    setSlidePointers((current) => [...current, pointer]);
    setSelectedPointerId(pointer.id);
    setAssistantText((current) => current || "Use the slide pointers to propose precise edits.");
  }

  function updateSelectedPointerInstruction(instruction: string): void {
    if (!selectedPointerId) return;
    setSlidePointers((current) =>
      current.map((pointer) => (pointer.id === selectedPointerId ? { ...pointer, instruction } : pointer))
    );
  }

  function removeSelectedPointer(): void {
    if (!selectedPointerId) return;
    setSlidePointers((current) => current.filter((pointer) => pointer.id !== selectedPointerId));
    setSelectedPointerId(null);
  }

  return (
    <main className="editor-grid">
      <aside className="border-r border-line bg-white px-4 py-5">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-app bg-ink text-white">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="text-sm font-bold">Slide Agent</div>
            <div className="text-xs text-muted">Private workspace</div>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2">
          <button className="flex h-9 items-center justify-center gap-2 rounded-app bg-primary px-3 text-xs font-semibold text-white">
            <FolderPlus size={15} />
            Project
          </button>
          <button className="flex h-9 items-center justify-center gap-2 rounded-app border border-line bg-white px-3 text-xs font-semibold text-ink">
            <FilePlus2 size={15} />
            Deck
          </button>
        </div>

        <nav aria-label="Projects" className="space-y-1">
          {navProjects.map((project, index) => (
            <button
              key={project}
              className={`flex w-full items-center justify-between rounded-app px-3 py-2 text-left text-sm ${
                index === 0 ? "bg-canvas font-semibold text-ink" : "text-muted hover:bg-canvas"
              }`}
            >
              {project}
              {index === 0 ? <ArrowUpRight size={14} /> : null}
            </button>
          ))}
        </nav>

        <div className="mt-7">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Presentations</div>
          <div className="space-y-2">
            {thumbnails.slice(0, 3).map((item, index) => (
              <button
                key={item}
                className={`flex w-full items-center gap-3 rounded-app border p-2 text-left ${
                  index === 0 ? "border-primary bg-primary/5" : "border-line bg-white"
                }`}
              >
                <span className="grid h-10 w-14 place-items-center rounded bg-canvas text-xs font-semibold">
                  {index + 1}
                </span>
                <span className="text-xs font-medium text-ink">{item}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-line pt-4">
          <button className="flex items-center gap-2 text-sm font-medium text-muted">
            <Settings size={16} />
            Settings
          </button>
          <span className="rounded bg-warning/10 px-2 py-1 text-xs font-semibold text-warning">ADMIN</span>
        </div>
      </aside>

      <section className="flex min-w-0 flex-col bg-canvas">
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
          <div>
            <h1 className="text-base font-bold">{document.title}</h1>
            <p className="text-xs text-muted" aria-live="polite">
              {saveStatusLabel(saveStatus)}
              {saveError ? `: ${saveError}` : ""} · 16:9 widescreen · English output
            </p>
          </div>
          <div className="flex items-center gap-2">
            <IconButton label="Undo">
              <Undo2 size={17} />
            </IconButton>
            <IconButton label="Redo">
              <Redo2 size={17} />
            </IconButton>
            <IconButton label="Preview">
              <Eye size={17} />
            </IconButton>
            <button className="flex h-9 items-center gap-2 rounded-app bg-ink px-3 text-sm font-semibold text-white">
              <Download size={16} />
              Export
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="h-9 rounded-app border border-line bg-white px-3 text-sm font-semibold text-ink hover:border-primary"
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="w-28 shrink-0 border-r border-line bg-white p-3">
            <button className="mb-3 grid h-9 w-full place-items-center rounded-app border border-dashed border-line text-muted">
              <Plus size={16} />
            </button>
            <div className="space-y-3">
              {thumbnails.map((label, index) => (
                <button
                  key={label}
                  onClick={() => setSelectedSlideId(document.slides[index]?.id ?? selectedSlideId)}
                  className={`w-full rounded-app border p-1 text-left ${
                    document.slides[index]?.id === activeSlide.id ? "border-primary bg-primary/5" : "border-line bg-white"
                  }`}
                >
                  <div className="aspect-video rounded bg-white shadow-sm" />
                  <div className="mt-1 truncate text-[10px] font-medium text-muted">{index + 1}. {label}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex gap-2">
                <IconButton label="Text" active>
                  <Type size={17} />
                </IconButton>
                <IconButton label="Align">
                  <AlignCenter size={17} />
                </IconButton>
                <IconButton label="Layers">
                  <Layers size={17} />
                </IconButton>
                <IconButton label="Lock">
                  <Lock size={17} />
                </IconButton>
                <IconButton label="AI pointer" active={pointerMode} onClick={() => setPointerMode((current) => !current)}>
                  <MapPin size={17} />
                </IconButton>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted">
                {pointerMode ? (
                  <span className="flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-primary">
                    <MousePointer2 size={13} />
                    Pointer
                  </span>
                ) : null}
                <span>Fit</span>
                <span className="rounded bg-white px-2 py-1">87%</span>
              </div>
            </div>

            <div className="grid flex-1 place-items-center">
              <div className="w-full max-w-5xl rounded-app border border-line bg-white p-4 shadow-sm">
                <SlideRenderer
                  presentation={document}
                  slide={activeSlide}
                  selectedElementIds={[selectedElementId]}
                  pointers={activeSlidePointers.map((pointer, index) => ({
                    id: pointer.id,
                    x: pointer.x,
                    y: pointer.y,
                    label: String(index + 1),
                    instruction: pointer.instruction,
                    selected: pointer.id === selectedPointerId
                  }))}
                  interactionMode={pointerMode ? "pointer" : "select"}
                  onElementPointerDown={setSelectedElementId}
                  onSlidePointerDown={addSlidePointer}
                  onPointerSelect={setSelectedPointerId}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="border-l border-line bg-white">
        <div className="grid grid-cols-4 border-b border-line">
          {inspectorTabs.map(([tab, Icon]) => (
            <button
              key={String(tab)}
              title={String(tab)}
              aria-label={String(tab)}
              onClick={() => setInspectorTab(tab)}
              className={`grid h-12 place-items-center ${
                inspectorTab === tab ? "border-b-2 border-primary text-primary" : "text-muted"
              }`}
            >
              <Icon size={17} />
            </button>
          ))}
        </div>

        <div className="space-y-5 p-4">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Selected</div>
            <div className="rounded-app border border-line bg-canvas p-3 text-sm font-semibold">
              {selectedElement?.semanticRole ?? "None"}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">Title text</span>
            <textarea
              className="min-h-24 w-full resize-none rounded-app border border-line bg-white p-3 text-sm"
              value={
                titleElement?.paragraphs[0]?.runs[0]?.text ?? ""
              }
              onChange={(event) => updateTitleText(event.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">Fill</span>
              <input
                type="color"
                className="h-10 w-full rounded-app border border-line bg-white p-1"
                value={fillValue}
                onChange={(event) => updateFillColor(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">Accent</span>
              <input
                type="color"
                className="h-10 w-full rounded-app border border-line bg-white p-1"
                value={accentValue}
                onChange={(event) => updateAccentColor(event.target.value)}
              />
            </label>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Layer order</div>
            {activeSlide.elements
              .slice()
              .sort((left, right) => right.zIndex - left.zIndex)
              .map((element) => (
                <button
                  key={element.id}
                  onClick={() => setSelectedElementId(element.id)}
                  className={`mb-2 flex w-full items-center justify-between rounded-app border px-3 py-2 text-sm ${
                    selectedElementId === element.id ? "border-primary bg-primary/5" : "border-line"
                  }`}
                >
                  <span>{element.semanticRole}</span>
                  <span className="text-xs text-muted">{element.type}</span>
                </button>
              ))}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">AI pointers</div>
              <span className="rounded bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                {activeSlidePointers.length}
              </span>
            </div>
            <div className="space-y-2">
              {activeSlidePointers.map((pointer, index) => (
                <button
                  key={pointer.id}
                  onClick={() => setSelectedPointerId(pointer.id)}
                  className={`flex w-full items-start gap-2 rounded-app border px-3 py-2 text-left text-sm ${
                    selectedPointerId === pointer.id ? "border-primary bg-primary/5" : "border-line"
                  }`}
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{pointer.instruction}</span>
                    <span className="text-xs text-muted">
                      {Math.round(pointer.x)}, {Math.round(pointer.y)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {selectedPointer ? (
              <div className="mt-3 space-y-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted">Pointer instruction</span>
                  <textarea
                    className="min-h-20 w-full resize-none rounded-app border border-line bg-white p-3 text-sm"
                    value={selectedPointer.instruction}
                    onChange={(event) => updateSelectedPointerInstruction(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={removeSelectedPointer}
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-app border border-line text-sm font-semibold text-muted hover:border-primary hover:text-primary"
                >
                  <Trash2 size={15} />
                  Remove pointer
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <section className="col-span-3 border-t border-line bg-white px-5 py-4 max-[960px]:col-span-1">
        <div className="flex h-full items-start gap-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-app bg-primary text-white">
            <Bot size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap gap-2">
              {[
                "selected title",
                "slide 1",
                "executive tone",
                "within budget",
                `${activeSlidePointers.length} pointers`
              ].map((chip) => (
                <span key={chip} className="rounded-app border border-line px-2 py-1 text-xs font-medium text-muted">
                  {chip}
                </span>
              ))}
            </div>
            <div className="flex gap-3">
              <input
                value={assistantText}
                onChange={(event) => setAssistantText(event.target.value)}
                placeholder="Ask for a structured slide edit..."
                className="h-11 min-w-0 flex-1 rounded-app border border-line px-3 text-sm"
              />
              <button className="flex h-11 items-center gap-2 rounded-app bg-primary px-4 text-sm font-semibold text-white">
                <ClipboardList size={16} />
                Preview ops
              </button>
            </div>
            {assistantPreview ? (
              <pre className="mt-2 max-h-16 overflow-auto whitespace-pre-wrap rounded-app border border-line bg-canvas px-3 py-2 text-xs leading-5 text-muted">
                {assistantPreview}
              </pre>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function EditorStateMessage({ title, message }: { title: string; message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6">
      <section className="w-full max-w-md rounded-app border border-line bg-white p-6 text-center shadow-sm">
        <h1 className="text-base font-bold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
      </section>
    </main>
  );
}

function usePresentationAutosave({
  document,
  presentationId,
  setDocument
}: {
  document: PresentationDocument;
  presentationId: string;
  setDocument: Dispatch<SetStateAction<PresentationDocument | null>>;
}): { error: string | null; status: SaveStatus } {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const currentSerializedRef = useRef(JSON.stringify(document));
  const savedSerializedRef = useRef(currentSerializedRef.current);
  const savedUpdatedAtRef = useRef(document.metadata.updatedAt);
  const saveSequenceRef = useRef(0);

  useEffect(() => {
    const serialized = JSON.stringify(document);
    currentSerializedRef.current = serialized;

    if (serialized === savedSerializedRef.current) {
      setStatus("saved");
      setError(null);
      return;
    }

    setStatus("dirty");
    setError(null);

    const timeoutId = globalThis.setTimeout(() => {
      const sequence = ++saveSequenceRef.current;
      const serializedAtSaveStart = currentSerializedRef.current;
      setStatus("saving");

      void savePresentation({
        document,
        expectedUpdatedAt: savedUpdatedAtRef.current,
        presentationId
      })
        .then((savedDocument) => {
          if (sequence !== saveSequenceRef.current) return;

          savedUpdatedAtRef.current = savedDocument.metadata.updatedAt;
          savedSerializedRef.current =
            currentSerializedRef.current === serializedAtSaveStart
              ? JSON.stringify(savedDocument)
              : serializedAtSaveStart;

          if (currentSerializedRef.current === serializedAtSaveStart) {
            setDocument(savedDocument);
            setStatus("saved");
          } else {
            setStatus("dirty");
          }

          setError(null);
        })
        .catch((saveError: unknown) => {
          if (sequence !== saveSequenceRef.current) return;
          setStatus("failed");
          setError(saveError instanceof Error ? saveError.message : "Presentation could not be saved.");
        });
    }, 800);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [document, presentationId, setDocument]);

  return { error, status };
}

async function savePresentation({
  document,
  expectedUpdatedAt,
  presentationId
}: {
  document: PresentationDocument;
  expectedUpdatedAt: string;
  presentationId: string;
}): Promise<PresentationDocument> {
  const response = await fetch(`/api/presentations/${encodeURIComponent(presentationId)}`, {
    body: JSON.stringify({ document, expectedUpdatedAt }),
    headers: { "Content-Type": "application/json" },
    method: "PUT"
  });
  const payload = (await response.json()) as PresentationSaveResponse;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "Presentation could not be saved." : payload.error.message);
  }

  return validatePresentation(payload.data);
}

function saveStatusLabel(status: SaveStatus): string {
  switch (status) {
    case "dirty":
      return "Unsaved changes";
    case "failed":
      return "Save failed";
    case "saving":
      return "Saving";
    case "saved":
      return "Saved";
  }
}

function selectedSlideStorageKey(presentationId: string): string {
  return `slide-agent:selected-slide:${presentationId}`;
}
