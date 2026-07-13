"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  AlignCenter,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Bot,
  Check,
  ClipboardList,
  Copy,
  Download,
  Eye,
  FilePlus2,
  FolderPlus,
  Image,
  Layers,
  Loader2,
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
  Undo2,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  applyCommands,
  buildSlidePointerContext,
  createBlankSlide,
  createSlidePointer,
  getSlideSelectionAfterDelete,
  type EditorCommand,
  type PointerDrivenEditProposal,
  type SlidePointer,
} from "@slide-agent/editor-core";
import { SlideRenderer } from "@slide-agent/presentation-renderer";
import { validatePresentation, type PresentationDocument } from "@slide-agent/presentation-schema";

import { PresentationPreview } from "./presentation-preview";

type InspectorTab = "properties" | "layers" | "design" | "assets";
type TextElement = Extract<
  PresentationDocument["slides"][number]["elements"][number],
  { type: "text" }
>;

const inspectorTabs: [InspectorTab, LucideIcon][] = [
  ["properties", PanelRight],
  ["layers", Layers],
  ["design", Palette],
  ["assets", Image],
];

type LoadState = "loading" | "loaded" | "not-found" | "error";

type PresentationApiResponse =
  | { ok: true; data: PresentationDocument }
  | { ok: false; error: { code: string; message: string } };

type PresentationSaveResponse = PresentationApiResponse;

type CollaborationParticipant = {
  clientId: string;
  displayName: string;
  id: string;
  lastSeenAt: string;
  selectedSlideId: string | null;
  userId: string;
};

type CollaborationApiResponse =
  | {
      ok: true;
      data: {
        collaborators: CollaborationParticipant[];
        currentUpdatedAt: string;
        document: PresentationDocument | null;
      };
    }
  | { ok: false; error: { code: string; message: string } };

type SaveStatus = "saved" | "dirty" | "saving" | "failed";
type CollaborationStatus = "connecting" | "connected" | "conflict" | "failed";
type AiProposalStatus = "idle" | "loading" | "ready" | "failed";
type ExportStatus = "idle" | "exporting" | "ready" | "failed";

type AiEditProposalApiResponse =
  | { ok: true; data: PointerDrivenEditProposal }
  | { ok: false; error: { code: string; message: string } };

type PresentationExportSummary = {
  id: string;
  presentationId: string;
  jobId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  downloadUrl: string;
  report: {
    slideCount: number;
    elementCount: number;
    nativeEditableElementCount: number;
    svgFallbackCount: number;
    pngFallbackCount: number;
    warnings: string[];
  };
  createdAt: string;
};

type PresentationExportApiResponse =
  | { ok: true; data: PresentationExportSummary }
  | { ok: false; error: { code: string; message: string } };

export type EditorProjectContext = {
  outputLanguage: string;
  presentationTitle: string;
  projectId: string;
  projectName: string;
  status: string;
};

type EditorSnapshot = {
  assistantText: string;
  document: PresentationDocument;
  selectedElementId: string;
  selectedPointerId: string | null;
  selectedSlideId: string;
  slidePointers: SlidePointer[];
};

type EditorHistory = {
  redoStack: EditorSnapshot[];
  undoStack: EditorSnapshot[];
};

function IconButton({
  label,
  children,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-app border text-sm transition ${
        disabled
          ? "cursor-not-allowed border-line bg-canvas text-muted opacity-60"
          : active
            ? "border-primary bg-primary text-white"
            : "border-line bg-white text-ink hover:border-primary"
      }`}
    >
      {children}
    </button>
  );
}

function RailIconButton({
  label,
  children,
  disabled = false,
  onClick,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-9 w-full place-items-center rounded-app border text-sm transition ${
        disabled
          ? "cursor-not-allowed border-line bg-canvas text-muted opacity-60"
          : "border-line bg-white text-ink hover:border-primary hover:text-primary"
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

export function EditorBreadcrumbs({ context }: { context: EditorProjectContext }): ReactNode {
  return (
    <nav aria-label="Editor breadcrumb" className="mb-1 flex flex-wrap items-center gap-1 text-xs">
      <Link className="font-bold text-muted no-underline hover:text-primary" href="/app/projects">
        Projects
      </Link>
      <span className="text-muted">/</span>
      <Link
        className="font-bold text-muted no-underline hover:text-primary"
        href={`/app/projects/${encodeURIComponent(context.projectId)}` as Route}
      >
        {context.projectName}
      </Link>
      <span className="text-muted">/</span>
      <span className="font-bold text-ink">{context.presentationTitle}</span>
    </nav>
  );
}

export function EditorShell({
  presentationId,
  projectContext,
}: {
  presentationId: string;
  projectContext: EditorProjectContext;
}) {
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
    return (
      <EditorStateMessage title="Loading presentation" message="Preparing the editor document." />
    );
  }

  if (loadState === "not-found") {
    return (
      <EditorStateMessage
        title="Presentation not found"
        message="The requested presentation does not exist."
      />
    );
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
    return (
      <EditorStateMessage
        title="No slides available"
        message="This presentation does not contain slides yet."
      />
    );
  }

  return (
    <LoadedEditor
      document={document}
      presentationId={presentationId}
      projectContext={projectContext}
      setDocument={setDocument}
    />
  );
}

function LoadedEditor({
  document,
  presentationId,
  projectContext,
  setDocument,
}: {
  document: PresentationDocument;
  presentationId: string;
  projectContext: EditorProjectContext;
  setDocument: Dispatch<SetStateAction<PresentationDocument | null>>;
}) {
  const [selectedElementId, setSelectedElementId] = useState("title");
  const [selectedSlideId, setSelectedSlideId] = useState(document.slides[0]?.id ?? "");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("properties");
  const [assistantText, setAssistantText] = useState("");
  const [aiProposal, setAiProposal] = useState<PointerDrivenEditProposal | null>(null);
  const [aiProposalError, setAiProposalError] = useState<string | null>(null);
  const [aiProposalStatus, setAiProposalStatus] = useState<AiProposalStatus>("idle");
  const [currentExport, setCurrentExport] = useState<PresentationExportSummary | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [pointerMode, setPointerMode] = useState(false);
  const [slidePointers, setSlidePointers] = useState<SlidePointer[]>(() =>
    readDocumentSlidePointers(document),
  );
  const [selectedPointerId, setSelectedPointerId] = useState<string | null>(null);
  const [referencedPointerIds, setReferencedPointerIds] = useState<string[]>([]);
  const [editorHistory, setEditorHistory] = useState<EditorHistory>({
    redoStack: [],
    undoStack: [],
  });
  const restoredSlideSelectionRef = useRef<string | null>(null);
  const { error: saveError, status: saveStatus } = usePresentationAutosave({
    document,
    presentationId,
    setDocument,
  });
  const {
    collaborators,
    error: collaborationError,
    status: collaborationStatus,
  } = usePresentationCollaboration({
    canApplyRemote: saveStatus === "saved",
    document,
    presentationId,
    selectedSlideId,
    setDocument,
  });
  const activeSlide =
    document.slides.find((slide) => slide.id === selectedSlideId) ?? document.slides[0]!;
  const activeSlideIndex = document.slides.findIndex((slide) => slide.id === activeSlide.id);
  const canDeleteSlide = document.slides.length > 1;
  const canMoveSlideDown = activeSlideIndex >= 0 && activeSlideIndex < document.slides.length - 1;
  const canMoveSlideUp = activeSlideIndex > 0;
  const canRedo = editorHistory.redoStack.length > 0;
  const canUndo = editorHistory.undoStack.length > 0;
  const canRequestAiProposal = assistantText.trim().length > 0 && aiProposalStatus !== "loading";
  const canStartExport = saveStatus === "saved" && exportStatus !== "exporting";

  const thumbnails = document.slides.map((slide) => slide.title ?? `Slide ${slide.order}`);

  const selectedElement = useMemo(
    () => activeSlide.elements.find((element) => element.id === selectedElementId),
    [activeSlide.elements, selectedElementId],
  );
  const titleElement = useMemo(
    () =>
      activeSlide.elements.find(
        (element): element is TextElement => element.id === "title" && element.type === "text",
      ),
    [activeSlide.elements],
  );
  const activeSlidePointers = useMemo(
    () => slidePointers.filter((pointer) => pointer.slideId === activeSlide.id),
    [activeSlide.id, slidePointers],
  );
  const selectedPointer = useMemo(
    () => activeSlidePointers.find((pointer) => pointer.id === selectedPointerId),
    [activeSlidePointers, selectedPointerId],
  );
  const referencedSlidePointers = useMemo(() => {
    const referencedIds = new Set(referencedPointerIds);
    return activeSlidePointers.filter((pointer) => referencedIds.has(pointer.id));
  }, [activeSlidePointers, referencedPointerIds]);
  const requestPointers =
    referencedSlidePointers.length > 0 ? referencedSlidePointers : activeSlidePointers;
  const pointerContext = useMemo(
    () => buildSlidePointerContext(activeSlide.id, requestPointers),
    [activeSlide.id, requestPointers],
  );
  const assistantPreview = [assistantText.trim(), pointerContext].filter(Boolean).join("\n\n");
  const selectedShapeFill = selectedElement?.type === "shape" ? selectedElement.fill : undefined;
  const fillValue = selectedShapeFill ?? activeSlide.background.color ?? "#ffffff";
  const accentValue = document.theme.colors.primary ?? "#9333ea";

  useEffect(() => {
    if (restoredSlideSelectionRef.current === presentationId) return;
    restoredSlideSelectionRef.current = presentationId;

    const storedSlideId = globalThis.localStorage?.getItem(selectedSlideStorageKey(presentationId));
    if (storedSlideId && document.slides.some((slide) => slide.id === storedSlideId)) {
      setSelectedSlideId(storedSlideId);
    }
  }, [document.slides, presentationId]);

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

  useEffect(() => {
    setEditorHistory({ redoStack: [], undoStack: [] });
    setSlidePointers(readDocumentSlidePointers(document));
    setReferencedPointerIds([]);
    setAiProposal(null);
    setAiProposalError(null);
    setAiProposalStatus("idle");
    setCurrentExport(null);
    setExportError(null);
    setExportStatus("idle");
  }, [presentationId]);

  function currentSnapshot(): EditorSnapshot {
    return {
      assistantText,
      document,
      selectedElementId,
      selectedPointerId,
      selectedSlideId,
      slidePointers,
    };
  }

  function restoreSnapshot(snapshot: EditorSnapshot): void {
    setAssistantText(snapshot.assistantText);
    setDocument(snapshot.document);
    setSelectedElementId(snapshot.selectedElementId);
    setSelectedPointerId(snapshot.selectedPointerId);
    setSelectedSlideId(snapshot.selectedSlideId);
    setSlidePointers(snapshot.slidePointers);
  }

  function commitSnapshot(after: EditorSnapshot): void {
    const before = currentSnapshot();
    if (editorSnapshotsMatch(before, after)) return;

    setEditorHistory((current) => ({
      redoStack: [],
      undoStack: [...current.undoStack, cloneEditorSnapshot(before)],
    }));
    restoreSnapshot(after);
  }

  function commitDocumentCommand(
    command: EditorCommand,
    overrides: Partial<Omit<EditorSnapshot, "document">> = {},
  ): void {
    commitDocumentCommands([command], overrides);
  }

  function commitDocumentCommands(
    commands: readonly EditorCommand[],
    overrides: Partial<Omit<EditorSnapshot, "document">> = {},
  ): void {
    const nextSlidePointers = normalizeSlidePointers(overrides.slidePointers ?? slidePointers);
    const nextDocument = syncDocumentSlidePointers(
      applyCommands(document, commands),
      nextSlidePointers,
    );

    commitSnapshot({
      assistantText,
      document: nextDocument,
      selectedElementId,
      selectedPointerId,
      selectedSlideId,
      ...overrides,
      slidePointers: nextSlidePointers,
    });
  }

  function undoEditorChange(): void {
    const previous = editorHistory.undoStack.at(-1);
    if (!previous) return;

    setEditorHistory((current) => ({
      redoStack: [...current.redoStack, cloneEditorSnapshot(currentSnapshot())],
      undoStack: current.undoStack.slice(0, -1),
    }));
    restoreSnapshot(previous);
  }

  function redoEditorChange(): void {
    const next = editorHistory.redoStack.at(-1);
    if (!next) return;

    setEditorHistory((current) => ({
      redoStack: current.redoStack.slice(0, -1),
      undoStack: [...current.undoStack, cloneEditorSnapshot(currentSnapshot())],
    }));
    restoreSnapshot(next);
  }

  function updateTitleText(nextText: string): void {
    commitDocumentCommand({ slideId: activeSlide.id, title: nextText, type: "RENAME_SLIDE" });
  }

  function updateFillColor(nextColor: string): void {
    if (selectedElement?.type === "shape") {
      commitDocumentCommand({
        elementId: selectedElement.id,
        fill: nextColor,
        slideId: activeSlide.id,
        type: "UPDATE_SHAPE_FILL",
      });
      return;
    }

    commitDocumentCommand({
      color: nextColor,
      slideId: activeSlide.id,
      type: "UPDATE_SLIDE_BACKGROUND",
    });
  }

  function updateAccentColor(nextColor: string): void {
    commitDocumentCommand({ color: nextColor, type: "UPDATE_THEME_ACCENT" });
  }

  function addSlidePointer(point: { x: number; y: number }): void {
    addSlidePointerForSlide(activeSlide.id, point);
  }

  function addSlidePointerForSlide(slideId: string, point: { x: number; y: number }): void {
    const slide = document.slides.find((candidate) => candidate.id === slideId);
    if (!slide) return;
    const slidePointerCount = slidePointers.filter((pointer) => pointer.slideId === slideId).length;
    const targetElement = slide.elements
      .filter(
        (element) =>
          element.visible &&
          point.x >= element.frame.x &&
          point.x <= element.frame.x + element.frame.width &&
          point.y >= element.frame.y &&
          point.y <= element.frame.y + element.frame.height,
      )
      .sort((left, right) => right.zIndex - left.zIndex)[0];
    const pointer = createSlidePointer({
      id: `${slideId}-pointer-${Date.now()}`,
      label: String(slidePointerCount + 1),
      slideId,
      ...(targetElement ? { targetElementId: targetElement.id } : {}),
      x: point.x,
      y: point.y,
    });
    const nextAssistantText = assistantText || "Use the slide pointers to propose precise edits.";
    const nextSlidePointers = normalizeSlidePointers([...slidePointers, pointer]);

    commitSnapshot({
      assistantText: nextAssistantText,
      document: syncDocumentSlidePointers(document, nextSlidePointers),
      selectedElementId,
      selectedPointerId: pointer.id,
      selectedSlideId,
      slidePointers: nextSlidePointers,
    });
  }

  function updatePointer(
    pointerId: string,
    changes: Pick<SlidePointer, "instruction" | "label">,
  ): void {
    const nextSlidePointers = normalizeSlidePointers(
      slidePointers.map((pointer) =>
        pointer.id === pointerId
          ? {
              ...pointer,
              instruction: changes.instruction,
              label: changes.label.trim() || pointer.label,
            }
          : pointer,
      ),
    );
    commitSnapshot({
      assistantText,
      document: syncDocumentSlidePointers(document, nextSlidePointers),
      selectedElementId,
      selectedPointerId: pointerId,
      selectedSlideId,
      slidePointers: nextSlidePointers,
    });
  }

  function removePointer(pointerId: string): void {
    const nextSlidePointers = normalizeSlidePointers(
      slidePointers.filter((pointer) => pointer.id !== pointerId),
    );
    setReferencedPointerIds((current) => current.filter((id) => id !== pointerId));
    commitSnapshot({
      assistantText,
      document: syncDocumentSlidePointers(document, nextSlidePointers),
      selectedElementId,
      selectedPointerId: selectedPointerId === pointerId ? null : selectedPointerId,
      selectedSlideId,
      slidePointers: nextSlidePointers,
    });
  }

  function clearSlidePointers(slideId: string): void {
    const removedIds = new Set(
      slidePointers.filter((pointer) => pointer.slideId === slideId).map((pointer) => pointer.id),
    );
    const nextSlidePointers = normalizeSlidePointers(
      slidePointers.filter((pointer) => pointer.slideId !== slideId),
    );
    setReferencedPointerIds((current) => current.filter((id) => !removedIds.has(id)));
    commitSnapshot({
      assistantText,
      document: syncDocumentSlidePointers(document, nextSlidePointers),
      selectedElementId,
      selectedPointerId: null,
      selectedSlideId,
      slidePointers: nextSlidePointers,
    });
  }

  function togglePointerReference(pointerId: string): void {
    setReferencedPointerIds((current) =>
      current.includes(pointerId)
        ? current.filter((id) => id !== pointerId)
        : [...current, pointerId],
    );
  }

  function updateSelectedPointerInstruction(instruction: string): void {
    if (!selectedPointerId) return;
    const nextSlidePointers = normalizeSlidePointers(
      slidePointers.map((pointer) =>
        pointer.id === selectedPointerId ? { ...pointer, instruction } : pointer,
      ),
    );

    commitSnapshot({
      assistantText,
      document: syncDocumentSlidePointers(document, nextSlidePointers),
      selectedElementId,
      selectedPointerId,
      selectedSlideId,
      slidePointers: nextSlidePointers,
    });
  }

  function removeSelectedPointer(): void {
    if (!selectedPointerId) return;
    const nextSlidePointers = normalizeSlidePointers(
      slidePointers.filter((pointer) => pointer.id !== selectedPointerId),
    );

    commitSnapshot({
      assistantText,
      document: syncDocumentSlidePointers(document, nextSlidePointers),
      selectedElementId,
      selectedPointerId: null,
      selectedSlideId,
      slidePointers: nextSlidePointers,
    });
  }

  function addSlide(): void {
    const slideId = createEditorSlideId(document, "slide");
    const slide = createBlankSlide({
      accentColor: document.theme.colors.primary ?? "#9333ea",
      id: slideId,
      textColor: document.theme.colors.text ?? "#0f172a",
      title: `Slide ${document.slides.length + 1}`,
    });

    commitDocumentCommand(
      { afterSlideId: activeSlide.id, slide, type: "ADD_SLIDE_AFTER" },
      {
        selectedElementId: "title",
        selectedPointerId: null,
        selectedSlideId: slideId,
      },
    );
  }

  function duplicateActiveSlide(): void {
    const slideId = createEditorSlideId(document, `${activeSlide.id}-copy`);

    commitDocumentCommand(
      { newSlideId: slideId, slideId: activeSlide.id, type: "DUPLICATE_SLIDE" },
      {
        selectedElementId: "title",
        selectedPointerId: null,
        selectedSlideId: slideId,
      },
    );
  }

  function deleteActiveSlide(): void {
    const selection = getSlideSelectionAfterDelete(document, {
      selectedSlideId,
      slideId: activeSlide.id,
    });
    if (!selection.deleted) return;

    commitDocumentCommand(
      { slideId: activeSlide.id, type: "DELETE_SLIDE" },
      {
        selectedElementId: "title",
        selectedPointerId: null,
        selectedSlideId: selection.selectedSlideId,
        slidePointers: slidePointers.filter((pointer) => pointer.slideId !== activeSlide.id),
      },
    );
  }

  function moveActiveSlide(delta: number): void {
    commitDocumentCommand({
      slideId: activeSlide.id,
      toIndex: activeSlideIndex + delta,
      type: "MOVE_SLIDE",
    });
  }

  async function requestAiEditProposal(): Promise<void> {
    const prompt = assistantText.trim();
    if (!prompt || aiProposalStatus === "loading") return;

    setAiProposal(null);
    setAiProposalError(null);
    setAiProposalStatus("loading");

    try {
      const documentWithPointers = syncDocumentSlidePointers(document, slidePointers);
      const requestBody = {
        document: documentWithPointers,
        pointers: requestPointers,
        prompt,
        slideId: activeSlide.id,
        ...(selectedElementId ? { selectedElementId } : {}),
      };
      const response = await fetch(
        `/api/presentations/${encodeURIComponent(presentationId)}/ai-edit-proposals`,
        {
          body: JSON.stringify(requestBody),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const payload = (await response.json()) as AiEditProposalApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.ok ? "AI edit proposal could not be created." : payload.error.message,
        );
      }

      setAiProposal(payload.data);
      setAiProposalStatus("ready");
    } catch (error) {
      setAiProposalError(
        error instanceof Error ? error.message : "AI edit proposal could not be created.",
      );
      setAiProposalStatus("failed");
    }
  }

  function acceptAiProposal(): void {
    if (!aiProposal) return;

    commitDocumentCommands(
      [
        ...aiProposal.commands.map((entry) => entry.command),
        {
          metadata: {
            generatedAt: aiProposal.metadata.generatedAt,
            operationId: aiProposal.metadata.operationId,
            promptVersion: aiProposal.metadata.promptVersion,
          },
          slideId: aiProposal.slideId,
          type: "SET_SLIDE_AI_METADATA",
        },
      ],
      {
        selectedSlideId: aiProposal.slideId,
      },
    );
    setAiProposal(null);
    setAiProposalError(null);
    setAiProposalStatus("idle");
  }

  function rejectAiProposal(): void {
    setAiProposal(null);
    setAiProposalError(null);
    setAiProposalStatus("idle");
  }

  async function requestPresentationExport(): Promise<void> {
    if (exportStatus === "exporting") return;

    if (saveStatus !== "saved") {
      setCurrentExport(null);
      setExportError("Wait until the presentation is saved before exporting.");
      setExportStatus("failed");
      return;
    }

    setCurrentExport(null);
    setExportError(null);
    setExportStatus("exporting");

    try {
      const response = await fetch(
        `/api/presentations/${encodeURIComponent(presentationId)}/exports`,
        { method: "POST" },
      );
      const payload = (await response.json()) as PresentationExportApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.ok ? "Presentation export could not be created." : payload.error.message,
        );
      }

      setCurrentExport(payload.data);
      setExportStatus("ready");
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Presentation export could not be created.",
      );
      setExportStatus("failed");
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-[260px_minmax(0,1fr)_300px] grid-rows-[minmax(0,1fr)_140px] max-[960px]:grid-cols-1 max-[960px]:grid-rows-[auto_auto_auto_auto]">
      {isPreviewOpen ? (
        <PresentationPreview
          initialSlideId={activeSlide.id}
          onClose={() => setIsPreviewOpen(false)}
          onClearPointers={clearSlidePointers}
          onPointerAdd={addSlidePointerForSlide}
          onPointerChange={updatePointer}
          onPointerRemove={removePointer}
          onPointerReferenceToggle={togglePointerReference}
          pointers={slidePointers}
          presentation={syncDocumentSlidePointers(document, slidePointers)}
          referencedPointerIds={referencedPointerIds}
        />
      ) : null}
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

        <nav aria-label="Project navigation" className="space-y-1">
          <Link
            className="flex w-full items-center justify-between rounded-app bg-canvas px-3 py-2 text-left text-sm font-semibold text-ink no-underline"
            href={`/app/projects/${encodeURIComponent(projectContext.projectId)}` as Route}
          >
            {projectContext.projectName}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </nav>

        <div className="mt-7">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Presentations
          </div>
          <div className="space-y-2">
            {thumbnails.slice(0, 3).map((item, index) => (
              <button
                key={`${item}-${index}`}
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
          <span className="rounded bg-warning/10 px-2 py-1 text-xs font-semibold text-warning">
            ADMIN
          </span>
        </div>
      </aside>

      <section className="flex min-w-0 flex-col bg-canvas">
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
          <div>
            <EditorBreadcrumbs context={projectContext} />
            <h1 className="text-base font-bold">{document.title}</h1>
            <p className="text-xs text-muted" aria-live="polite">
              {saveStatusLabel(saveStatus)}
              {saveError ? `: ${saveError}` : ""} · 16:9 widescreen ·{" "}
              {projectContext.outputLanguage.toUpperCase()} output · {projectContext.status}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div
              className="flex items-center gap-1 text-xs text-muted"
              aria-live="polite"
              title={
                collaborationError ??
                collaborators.map((collaborator) => collaborator.displayName).join(", ")
              }
            >
              <Users size={14} />
              <span>{collaborationStatusLabel(collaborationStatus, collaborators.length)}</span>
            </div>
            <div className="flex items-center gap-2">
              <IconButton label="Undo" disabled={!canUndo} onClick={undoEditorChange}>
                <Undo2 size={17} />
              </IconButton>
              <IconButton label="Redo" disabled={!canRedo} onClick={redoEditorChange}>
                <Redo2 size={17} />
              </IconButton>
              <IconButton label="Preview" onClick={() => setIsPreviewOpen(true)}>
                <Eye size={17} />
              </IconButton>
              <button
                type="button"
                disabled={!canStartExport}
                onClick={() => void requestPresentationExport()}
                className={`flex h-9 items-center gap-2 rounded-app px-3 text-sm font-semibold ${
                  canStartExport ? "bg-ink text-white" : "cursor-not-allowed bg-ink/50 text-white"
                }`}
              >
                {exportStatus === "exporting" ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Download size={16} />
                )}
                {exportStatus === "exporting" ? "Exporting" : "Export"}
              </button>
              {exportStatus === "ready" && currentExport ? (
                <a
                  href={currentExport.downloadUrl}
                  download={currentExport.fileName}
                  className="flex h-9 items-center gap-2 rounded-app border border-line bg-white px-3 text-sm font-semibold text-ink hover:border-primary"
                >
                  <Download size={16} />
                  PPTX
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => void signOut()}
                className="h-9 rounded-app border border-line bg-white px-3 text-sm font-semibold text-ink hover:border-primary"
              >
                Sign out
              </button>
            </div>
            {exportStatus !== "idle" ? (
              <div
                aria-live="polite"
                className={`max-w-xl text-right text-xs font-medium ${
                  exportStatus === "failed" ? "text-red-700" : "text-muted"
                }`}
              >
                {exportStatusLabel(exportStatus, currentExport, exportError)}
              </div>
            ) : null}
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="w-28 shrink-0 border-r border-line bg-white p-3">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <RailIconButton label="Add slide" onClick={addSlide}>
                <Plus size={16} />
              </RailIconButton>
              <RailIconButton label="Duplicate slide" onClick={duplicateActiveSlide}>
                <Copy size={16} />
              </RailIconButton>
              <RailIconButton
                label="Move slide up"
                disabled={!canMoveSlideUp}
                onClick={() => moveActiveSlide(-1)}
              >
                <ArrowUp size={16} />
              </RailIconButton>
              <RailIconButton
                label="Move slide down"
                disabled={!canMoveSlideDown}
                onClick={() => moveActiveSlide(1)}
              >
                <ArrowDown size={16} />
              </RailIconButton>
              <div className="col-span-2">
                <RailIconButton
                  label="Delete slide"
                  disabled={!canDeleteSlide}
                  onClick={deleteActiveSlide}
                >
                  <Trash2 size={16} />
                </RailIconButton>
              </div>
            </div>
            <div className="space-y-3">
              {document.slides.map((slide, index) => (
                <button
                  key={slide.id}
                  onClick={() => setSelectedSlideId(slide.id)}
                  className={`w-full rounded-app border p-1 text-left ${
                    slide.id === activeSlide.id
                      ? "border-primary bg-primary/5"
                      : "border-line bg-white"
                  }`}
                >
                  <div className="aspect-video rounded bg-white shadow-sm" />
                  <div className="mt-1 truncate text-[10px] font-medium text-muted">
                    {index + 1}. {slide.title ?? `Slide ${slide.order}`}
                  </div>
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
                <IconButton
                  label="AI pointer"
                  active={pointerMode}
                  onClick={() => setPointerMode((current) => !current)}
                >
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
                    label: pointer.label || String(index + 1),
                    instruction: pointer.instruction,
                    selected: pointer.id === selectedPointerId,
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
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Selected
            </div>
            <div className="rounded-app border border-line bg-canvas p-3 text-sm font-semibold">
              {selectedElement?.semanticRole ?? "None"}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">Slide title</span>
            <textarea
              className="min-h-24 w-full resize-none rounded-app border border-line bg-white p-3 text-sm"
              value={titleElement?.paragraphs[0]?.runs[0]?.text ?? ""}
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
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Layer order
            </div>
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
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                AI pointers
              </div>
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
                    <span className="block truncate font-medium text-ink">
                      {pointer.instruction}
                    </span>
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
                  <span className="mb-1 block text-xs font-semibold text-muted">
                    Pointer instruction
                  </span>
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
                `${activeSlidePointers.length} pointers`,
              ].map((chip) => (
                <span
                  key={chip}
                  className="rounded-app border border-line px-2 py-1 text-xs font-medium text-muted"
                >
                  {chip}
                </span>
              ))}
            </div>
            <div className="flex gap-3">
              {referencedSlidePointers.length > 0 ? (
                <div
                  className="flex shrink-0 items-center gap-1"
                  aria-label="Chat pointer references"
                >
                  {referencedSlidePointers.map((pointer) => (
                    <button
                      key={pointer.id}
                      type="button"
                      title={`Remove pointer ${pointer.label} from chat`}
                      onClick={() => togglePointerReference(pointer.id)}
                      className="flex h-9 items-center gap-1 rounded-app border border-primary bg-primary/5 px-2 text-xs font-semibold text-primary"
                    >
                      <MapPin size={13} /> {pointer.label} <X size={12} />
                    </button>
                  ))}
                </div>
              ) : null}
              <input
                value={assistantText}
                onChange={(event) => setAssistantText(event.target.value)}
                placeholder="Ask for a structured slide edit..."
                className="h-11 min-w-0 flex-1 rounded-app border border-line px-3 text-sm"
              />
              <button
                type="button"
                disabled={!canRequestAiProposal}
                onClick={() => void requestAiEditProposal()}
                className={`flex h-11 items-center gap-2 rounded-app px-4 text-sm font-semibold ${
                  canRequestAiProposal
                    ? "bg-primary text-white"
                    : "cursor-not-allowed bg-primary/40 text-white"
                }`}
              >
                {aiProposalStatus === "loading" ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <ClipboardList size={16} />
                )}
                {aiProposalStatus === "loading" ? "Building" : "Preview ops"}
              </button>
            </div>
            {aiProposalStatus === "failed" && aiProposalError ? (
              <div className="mt-2 rounded-app border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {aiProposalError}
              </div>
            ) : null}
            {assistantPreview ? (
              <pre className="mt-2 max-h-16 overflow-auto whitespace-pre-wrap rounded-app border border-line bg-canvas px-3 py-2 text-xs leading-5 text-muted">
                {assistantPreview}
              </pre>
            ) : null}
            {aiProposal ? (
              <div className="mt-3 rounded-app border border-line bg-canvas px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-ink">{aiProposal.title}</div>
                    <div className="mt-1 text-xs text-muted">{aiProposal.summary}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={acceptAiProposal}
                      className="grid h-8 w-8 place-items-center rounded-app bg-primary text-white"
                      title="Accept proposal"
                      aria-label="Accept proposal"
                    >
                      <Check size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={rejectAiProposal}
                      className="grid h-8 w-8 place-items-center rounded-app border border-line bg-white text-muted hover:border-primary hover:text-primary"
                      title="Reject proposal"
                      aria-label="Reject proposal"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  {aiProposal.commands.map((entry, index) => (
                    <div
                      key={`${entry.command.type}-${index}`}
                      className="text-xs leading-5 text-muted"
                    >
                      {index + 1}. {entry.description}
                    </div>
                  ))}
                </div>
              </div>
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
  setDocument,
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
        presentationId,
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
          setError(
            saveError instanceof Error ? saveError.message : "Presentation could not be saved.",
          );
        });
    }, 800);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [document, presentationId, setDocument]);

  return { error, status };
}

function usePresentationCollaboration({
  canApplyRemote,
  document,
  presentationId,
  selectedSlideId,
  setDocument,
}: {
  canApplyRemote: boolean;
  document: PresentationDocument;
  presentationId: string;
  selectedSlideId: string;
  setDocument: Dispatch<SetStateAction<PresentationDocument | null>>;
}): {
  clientId: string | null;
  collaborators: CollaborationParticipant[];
  error: string | null;
  status: CollaborationStatus;
} {
  const [clientId, setClientId] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<CollaborationParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CollaborationStatus>("connecting");

  useEffect(() => {
    const nextClientId = getCollaborationClientId(presentationId);
    setClientId(nextClientId);

    let cancelled = false;

    async function sendHeartbeat(): Promise<void> {
      try {
        const response = await fetch(
          `/api/presentations/${encodeURIComponent(presentationId)}/collaboration`,
          {
            body: JSON.stringify({
              clientId: nextClientId,
              knownUpdatedAt: document.metadata.updatedAt,
              selectedSlideId: selectedSlideId || null,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
        );
        const payload = (await response.json()) as CollaborationApiResponse;

        if (cancelled) return;
        if (!response.ok || !payload.ok) {
          setStatus("failed");
          setError(payload.ok ? "Collaboration is unavailable." : payload.error.message);
          return;
        }

        setCollaborators(payload.data.collaborators);
        setError(null);

        if (payload.data.document) {
          if (canApplyRemote) {
            setDocument(payload.data.document);
            setStatus("connected");
          } else {
            setStatus("conflict");
            setError("Remote changes are waiting. Save or reload before continuing.");
          }
        } else {
          setStatus("connected");
        }
      } catch (heartbeatError) {
        if (cancelled) return;
        setStatus("failed");
        setError(
          heartbeatError instanceof Error
            ? heartbeatError.message
            : "Collaboration is unavailable.",
        );
      }
    }

    void sendHeartbeat();
    const intervalId = globalThis.setInterval(() => void sendHeartbeat(), 2_500);

    return () => {
      cancelled = true;
      globalThis.clearInterval(intervalId);
    };
  }, [canApplyRemote, document.metadata.updatedAt, presentationId, selectedSlideId, setDocument]);

  return { clientId, collaborators, error, status };
}

function getCollaborationClientId(presentationId: string): string {
  const storageKey = `slide-agent:collaboration-client:${presentationId}`;
  const existing = globalThis.localStorage?.getItem(storageKey);
  if (existing) return existing;

  const nextClientId = globalThis.crypto.randomUUID();
  globalThis.localStorage?.setItem(storageKey, nextClientId);
  return nextClientId;
}

async function savePresentation({
  document,
  expectedUpdatedAt,
  presentationId,
}: {
  document: PresentationDocument;
  expectedUpdatedAt: string;
  presentationId: string;
}): Promise<PresentationDocument> {
  const response = await fetch(`/api/presentations/${encodeURIComponent(presentationId)}`, {
    body: JSON.stringify({ document, expectedUpdatedAt }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
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

function collaborationStatusLabel(status: CollaborationStatus, collaboratorCount: number): string {
  if (status === "connecting") return "Connecting";
  if (status === "conflict") return "Remote changes detected";
  if (status === "failed") return "Collaboration unavailable";
  return `${collaboratorCount} active ${collaboratorCount === 1 ? "session" : "sessions"}`;
}

function exportStatusLabel(
  status: ExportStatus,
  currentExport: PresentationExportSummary | null,
  error: string | null,
): string {
  switch (status) {
    case "exporting":
      return "PowerPoint export is running.";
    case "failed":
      return error ?? "PowerPoint export failed.";
    case "ready":
      return currentExport
        ? `PowerPoint ready: ${currentExport.fileName} (${formatBytes(currentExport.byteSize)}).`
        : "PowerPoint export is ready.";
    case "idle":
      return "";
  }
}

function formatBytes(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize} B`;
  const kib = byteSize / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KB`;
  return `${(kib / 1024).toFixed(1)} MB`;
}

function selectedSlideStorageKey(presentationId: string): string {
  return `slide-agent:selected-slide:${presentationId}`;
}

function createEditorSlideId(document: PresentationDocument, prefix: string): string {
  const existingIds = new Set(document.slides.map((slide) => slide.id));
  const safePrefix = prefix
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
  const baseId = `${safePrefix || "slide"}-${Date.now().toString(36)}`;
  let candidate = baseId;
  let suffix = 1;

  while (existingIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function readDocumentSlidePointers(document: PresentationDocument): SlidePointer[] {
  return normalizeSlidePointers(
    document.slides.flatMap((slide) =>
      slide.pointers.map((pointer) => ({
        id: pointer.id,
        instruction: pointer.instruction,
        label: pointer.label,
        slideId: slide.id,
        ...(pointer.targetElementId ? { targetElementId: pointer.targetElementId } : {}),
        x: pointer.x,
        y: pointer.y,
      })),
    ),
  );
}

function normalizeSlidePointers(pointers: readonly SlidePointer[]): SlidePointer[] {
  const countsBySlide = new Map<string, number>();

  return pointers.map((pointer) => {
    const nextCount = (countsBySlide.get(pointer.slideId) ?? 0) + 1;
    countsBySlide.set(pointer.slideId, nextCount);

    return {
      ...pointer,
      instruction: pointer.instruction.trim() || "Describe the requested change here",
      label: pointer.label.trim() || String(nextCount),
    };
  });
}

function syncDocumentSlidePointers(
  document: PresentationDocument,
  pointers: readonly SlidePointer[],
): PresentationDocument {
  const pointersBySlide = new Map<string, SlidePointer[]>();
  for (const pointer of normalizeSlidePointers(pointers)) {
    pointersBySlide.set(pointer.slideId, [
      ...(pointersBySlide.get(pointer.slideId) ?? []),
      pointer,
    ]);
  }

  return {
    ...document,
    slides: document.slides.map((slide) => ({
      ...slide,
      pointers: (pointersBySlide.get(slide.id) ?? []).map((pointer) => ({
        id: pointer.id,
        instruction: pointer.instruction,
        label: pointer.label,
        ...(pointer.targetElementId ? { targetElementId: pointer.targetElementId } : {}),
        x: pointer.x,
        y: pointer.y,
      })),
    })),
  };
}

function cloneEditorSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    ...snapshot,
    slidePointers: snapshot.slidePointers.map((pointer) => ({ ...pointer })),
  };
}

function editorSnapshotsMatch(left: EditorSnapshot, right: EditorSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
