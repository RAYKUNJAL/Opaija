import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  BringToFront,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Crop,
  Eye,
  EyeOff,
  Grid3X3,
  Image as ImageIcon,
  Layers3,
  Lock,
  Maximize2,
  MessageCircle,
  MousePointer2,
  Plus,
  Redo2,
  Save,
  SendToBack,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type Konva from "konva";
import {
  Circle,
  Group,
  Image as KonvaImage,
  Layer as KonvaLayer,
  Line,
  Rect,
  Stage,
  Text as KonvaText,
  Transformer,
} from "react-konva";
import "./BookPageEditor.css";

export type BookPageStatus = "draft" | "review" | "approved";
export type ImageFitMode = "cover" | "contain" | "stretch";
export type BubbleStyle = "speech" | "thought" | "shout";
export type BubbleTail = "left" | "center" | "right";

export type BookPageEditorSize = {
  width: number;
  height: number;
  bleed: number;
  safeMargin: number;
};

export type BookEditorPageSource = {
  projectId?: string;
  chapterId: string;
  pageNumber: number;
  canonicalSummary?: string;
};

export type BookEditorLayerSource = {
  chapterId: string;
  pageNumber: number;
  panelNumber: number;
  field: "artwork" | "dialogue" | "narration" | "soundEffect";
  dialogueIndex?: number;
  artworkFileName?: string;
  canonicalText?: string;
  speaker?: string;
  delivery?: string;
  canonicalBubbleStyle?: "speech" | "thought" | "shout" | "whisper";
  canonicalBalloonAnchor?: "top-left" | "top-right" | "mid-left" | "mid-right" | "bottom-left" | "bottom-right";
};

export type BookPanelFrame = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type LayerBase = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  hidden?: boolean;
  source?: BookEditorLayerSource;
};

export type BookImageLayer = LayerBase & {
  type: "image";
  src: string;
  alt?: string;
  fit?: ImageFitMode;
  focalX?: number;
  focalY?: number;
  cropZoom?: number;
};

export type BookTextLayer = LayerBase & {
  type: "text";
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "400" | "500" | "600" | "700" | "800" | "900";
  fontStyle?: "normal" | "italic";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  align?: "left" | "center" | "right";
  letterSpacing?: number;
  lineHeight?: number;
};

export type BookSpeechBubbleLayer = LayerBase & {
  type: "speechBubble";
  text: string;
  bubbleStyle?: BubbleStyle;
  tail?: BubbleTail;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "400" | "500" | "600" | "700" | "800" | "900";
  fill?: string;
  stroke?: string;
  textColor?: string;
  align?: "left" | "center" | "right";
};

export type BookSfxLayer = LayerBase & {
  type: "sfx";
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  skew?: number;
};

export type BookEditorLayer =
  | BookImageLayer
  | BookTextLayer
  | BookSpeechBubbleLayer
  | BookSfxLayer;

export type BookPageMetadata = {
  title: string;
  chapterTitle?: string;
  pageNumber?: number;
  notes?: string;
  status?: BookPageStatus;
  slug?: string;
};

export type BookEditorPage = {
  id: string;
  source?: BookEditorPageSource;
  metadata: BookPageMetadata;
  panelTemplateId?: string;
  panels?: BookPanelFrame[];
  layers: BookEditorLayer[];
  background?: string;
};

export type BookPanelTemplate = {
  id: string;
  label: string;
  description: string;
  panels: BookPanelFrame[];
};

export type BookPageEditorAutosavePayload = {
  pages: BookEditorPage[];
  activePageId: string;
  changedAt: string;
};

export type BookPageEditorProps = {
  pages: BookEditorPage[];
  activePageId?: string;
  pageSize?: Partial<BookPageEditorSize>;
  panelTemplates?: BookPanelTemplate[];
  fonts?: string[];
  className?: string;
  readOnly?: boolean;
  allowPageStructureChanges?: boolean;
  protectSourceLayers?: boolean;
  autosaveDelayMs?: number;
  onPagesChange?: (pages: BookEditorPage[]) => void;
  onActivePageChange?: (pageId: string) => void;
  onAutosave?: (payload: BookPageEditorAutosavePayload) => void | Promise<void>;
  onRequestImage?: () =>
    | { src: string; name?: string; alt?: string }
    | null
    | Promise<{ src: string; name?: string; alt?: string } | null>;
};

type SnapGuide = { axis: "x" | "y"; position: number };

const DEFAULT_PAGE_SIZE: BookPageEditorSize = {
  width: 1200,
  height: 1600,
  bleed: 36,
  safeMargin: 90,
};

const DEFAULT_FONTS = [
  "DM Sans",
  "Oswald",
  "Georgia",
  "Arial",
  "Trebuchet MS",
  "Impact",
  "Comic Sans MS",
];

const frame = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): BookPanelFrame => ({ id, x, y, width, height });

export const DEFAULT_BOOK_PANEL_TEMPLATES: BookPanelTemplate[] = [
  {
    id: "full-bleed",
    label: "Full",
    description: "One cinematic full-page panel",
    panels: [frame("panel-1", 0.035, 0.025, 0.93, 0.95)],
  },
  {
    id: "two-up",
    label: "Two-up",
    description: "Two equal horizontal panels",
    panels: [
      frame("panel-1", 0.035, 0.025, 0.93, 0.46),
      frame("panel-2", 0.035, 0.515, 0.93, 0.46),
    ],
  },
  {
    id: "split",
    label: "Split",
    description: "Two vertical character panels",
    panels: [
      frame("panel-1", 0.035, 0.025, 0.45, 0.95),
      frame("panel-2", 0.515, 0.025, 0.45, 0.95),
    ],
  },
  {
    id: "four-grid",
    label: "Grid 4",
    description: "Classic four-panel page",
    panels: [
      frame("panel-1", 0.035, 0.025, 0.45, 0.46),
      frame("panel-2", 0.515, 0.025, 0.45, 0.46),
      frame("panel-3", 0.035, 0.515, 0.45, 0.46),
      frame("panel-4", 0.515, 0.515, 0.45, 0.46),
    ],
  },
  {
    id: "hero-three",
    label: "Hero 3",
    description: "Wide hero image over two beats",
    panels: [
      frame("panel-1", 0.035, 0.025, 0.93, 0.57),
      frame("panel-2", 0.035, 0.625, 0.45, 0.35),
      frame("panel-3", 0.515, 0.625, 0.45, 0.35),
    ],
  },
  {
    id: "manga-five",
    label: "Manga 5",
    description: "Asymmetric action rhythm",
    panels: [
      frame("panel-1", 0.035, 0.025, 0.57, 0.42),
      frame("panel-2", 0.625, 0.025, 0.34, 0.42),
      frame("panel-3", 0.035, 0.48, 0.3, 0.495),
      frame("panel-4", 0.365, 0.48, 0.6, 0.235),
      frame("panel-5", 0.365, 0.745, 0.6, 0.23),
    ],
  },
];

const clone = <T,>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const createId = (prefix: string) => {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${randomId}`;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const getTemplate = (templates: BookPanelTemplate[], id?: string) =>
  templates.find((template) => template.id === id) ?? templates[0];

const normalizePages = (
  pages: BookEditorPage[],
  templates: BookPanelTemplate[],
): BookEditorPage[] =>
  pages.map((page, index) => {
    const template = getTemplate(templates, page.panelTemplateId);
    return {
      ...page,
      metadata: {
        ...page.metadata,
        title: page.metadata.title || `Page ${index + 1}`,
        pageNumber: page.metadata.pageNumber ?? index + 1,
        status: page.metadata.status ?? "draft",
      },
      panelTemplateId: page.panelTemplateId ?? template.id,
      panels: page.panels?.length ? page.panels : clone(template.panels),
      layers: page.layers ?? [],
      background: page.background ?? "#f5efe4",
    };
  });

const layerLabel = (layer: BookEditorLayer) => {
  if (layer.name) return layer.name;
  if (layer.type === "speechBubble") return "Speech bubble";
  if (layer.type === "sfx") return "Sound effect";
  return layer.type.charAt(0).toUpperCase() + layer.type.slice(1);
};

const isTextualLayer = (
  layer: BookEditorLayer,
): layer is BookTextLayer | BookSpeechBubbleLayer | BookSfxLayer =>
  layer.type === "text" || layer.type === "speechBubble" || layer.type === "sfx";

const useLoadedImage = (src?: string) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    let alive = true;
    const nextImage = new window.Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => alive && setImage(nextImage);
    nextImage.onerror = () => alive && setImage(null);
    nextImage.src = src;
    return () => {
      alive = false;
    };
  }, [src]);

  return image;
};

const imagePlacement = (layer: BookImageLayer, image: HTMLImageElement | null) => {
  const fit = layer.fit ?? "cover";
  if (!image || fit === "stretch") {
    return {
      x: 0,
      y: 0,
      width: layer.width,
      height: layer.height,
      crop: undefined,
    };
  }

  if (fit === "contain") {
    const scale = Math.min(layer.width / image.width, layer.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    return {
      x: (layer.width - width) / 2,
      y: (layer.height - height) / 2,
      width,
      height,
      crop: undefined,
    };
  }

  const targetRatio = layer.width / layer.height;
  const sourceRatio = image.width / image.height;
  let cropWidth = image.width;
  let cropHeight = image.height;
  if (sourceRatio > targetRatio) cropWidth = image.height * targetRatio;
  else cropHeight = image.width / targetRatio;

  const zoom = clamp(layer.cropZoom ?? 1, 1, 3);
  cropWidth /= zoom;
  cropHeight /= zoom;
  const maxX = Math.max(0, image.width - cropWidth);
  const maxY = Math.max(0, image.height - cropHeight);
  const cropX = maxX * clamp((layer.focalX ?? 50) / 100, 0, 1);
  const cropY = maxY * clamp((layer.focalY ?? 50) / 100, 0, 1);

  return {
    x: 0,
    y: 0,
    width: layer.width,
    height: layer.height,
    crop: { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
  };
};

type EditableLayerProps = {
  layer: BookEditorLayer;
  selected: boolean;
  readOnly: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<BookEditorLayer>) => void;
  onDragMove: (
    node: Konva.Group,
    layer: BookEditorLayer,
  ) => { x: number; y: number };
  onDragEnd: () => void;
};

function EditableLayer({
  layer,
  selected,
  readOnly,
  onSelect,
  onChange,
  onDragMove,
  onDragEnd,
}: EditableLayerProps) {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const loadedImage = useLoadedImage(layer.type === "image" ? layer.src : undefined);

  useEffect(() => {
    if (!selected || !groupRef.current || !transformerRef.current) return;
    transformerRef.current.nodes([groupRef.current]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selected]);

  const finishTransform = () => {
    const node = groupRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    onChange({
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      width: Math.max(36, layer.width * scaleX),
      height: Math.max(28, layer.height * scaleY),
    });
  };

  const textFontStyle = (weight?: string, style?: string) =>
    `${style === "italic" ? "italic " : ""}${weight ?? "600"}`;

  const renderContent = () => {
    if (layer.type === "image") {
      const placement = imagePlacement(layer, loadedImage);
      return (
        <>
          <Rect
            width={layer.width}
            height={layer.height}
            fill="#d8d2c5"
            stroke="#1b1d1b"
            strokeWidth={2}
          />
          {loadedImage ? (
            <KonvaImage
              image={loadedImage}
              x={placement.x}
              y={placement.y}
              width={placement.width}
              height={placement.height}
              crop={placement.crop}
              imageSmoothingEnabled
            />
          ) : (
            <KonvaText
              text="IMAGE"
              width={layer.width}
              height={layer.height}
              align="center"
              verticalAlign="middle"
              fontFamily="Oswald"
              fontSize={Math.max(18, Math.min(layer.width, layer.height) * 0.08)}
              fill="#6f746e"
            />
          )}
        </>
      );
    }

    if (layer.type === "speechBubble") {
      const bodyHeight = Math.max(24, layer.height - 24);
      const tailX =
        layer.tail === "left"
          ? layer.width * 0.25
          : layer.tail === "right"
            ? layer.width * 0.75
            : layer.width * 0.5;
      const jagged = layer.bubbleStyle === "shout";
      return (
        <>
          {jagged ? (
            <Line
              points={[
                10, bodyHeight * 0.2,
                0, bodyHeight * 0.42,
                12, bodyHeight * 0.52,
                4, bodyHeight * 0.76,
                26, bodyHeight - 2,
                layer.width * 0.48, bodyHeight - 8,
                tailX, layer.height,
                layer.width * 0.62, bodyHeight - 8,
                layer.width - 16, bodyHeight,
                layer.width, bodyHeight * 0.72,
                layer.width - 10, bodyHeight * 0.54,
                layer.width, bodyHeight * 0.28,
                layer.width - 20, 2,
                layer.width * 0.54, 8,
                layer.width * 0.35, 0,
                10, bodyHeight * 0.2,
              ]}
              closed
              fill={layer.fill ?? "#fffaf0"}
              stroke={layer.stroke ?? "#171917"}
              strokeWidth={4}
              lineJoin="round"
            />
          ) : (
            <>
              <Rect
                width={layer.width}
                height={bodyHeight}
                cornerRadius={layer.bubbleStyle === "thought" ? bodyHeight / 2 : 28}
                fill={layer.fill ?? "#fffaf0"}
                stroke={layer.stroke ?? "#171917"}
                strokeWidth={4}
              />
              {layer.bubbleStyle === "thought" ? (
                <>
                  <Circle
                    x={tailX}
                    y={bodyHeight + 7}
                    radius={9}
                    fill={layer.fill ?? "#fffaf0"}
                    stroke={layer.stroke ?? "#171917"}
                    strokeWidth={3}
                  />
                  <Circle
                    x={tailX + (layer.tail === "left" ? -13 : 13)}
                    y={bodyHeight + 19}
                    radius={5}
                    fill={layer.fill ?? "#fffaf0"}
                    stroke={layer.stroke ?? "#171917"}
                    strokeWidth={2}
                  />
                </>
              ) : (
                <Line
                  points={[tailX - 17, bodyHeight - 2, tailX + 8, bodyHeight - 2, tailX, layer.height]}
                  closed
                  fill={layer.fill ?? "#fffaf0"}
                  stroke={layer.stroke ?? "#171917"}
                  strokeWidth={4}
                  lineJoin="round"
                />
              )}
            </>
          )}
          <KonvaText
            x={20}
            y={15}
            width={Math.max(20, layer.width - 40)}
            height={Math.max(20, bodyHeight - 28)}
            text={layer.text}
            fontFamily={layer.fontFamily ?? "DM Sans"}
            fontSize={layer.fontSize ?? 30}
            fontStyle={String(layer.fontWeight ?? "700")}
            fill={layer.textColor ?? "#131513"}
            align={layer.align ?? "center"}
            verticalAlign="middle"
            wrap="word"
          />
        </>
      );
    }

    if (layer.type === "sfx") {
      return (
        <KonvaText
          width={layer.width}
          height={layer.height}
          text={layer.text}
          fontFamily={layer.fontFamily ?? "Impact"}
          fontSize={layer.fontSize ?? 78}
          fontStyle="900"
          fill={layer.fill ?? "#f3a712"}
          stroke={layer.stroke ?? "#171917"}
          strokeWidth={layer.strokeWidth ?? 5}
          align="center"
          verticalAlign="middle"
          letterSpacing={1}
          skewX={layer.skew ?? -0.12}
          shadowColor="rgba(0,0,0,.35)"
          shadowBlur={8}
          shadowOffset={{ x: 5, y: 8 }}
        />
      );
    }

    return (
      <KonvaText
        width={layer.width}
        height={layer.height}
        text={layer.text}
        fontFamily={layer.fontFamily ?? "DM Sans"}
        fontSize={layer.fontSize ?? 34}
        fontStyle={textFontStyle(layer.fontWeight, layer.fontStyle)}
        fill={layer.fill ?? "#111411"}
        stroke={layer.stroke ?? "transparent"}
        strokeWidth={layer.strokeWidth ?? 0}
        align={layer.align ?? "left"}
        verticalAlign="top"
        letterSpacing={layer.letterSpacing ?? 0}
        lineHeight={layer.lineHeight ?? 1.2}
        wrap="word"
      />
    );
  };

  return (
    <>
      <Group
        ref={groupRef}
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
        rotation={layer.rotation ?? 0}
        opacity={layer.opacity ?? 1}
        visible={!layer.hidden}
        draggable={!readOnly && !layer.locked}
        onClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
          event.cancelBubble = true;
          onSelect();
        }}
        onTap={(event: Konva.KonvaEventObject<TouchEvent>) => {
          event.cancelBubble = true;
          onSelect();
        }}
        onDragMove={(event: Konva.KonvaEventObject<DragEvent>) => {
          const node = event.target as Konva.Group;
          const snapped = onDragMove(node, layer);
          node.position(snapped);
        }}
        onDragEnd={(event: Konva.KonvaEventObject<DragEvent>) => {
          const node = event.target as Konva.Group;
          onChange({ x: node.x(), y: node.y() });
          onDragEnd();
        }}
        onTransformEnd={finishTransform}
      >
        {renderContent()}
        <Rect width={layer.width} height={layer.height} fill="rgba(0,0,0,0.001)" />
      </Group>
      {selected && !readOnly && !layer.locked && !layer.hidden ? (
        <Transformer
          ref={transformerRef}
          rotateEnabled
          keepRatio={layer.type === "image"}
          enabledAnchors={[
            "top-left",
            "top-center",
            "top-right",
            "middle-left",
            "middle-right",
            "bottom-left",
            "bottom-center",
            "bottom-right",
          ]}
          anchorFill="#f8f4ed"
          anchorStroke="#0b6f6f"
          anchorSize={12}
          borderStroke="#0b6f6f"
          borderDash={[8, 5]}
          boundBoxFunc={(oldBox: { x: number; y: number; width: number; height: number; rotation: number }, nextBox: { x: number; y: number; width: number; height: number; rotation: number }) =>
            nextBox.width < 36 || nextBox.height < 28 ? oldBox : nextBox
          }
        />
      ) : null}
    </>
  );
}

export default function BookPageEditor({
  pages,
  activePageId: controlledActivePageId,
  pageSize: pageSizeProp,
  panelTemplates = DEFAULT_BOOK_PANEL_TEMPLATES,
  fonts = DEFAULT_FONTS,
  className = "",
  readOnly = false,
  allowPageStructureChanges = true,
  protectSourceLayers = false,
  autosaveDelayMs = 1200,
  onPagesChange,
  onActivePageChange,
  onAutosave,
  onRequestImage,
}: BookPageEditorProps) {
  const effectivePanelTemplates = useMemo(
    () => (panelTemplates.length ? panelTemplates : DEFAULT_BOOK_PANEL_TEMPLATES),
    [panelTemplates],
  );
  const pageSize = useMemo(
    () => ({ ...DEFAULT_PAGE_SIZE, ...pageSizeProp }),
    [pageSizeProp],
  );
  const [documentPages, setDocumentPages] = useState<BookEditorPage[]>(() =>
    normalizePages(pages, effectivePanelTemplates),
  );
  const documentPagesRef = useRef(documentPages);
  const [internalActivePageId, setInternalActivePageId] = useState(
    controlledActivePageId ?? pages[0]?.id ?? "",
  );
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.52);
  const [showBleed, setShowBleed] = useState(true);
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [showSnapGuides, setShowSnapGuides] = useState(true);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const undoStack = useRef<BookEditorPage[][]>([]);
  const redoStack = useRef<BookEditorPage[][]>([]);
  const revisionRef = useRef(0);
  const pendingEmit = useRef<BookEditorPage[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const activePageId = controlledActivePageId ?? internalActivePageId;
  const activePage =
    documentPages.find((page) => page.id === activePageId) ?? documentPages[0];
  const activePageIndex = activePage
    ? documentPages.findIndex((page) => page.id === activePage.id)
    : -1;
  const selectedLayer = activePage?.layers.find((layer) => layer.id === selectedLayerId);

  useEffect(() => {
    const normalized = normalizePages(pages, effectivePanelTemplates);
    const currentSerialized = JSON.stringify(documentPagesRef.current);
    if (JSON.stringify(normalized) === currentSerialized) return;
    documentPagesRef.current = normalized;
    setDocumentPages(normalized);
    revisionRef.current += 1;
    undoStack.current = [];
    redoStack.current = [];
    setDirty(false);
    setSaveState("saved");
  }, [pages, effectivePanelTemplates]);

  useEffect(() => {
    if (!controlledActivePageId) return;
    setSelectedLayerId(null);
  }, [controlledActivePageId]);

  useEffect(() => {
    if (pendingEmit.current !== documentPages) return;
    onPagesChange?.(clone(documentPages));
    pendingEmit.current = null;
  }, [documentPages, onPagesChange]);

  const commitPages = useCallback(
    (updater: (current: BookEditorPage[]) => BookEditorPage[]) => {
      if (readOnly) return;
      const current = documentPagesRef.current;
      const next = updater(clone(current));
      if (JSON.stringify(next) === JSON.stringify(current)) return;
      undoStack.current = [...undoStack.current.slice(-79), clone(current)];
      redoStack.current = [];
      revisionRef.current += 1;
      pendingEmit.current = next;
      documentPagesRef.current = next;
      setDocumentPages(next);
      setDirty(true);
      setSaveState(onAutosave ? "saving" : "saved");
    },
    [onAutosave, readOnly],
  );

  const setActivePage = useCallback(
    (pageId: string) => {
      setInternalActivePageId(pageId);
      setSelectedLayerId(null);
      onActivePageChange?.(pageId);
    },
    [onActivePageChange],
  );

  const autosaveNow = useCallback(async () => {
    if (!onAutosave || !activePage) return;
    const savingRevision = revisionRef.current;
    setSaveState("saving");
    try {
      await onAutosave({
        pages: clone(documentPagesRef.current),
        activePageId: activePage.id,
        changedAt: new Date().toISOString(),
      });
      if (revisionRef.current === savingRevision) {
        setDirty(false);
        setSaveState("saved");
        setLastSavedAt(new Date());
      }
    } catch {
      if (revisionRef.current === savingRevision) setSaveState("error");
    }
  }, [activePage, onAutosave]);

  useEffect(() => {
    if (!dirty || !onAutosave) return;
    const timer = window.setTimeout(() => void autosaveNow(), autosaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [autosaveDelayMs, autosaveNow, dirty, onAutosave]);

  const undo = useCallback(() => {
    if (readOnly || undoStack.current.length === 0) return;
    const previous = undoStack.current.at(-1);
    if (!previous) return;
    const current = documentPagesRef.current;
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [...redoStack.current.slice(-79), clone(current)];
    revisionRef.current += 1;
    const next = clone(previous);
    pendingEmit.current = next;
    documentPagesRef.current = next;
    setDocumentPages(next);
    setDirty(true);
    setSaveState(onAutosave ? "saving" : "saved");
  }, [onAutosave, readOnly]);

  const redo = useCallback(() => {
    if (readOnly || redoStack.current.length === 0) return;
    const nextState = redoStack.current.at(-1);
    if (!nextState) return;
    const current = documentPagesRef.current;
    redoStack.current = redoStack.current.slice(0, -1);
    undoStack.current = [...undoStack.current.slice(-79), clone(current)];
    revisionRef.current += 1;
    const next = clone(nextState);
    pendingEmit.current = next;
    documentPagesRef.current = next;
    setDocumentPages(next);
    setDirty(true);
    setSaveState(onAutosave ? "saving" : "saved");
  }, [onAutosave, readOnly]);

  const updateActivePage = useCallback(
    (updater: (page: BookEditorPage) => BookEditorPage) => {
      if (!activePage) return;
      commitPages((current) =>
        current.map((page) => (page.id === activePage.id ? updater(page) : page)),
      );
    },
    [activePage, commitPages],
  );

  const updateLayer = useCallback(
    (layerId: string, patch: Partial<BookEditorLayer>) => {
      updateActivePage((page) => ({
        ...page,
        layers: page.layers.map((layer) =>
          layer.id === layerId ? ({ ...layer, ...patch } as BookEditorLayer) : layer,
        ),
      }));
    },
    [updateActivePage],
  );

  const addLayer = useCallback(
    (layer: BookEditorLayer) => {
      updateActivePage((page) => ({ ...page, layers: [...page.layers, layer] }));
      setSelectedLayerId(layer.id);
    },
    [updateActivePage],
  );

  const addText = useCallback(() => {
    addLayer({
      id: createId("text"),
      type: "text",
      name: "Page text",
      x: pageSize.width * 0.18,
      y: pageSize.height * 0.18,
      width: pageSize.width * 0.55,
      height: 180,
      text: "Add your text",
      fontFamily: "DM Sans",
      fontSize: 44,
      fontWeight: "700",
      fill: "#111411",
      align: "left",
      lineHeight: 1.2,
    });
  }, [addLayer, pageSize]);

  const addBubble = useCallback(() => {
    addLayer({
      id: createId("bubble"),
      type: "speechBubble",
      name: "Speech bubble",
      x: pageSize.width * 0.52,
      y: pageSize.height * 0.15,
      width: 360,
      height: 210,
      text: "Say something unforgettable.",
      bubbleStyle: "speech",
      tail: "center",
      fontFamily: "DM Sans",
      fontSize: 31,
      fontWeight: "700",
      fill: "#fffaf0",
      stroke: "#171917",
      textColor: "#131513",
      align: "center",
    });
  }, [addLayer, pageSize]);

  const addSfx = useCallback(() => {
    addLayer({
      id: createId("sfx"),
      type: "sfx",
      name: "Impact SFX",
      x: pageSize.width * 0.18,
      y: pageSize.height * 0.62,
      width: 480,
      height: 170,
      text: "KRAK!",
      fontFamily: "Impact",
      fontSize: 88,
      fill: "#f3a712",
      stroke: "#171917",
      strokeWidth: 6,
      rotation: -7,
      skew: -0.12,
    });
  }, [addLayer, pageSize]);

  const addImageFromSource = useCallback(
    (asset: { src: string; name?: string; alt?: string }) => {
      addLayer({
        id: createId("image"),
        type: "image",
        name: asset.name ?? "Artwork",
        alt: asset.alt,
        src: asset.src,
        x: pageSize.width * 0.1,
        y: pageSize.height * 0.1,
        width: pageSize.width * 0.8,
        height: pageSize.height * 0.52,
        fit: "cover",
        focalX: 50,
        focalY: 50,
        cropZoom: 1,
      });
    },
    [addLayer, pageSize],
  );

  const requestImage = useCallback(async () => {
    if (readOnly) return;
    if (onRequestImage) {
      const asset = await onRequestImage();
      if (asset) addImageFromSource(asset);
      return;
    }
    fileInputRef.current?.click();
  }, [addImageFromSource, onRequestImage, readOnly]);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      addImageFromSource({ src: reader.result, name: file.name, alt: file.name });
    };
    reader.readAsDataURL(file);
  };

  const deleteSelectedLayer = useCallback(() => {
    if (!selectedLayerId || (protectSourceLayers && selectedLayer?.source)) return;
    updateActivePage((page) => ({
      ...page,
      layers: page.layers.filter((layer) => layer.id !== selectedLayerId),
    }));
    setSelectedLayerId(null);
  }, [protectSourceLayers, selectedLayer, selectedLayerId, updateActivePage]);

  const duplicateSelectedLayer = useCallback(() => {
    if (!selectedLayer) return;
    const duplicate = {
      ...clone(selectedLayer),
      id: createId(selectedLayer.type),
      name: `${layerLabel(selectedLayer)} copy`,
      source: undefined,
      x: selectedLayer.x + 28,
      y: selectedLayer.y + 28,
    } as BookEditorLayer;
    addLayer(duplicate);
  }, [addLayer, selectedLayer]);

  const moveLayer = useCallback(
    (direction: "up" | "down" | "front" | "back") => {
      if (!selectedLayerId) return;
      updateActivePage((page) => {
        const index = page.layers.findIndex((layer) => layer.id === selectedLayerId);
        if (index < 0) return page;
        const nextLayers = [...page.layers];
        const [item] = nextLayers.splice(index, 1);
        const nextIndex =
          direction === "front"
            ? nextLayers.length
            : direction === "back"
              ? 0
              : direction === "up"
                ? Math.min(nextLayers.length, index + 1)
                : Math.max(0, index - 1);
        nextLayers.splice(nextIndex, 0, item);
        return { ...page, layers: nextLayers };
      });
    },
    [selectedLayerId, updateActivePage],
  );

  const addPage = useCallback(() => {
    if (!allowPageStructureChanges) return;
    const template = effectivePanelTemplates[0];
    const pageId = createId("page");
    commitPages((current) => [
      ...current,
      {
        id: pageId,
        metadata: {
          title: `Page ${current.length + 1}`,
          pageNumber: current.length + 1,
          status: "draft",
        },
        panelTemplateId: template.id,
        panels: clone(template.panels),
        layers: [],
        background: "#f5efe4",
      },
    ]);
    setActivePage(pageId);
  }, [allowPageStructureChanges, commitPages, effectivePanelTemplates, setActivePage]);

  const duplicatePage = useCallback(() => {
    if (!activePage || !allowPageStructureChanges) return;
    const pageId = createId("page");
    const duplicate = clone(activePage);
    duplicate.id = pageId;
    duplicate.metadata.title = `${duplicate.metadata.title} copy`;
    duplicate.layers = duplicate.layers.map((layer) => ({
      ...layer,
      id: createId(layer.type),
    }));
    commitPages((current) => {
      const insertAt = current.findIndex((page) => page.id === activePage.id) + 1;
      const next = [...current];
      next.splice(insertAt, 0, duplicate);
      return next.map((page, index) => ({
        ...page,
        metadata: { ...page.metadata, pageNumber: index + 1 },
      }));
    });
    setActivePage(pageId);
  }, [activePage, allowPageStructureChanges, commitPages, setActivePage]);

  const deletePage = useCallback(() => {
    if (!activePage || !allowPageStructureChanges || documentPages.length <= 1) return;
    const fallback = documentPages[Math.max(0, activePageIndex - 1)];
    commitPages((current) =>
      current
        .filter((page) => page.id !== activePage.id)
        .map((page, index) => ({
          ...page,
          metadata: { ...page.metadata, pageNumber: index + 1 },
        })),
    );
    if (fallback) setActivePage(fallback.id);
  }, [activePage, activePageIndex, allowPageStructureChanges, commitPages, documentPages, setActivePage]);

  const applyTemplate = useCallback(
    (template: BookPanelTemplate) => {
      updateActivePage((page) => {
        const previousFrames = page.panels ?? [];
        const nextFrames = clone(template.panels);
        const layers = page.layers.map((layer) => {
          const panelIndex = layer.source?.panelNumber ? layer.source.panelNumber - 1 : -1;
          const previous = previousFrames[panelIndex];
          const next = nextFrames[panelIndex];
          if (!previous || !next) return layer;
          const previousBox = {
            x: previous.x * pageSize.width,
            y: previous.y * pageSize.height,
            width: previous.width * pageSize.width,
            height: previous.height * pageSize.height,
          };
          const nextBox = {
            x: next.x * pageSize.width,
            y: next.y * pageSize.height,
            width: next.width * pageSize.width,
            height: next.height * pageSize.height,
          };
          const relativeX = previousBox.width ? (layer.x - previousBox.x) / previousBox.width : 0;
          const relativeY = previousBox.height ? (layer.y - previousBox.y) / previousBox.height : 0;
          const relativeWidth = previousBox.width ? layer.width / previousBox.width : 1;
          const relativeHeight = previousBox.height ? layer.height / previousBox.height : 1;
          return {
            ...layer,
            x: nextBox.x + relativeX * nextBox.width,
            y: nextBox.y + relativeY * nextBox.height,
            width: Math.max(28, relativeWidth * nextBox.width),
            height: Math.max(24, relativeHeight * nextBox.height),
          };
        });
        return { ...page, panelTemplateId: template.id, panels: nextFrames, layers };
      });
    },
    [pageSize, updateActivePage],
  );

  const fitCanvas = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const horizontal = (viewport.clientWidth - 96) / pageSize.width;
    const vertical = (viewport.clientHeight - 96) / pageSize.height;
    setZoom(clamp(Math.min(horizontal, vertical), 0.28, 1.1));
  }, [pageSize]);

  const snapLayerPosition = useCallback(
    (node: Konva.Group, movingLayer: BookEditorLayer) => {
      const rawX = node.x();
      const rawY = node.y();
      if (!showSnapGuides || !activePage) {
        setSnapGuides([]);
        return { x: rawX, y: rawY };
      }

      const threshold = 10 / zoom;
      const xTargets = [
        0,
        pageSize.safeMargin,
        pageSize.width / 2,
        pageSize.width - pageSize.safeMargin,
        pageSize.width,
      ];
      const yTargets = [
        0,
        pageSize.safeMargin,
        pageSize.height / 2,
        pageSize.height - pageSize.safeMargin,
        pageSize.height,
      ];

      activePage.layers.forEach((layer) => {
        if (layer.id === movingLayer.id || layer.hidden) return;
        xTargets.push(layer.x, layer.x + layer.width / 2, layer.x + layer.width);
        yTargets.push(layer.y, layer.y + layer.height / 2, layer.y + layer.height);
      });

      const movingX = [rawX, rawX + movingLayer.width / 2, rawX + movingLayer.width];
      const movingY = [rawY, rawY + movingLayer.height / 2, rawY + movingLayer.height];
      let bestX: { delta: number; target: number } | null = null;
      let bestY: { delta: number; target: number } | null = null;

      xTargets.forEach((target) => {
        movingX.forEach((edge) => {
          const delta = target - edge;
          if (
            Math.abs(delta) <= threshold &&
            (!bestX || Math.abs(delta) < Math.abs(bestX.delta))
          ) {
            bestX = { delta, target };
          }
        });
      });
      yTargets.forEach((target) => {
        movingY.forEach((edge) => {
          const delta = target - edge;
          if (
            Math.abs(delta) <= threshold &&
            (!bestY || Math.abs(delta) < Math.abs(bestY.delta))
          ) {
            bestY = { delta, target };
          }
        });
      });

      const resolvedX = bestX as { delta: number; target: number } | null;
      const resolvedY = bestY as { delta: number; target: number } | null;
      const guides: SnapGuide[] = [];
      if (resolvedX) guides.push({ axis: "x", position: resolvedX.target });
      if (resolvedY) guides.push({ axis: "y", position: resolvedY.target });
      setSnapGuides(guides);
      return {
        x: rawX + (resolvedX?.delta ?? 0),
        y: rawY + (resolvedY?.delta ?? 0),
      };
    },
    [activePage, pageSize, showSnapGuides, zoom],
  );

  const handleKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const isTyping =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable;
    const command = event.ctrlKey || event.metaKey;

    if (command && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void autosaveNow();
      return;
    }
    if (isTyping) return;
    if (command && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (command && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (command && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateSelectedLayer();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelectedLayer();
      return;
    }
    if (event.key === "]") {
      event.preventDefault();
      moveLayer(event.shiftKey ? "front" : "up");
      return;
    }
    if (event.key === "[") {
      event.preventDefault();
      moveLayer(event.shiftKey ? "back" : "down");
      return;
    }
    if (selectedLayer && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const amount = event.shiftKey ? 10 : 1;
      const patch: Partial<BookEditorLayer> = {};
      if (event.key === "ArrowLeft") patch.x = selectedLayer.x - amount;
      if (event.key === "ArrowRight") patch.x = selectedLayer.x + amount;
      if (event.key === "ArrowUp") patch.y = selectedLayer.y - amount;
      if (event.key === "ArrowDown") patch.y = selectedLayer.y + amount;
      updateLayer(selectedLayer.id, patch);
    }
  };

  if (!activePage) {
    return (
      <section className={`book-page-editor bpe-empty ${className}`}>
        <div>
          <Layers3 size={30} />
          <h2>No pages yet</h2>
          <p>Add a page to begin laying out the book.</p>
          <button type="button" onClick={addPage} disabled={readOnly}>
            <Plus size={16} /> Add page
          </button>
        </div>
      </section>
    );
  }

  const updateMetadata = (patch: Partial<BookPageMetadata>) =>
    updateActivePage((page) => ({
      ...page,
      metadata: { ...page.metadata, ...patch },
    }));

  const updateTextualLayer = (patch: Record<string, unknown>) => {
    if (!selectedLayer || !isTextualLayer(selectedLayer)) return;
    updateLayer(selectedLayer.id, patch as Partial<BookEditorLayer>);
  };

  const pageThumbnail = (page: BookEditorPage) => (
    <div className="bpe-thumb-sheet" style={{ background: page.background }}>
      {(page.panels ?? []).map((panel) => (
        <i
          key={panel.id}
          style={{
            left: `${panel.x * 100}%`,
            top: `${panel.y * 100}%`,
            width: `${panel.width * 100}%`,
            height: `${panel.height * 100}%`,
          }}
        />
      ))}
      {page.layers.filter((layer) => !layer.hidden).slice(0, 12).map((layer) => (
        <b
          key={layer.id}
          className={`is-${layer.type}`}
          style={{
            left: `${(layer.x / pageSize.width) * 100}%`,
            top: `${(layer.y / pageSize.height) * 100}%`,
            width: `${(layer.width / pageSize.width) * 100}%`,
            height: `${(layer.height / pageSize.height) * 100}%`,
            backgroundImage: layer.type === "image" ? `url(${layer.src})` : undefined,
          }}
        >
          {layer.type === "text" || layer.type === "speechBubble" || layer.type === "sfx"
            ? layer.text.slice(0, 12)
            : ""}
        </b>
      ))}
    </div>
  );

  return (
    <section
      className={`book-page-editor ${className}`}
      tabIndex={0}
      onKeyDown={handleKeyboard}
      aria-label="Book page visual editor"
    >
      <input
        ref={fileInputRef}
        className="bpe-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={handleFile}
      />

      <div className="bpe-desktop">
        <header className="bpe-topbar">
          <div className="bpe-heading">
            <span className="bpe-kicker">PAGE COMPOSER</span>
            <strong>{activePage.metadata.title}</strong>
            <small>
              {activePage.metadata.chapterTitle || "Unassigned chapter"} · Page {activePageIndex + 1} of {documentPages.length}
            </small>
          </div>

          <div className="bpe-toolbar" role="toolbar" aria-label="Add page elements">
            <button type="button" onClick={() => void requestImage()} disabled={readOnly} title="Add image">
              <ImageIcon size={17} /> Image
            </button>
            <button type="button" onClick={addText} disabled={readOnly} title="Add text">
              <Type size={17} /> Text
            </button>
            <button type="button" onClick={addBubble} disabled={readOnly} title="Add speech bubble">
              <MessageCircle size={17} /> Bubble
            </button>
            <button type="button" onClick={addSfx} disabled={readOnly} title="Add sound effect">
              <Zap size={17} /> SFX
            </button>
          </div>

          <div className="bpe-history-tools" role="toolbar" aria-label="History and save">
            <button type="button" onClick={undo} disabled={readOnly || undoStack.current.length === 0} title="Undo (Ctrl+Z)">
              <Undo2 size={17} />
            </button>
            <button type="button" onClick={redo} disabled={readOnly || redoStack.current.length === 0} title="Redo (Ctrl+Shift+Z)">
              <Redo2 size={17} />
            </button>
            <span className={`bpe-save-state is-${!onAutosave && dirty ? "dirty" : saveState}`}>
              <i />
              {!onAutosave && dirty
                ? "Unsaved changes"
                : saveState === "error"
                ? "Save failed"
                : saveState === "saving" || dirty
                  ? "Saving…"
                  : lastSavedAt
                    ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "All changes saved"}
            </span>
            <button type="button" className="is-save" onClick={() => void autosaveNow()} disabled={!onAutosave || readOnly} title="Save now (Ctrl+S)">
              <Save size={17} /> Save
            </button>
          </div>
        </header>

        <div className="bpe-layout">
          <aside className="bpe-pages" aria-label="Book pages">
            <div className="bpe-rail-heading">
              <div>
                <span>Pages</span>
                <small>{documentPages.length}</small>
              </div>
              <button type="button" onClick={addPage} disabled={readOnly || !allowPageStructureChanges} title={allowPageStructureChanges ? "Add page" : "Page order is managed by the book source"}>
                <Plus size={16} />
              </button>
            </div>
            <div className="bpe-page-list">
              {documentPages.map((page, index) => (
                <button
                  type="button"
                  key={page.id}
                  className={page.id === activePage.id ? "active" : ""}
                  onClick={() => setActivePage(page.id)}
                >
                  <span className="bpe-page-number">{index + 1}</span>
                  {pageThumbnail(page)}
                  <span className="bpe-thumb-meta">
                    <strong>{page.metadata.title}</strong>
                    <small className={`is-${page.metadata.status ?? "draft"}`}>
                      {page.metadata.status ?? "draft"}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            <div className="bpe-page-actions">
              <button type="button" onClick={duplicatePage} disabled={readOnly || !allowPageStructureChanges} title={allowPageStructureChanges ? "Duplicate page" : "Page order is managed by the book source"}>
                <Copy size={15} /> Duplicate
              </button>
              <button type="button" onClick={deletePage} disabled={readOnly || !allowPageStructureChanges || documentPages.length <= 1} title={allowPageStructureChanges ? "Delete page" : "Page order is managed by the book source"}>
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </aside>

          <main className="bpe-workspace">
            <div className="bpe-canvas-tools">
              <div className="bpe-template-strip" aria-label="Panel templates">
                <span><Grid3X3 size={15} /> Panels</span>
                {effectivePanelTemplates.map((template) => (
                  <button
                    type="button"
                    key={template.id}
                    className={activePage.panelTemplateId === template.id ? "active" : ""}
                    onClick={() => applyTemplate(template)}
                    disabled={readOnly}
                    title={template.description}
                  >
                    <span className="bpe-template-icon">
                      {template.panels.map((panel) => (
                        <i
                          key={panel.id}
                          style={{
                            left: `${panel.x * 100}%`,
                            top: `${panel.y * 100}%`,
                            width: `${panel.width * 100}%`,
                            height: `${panel.height * 100}%`,
                          }}
                        />
                      ))}
                    </span>
                    {template.label}
                  </button>
                ))}
              </div>
              <div className="bpe-view-tools">
                <button type="button" className={showSnapGuides ? "active" : ""} onClick={() => setShowSnapGuides((value) => !value)} title="Toggle snap guides">
                  <MousePointer2 size={15} /> Snap
                </button>
                <button type="button" className={showBleed ? "active" : ""} onClick={() => setShowBleed((value) => !value)} title="Toggle bleed">
                  Bleed
                </button>
                <button type="button" className={showSafeArea ? "active" : ""} onClick={() => setShowSafeArea((value) => !value)} title="Toggle safe area">
                  Safe
                </button>
                <span className="bpe-zoom-control">
                  <button type="button" onClick={() => setZoom((value) => clamp(value - 0.1, 0.28, 1.6))} title="Zoom out">
                    <ZoomOut size={15} />
                  </button>
                  <input
                    aria-label="Canvas zoom"
                    type="range"
                    min="28"
                    max="160"
                    value={Math.round(zoom * 100)}
                    onChange={(event) => setZoom(Number(event.target.value) / 100)}
                  />
                  <span>{Math.round(zoom * 100)}%</span>
                  <button type="button" onClick={() => setZoom((value) => clamp(value + 0.1, 0.28, 1.6))} title="Zoom in">
                    <ZoomIn size={15} />
                  </button>
                  <button type="button" onClick={fitCanvas} title="Fit page">
                    <Maximize2 size={15} />
                  </button>
                </span>
              </div>
            </div>

            <div ref={viewportRef} className="bpe-canvas-viewport">
              <div className="bpe-stage-shell" style={{ width: pageSize.width * zoom, height: pageSize.height * zoom }}>
                <Stage
                  width={pageSize.width * zoom}
                  height={pageSize.height * zoom}
                  scaleX={zoom}
                  scaleY={zoom}
                  onMouseDown={(event: Konva.KonvaEventObject<MouseEvent>) => {
                    if (event.target === event.target.getStage()) setSelectedLayerId(null);
                  }}
                  onTouchStart={(event: Konva.KonvaEventObject<TouchEvent>) => {
                    if (event.target === event.target.getStage()) setSelectedLayerId(null);
                  }}
                >
                  <KonvaLayer>
                    <Rect width={pageSize.width} height={pageSize.height} fill={activePage.background ?? "#f5efe4"} shadowColor="rgba(0,0,0,.42)" shadowBlur={44} shadowOffset={{ x: 0, y: 20 }} listening={false} />
                    {(activePage.panels ?? []).map((panel) => (
                      <Rect
                        key={panel.id}
                        x={panel.x * pageSize.width}
                        y={panel.y * pageSize.height}
                        width={panel.width * pageSize.width}
                        height={panel.height * pageSize.height}
                        fill="#fffdf7"
                        stroke="#171917"
                        strokeWidth={8}
                        listening={false}
                      />
                    ))}
                    {activePage.layers.map((layer) => (
                      <EditableLayer
                        key={layer.id}
                        layer={layer}
                        selected={selectedLayerId === layer.id}
                        readOnly={readOnly}
                        onSelect={() => setSelectedLayerId(layer.id)}
                        onChange={(patch) => updateLayer(layer.id, patch)}
                        onDragMove={snapLayerPosition}
                        onDragEnd={() => setSnapGuides([])}
                      />
                    ))}
                    {snapGuides.map((guide, index) =>
                      guide.axis === "x" ? (
                        <Line key={`x-${guide.position}-${index}`} points={[guide.position, 0, guide.position, pageSize.height]} stroke="#e85d04" strokeWidth={2 / zoom} dash={[10 / zoom, 7 / zoom]} listening={false} />
                      ) : (
                        <Line key={`y-${guide.position}-${index}`} points={[0, guide.position, pageSize.width, guide.position]} stroke="#e85d04" strokeWidth={2 / zoom} dash={[10 / zoom, 7 / zoom]} listening={false} />
                      ),
                    )}
                    {showBleed ? (
                      <Rect x={pageSize.bleed} y={pageSize.bleed} width={pageSize.width - pageSize.bleed * 2} height={pageSize.height - pageSize.bleed * 2} stroke="#bc2b21" strokeWidth={2 / zoom} dash={[12 / zoom, 8 / zoom]} listening={false} />
                    ) : null}
                    {showSafeArea ? (
                      <Rect x={pageSize.safeMargin} y={pageSize.safeMargin} width={pageSize.width - pageSize.safeMargin * 2} height={pageSize.height - pageSize.safeMargin * 2} stroke="#0b6f6f" strokeWidth={2 / zoom} dash={[8 / zoom, 7 / zoom]} listening={false} />
                    ) : null}
                  </KonvaLayer>
                </Stage>
                <span className="bpe-guide-label is-bleed" hidden={!showBleed}>BLEED</span>
                <span className="bpe-guide-label is-safe" hidden={!showSafeArea}>SAFE AREA</span>
              </div>
            </div>
          </main>

          <aside className="bpe-inspector" aria-label="Page and layer inspector">
            <div className="bpe-inspector-tabs">
              <span className={selectedLayer ? "active" : ""}>Layer</span>
              <span className={!selectedLayer ? "active" : ""}>Page</span>
            </div>

            {selectedLayer ? (
              <div className="bpe-inspector-scroll">
                <section className="bpe-inspector-section">
                  <div className="bpe-section-heading">
                    <div>
                      <span>Selected layer</span>
                      <strong>{layerLabel(selectedLayer)}</strong>
                    </div>
                    <span className="bpe-layer-kind">{selectedLayer.type === "speechBubble" ? "Bubble" : selectedLayer.type}</span>
                  </div>
                  <label className="bpe-field">
                    <span>Layer name</span>
                    <input value={selectedLayer.name} disabled={readOnly} onChange={(event) => updateLayer(selectedLayer.id, { name: event.target.value })} />
                  </label>
                  <div className="bpe-icon-row">
                    <button type="button" onClick={() => updateLayer(selectedLayer.id, { hidden: !selectedLayer.hidden })} disabled={readOnly} title={selectedLayer.hidden ? "Show layer" : "Hide layer"}>
                      {selectedLayer.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button type="button" onClick={() => updateLayer(selectedLayer.id, { locked: !selectedLayer.locked })} disabled={readOnly} title={selectedLayer.locked ? "Unlock layer" : "Lock layer"}>
                      {selectedLayer.locked ? <Lock size={16} /> : <Unlock size={16} />}
                    </button>
                    <button type="button" onClick={() => moveLayer("back")} disabled={readOnly} title="Send to back"><SendToBack size={16} /></button>
                    <button type="button" onClick={() => moveLayer("down")} disabled={readOnly} title="Move backward"><ChevronDown size={16} /></button>
                    <button type="button" onClick={() => moveLayer("up")} disabled={readOnly} title="Move forward"><ChevronUp size={16} /></button>
                    <button type="button" onClick={() => moveLayer("front")} disabled={readOnly} title="Bring to front"><BringToFront size={16} /></button>
                  </div>
                </section>

                {selectedLayer.type === "image" ? (
                  <section className="bpe-inspector-section">
                    <h3><Crop size={15} /> Crop & fit</h3>
                    <label className="bpe-field">
                      <span>Fit</span>
                      <select value={selectedLayer.fit ?? "cover"} disabled={readOnly} onChange={(event) => updateLayer(selectedLayer.id, { fit: event.target.value as ImageFitMode })}>
                        <option value="cover">Crop to fill</option>
                        <option value="contain">Fit entire image</option>
                        <option value="stretch">Stretch</option>
                      </select>
                    </label>
                    <label className="bpe-range-field">
                      <span>Crop zoom <b>{(selectedLayer.cropZoom ?? 1).toFixed(1)}×</b></span>
                      <input type="range" min="1" max="3" step="0.1" value={selectedLayer.cropZoom ?? 1} disabled={readOnly || (selectedLayer.fit ?? "cover") !== "cover"} onChange={(event) => updateLayer(selectedLayer.id, { cropZoom: Number(event.target.value) })} />
                    </label>
                    <label className="bpe-range-field">
                      <span>Horizontal focus <b>{selectedLayer.focalX ?? 50}%</b></span>
                      <input type="range" min="0" max="100" value={selectedLayer.focalX ?? 50} disabled={readOnly || (selectedLayer.fit ?? "cover") !== "cover"} onChange={(event) => updateLayer(selectedLayer.id, { focalX: Number(event.target.value) })} />
                    </label>
                    <label className="bpe-range-field">
                      <span>Vertical focus <b>{selectedLayer.focalY ?? 50}%</b></span>
                      <input type="range" min="0" max="100" value={selectedLayer.focalY ?? 50} disabled={readOnly || (selectedLayer.fit ?? "cover") !== "cover"} onChange={(event) => updateLayer(selectedLayer.id, { focalY: Number(event.target.value) })} />
                    </label>
                    <button type="button" className="bpe-secondary-button" disabled={readOnly} onClick={() => updateLayer(selectedLayer.id, { fit: "cover", cropZoom: 1, focalX: 50, focalY: 50 })}>Reset crop</button>
                  </section>
                ) : null}

                {isTextualLayer(selectedLayer) ? (
                  <section className="bpe-inspector-section">
                    <h3><Type size={15} /> Lettering</h3>
                    <label className="bpe-field">
                      <span>Copy</span>
                      <textarea rows={4} value={selectedLayer.text} disabled={readOnly} onChange={(event) => updateTextualLayer({ text: event.target.value })} />
                    </label>
                    <div className="bpe-two-fields">
                      <label className="bpe-field">
                        <span>Font</span>
                        <select value={selectedLayer.fontFamily ?? (selectedLayer.type === "sfx" ? "Impact" : "DM Sans")} disabled={readOnly} onChange={(event) => updateTextualLayer({ fontFamily: event.target.value })}>
                          {fonts.map((font) => <option key={font} value={font}>{font}</option>)}
                        </select>
                      </label>
                      <label className="bpe-field">
                        <span>Size</span>
                        <input type="number" min="8" max="240" value={selectedLayer.fontSize ?? 34} disabled={readOnly} onChange={(event) => updateTextualLayer({ fontSize: Number(event.target.value) })} />
                      </label>
                    </div>
                    {selectedLayer.type !== "sfx" ? (
                      <div className="bpe-two-fields">
                        <label className="bpe-field">
                          <span>Weight</span>
                          <select value={selectedLayer.fontWeight ?? "700"} disabled={readOnly} onChange={(event) => updateTextualLayer({ fontWeight: event.target.value })}>
                            <option value="400">Regular</option>
                            <option value="500">Medium</option>
                            <option value="600">Semibold</option>
                            <option value="700">Bold</option>
                            <option value="800">Extra bold</option>
                            <option value="900">Black</option>
                          </select>
                        </label>
                        <label className="bpe-field">
                          <span>Align</span>
                          <select value={selectedLayer.align ?? "left"} disabled={readOnly} onChange={(event) => updateTextualLayer({ align: event.target.value })}>
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </label>
                      </div>
                    ) : null}
                    <div className="bpe-color-fields">
                      <label><span>{selectedLayer.type === "speechBubble" ? "Text" : "Fill"}</span><input type="color" value={selectedLayer.type === "speechBubble" ? selectedLayer.textColor ?? "#131513" : selectedLayer.fill ?? "#111411"} disabled={readOnly} onChange={(event) => updateTextualLayer(selectedLayer.type === "speechBubble" ? { textColor: event.target.value } : { fill: event.target.value })} /></label>
                      <label><span>Stroke</span><input type="color" value={selectedLayer.stroke ?? "#171917"} disabled={readOnly} onChange={(event) => updateTextualLayer({ stroke: event.target.value })} /></label>
                      {selectedLayer.type === "speechBubble" ? <label><span>Bubble</span><input type="color" value={selectedLayer.fill ?? "#fffaf0"} disabled={readOnly} onChange={(event) => updateTextualLayer({ fill: event.target.value })} /></label> : null}
                    </div>
                    {selectedLayer.type === "speechBubble" ? (
                      <div className="bpe-two-fields">
                        <label className="bpe-field"><span>Shape</span><select value={selectedLayer.bubbleStyle ?? "speech"} disabled={readOnly} onChange={(event) => updateTextualLayer({ bubbleStyle: event.target.value })}><option value="speech">Speech</option><option value="thought">Thought</option><option value="shout">Shout</option></select></label>
                        <label className="bpe-field"><span>Tail</span><select value={selectedLayer.tail ?? "center"} disabled={readOnly} onChange={(event) => updateTextualLayer({ tail: event.target.value })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <section className="bpe-inspector-section">
                  <h3><Layers3 size={15} /> Position</h3>
                  <div className="bpe-four-fields">
                    <label><span>X</span><input type="number" value={Math.round(selectedLayer.x)} disabled={readOnly} onChange={(event) => updateLayer(selectedLayer.id, { x: Number(event.target.value) })} /></label>
                    <label><span>Y</span><input type="number" value={Math.round(selectedLayer.y)} disabled={readOnly} onChange={(event) => updateLayer(selectedLayer.id, { y: Number(event.target.value) })} /></label>
                    <label><span>W</span><input type="number" min="20" value={Math.round(selectedLayer.width)} disabled={readOnly} onChange={(event) => updateLayer(selectedLayer.id, { width: Number(event.target.value) })} /></label>
                    <label><span>H</span><input type="number" min="20" value={Math.round(selectedLayer.height)} disabled={readOnly} onChange={(event) => updateLayer(selectedLayer.id, { height: Number(event.target.value) })} /></label>
                  </div>
                  <label className="bpe-range-field"><span>Opacity <b>{Math.round((selectedLayer.opacity ?? 1) * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" value={selectedLayer.opacity ?? 1} disabled={readOnly} onChange={(event) => updateLayer(selectedLayer.id, { opacity: Number(event.target.value) })} /></label>
                  <label className="bpe-range-field"><span>Rotation <b>{Math.round(selectedLayer.rotation ?? 0)}°</b></span><input type="range" min="-180" max="180" value={selectedLayer.rotation ?? 0} disabled={readOnly} onChange={(event) => updateLayer(selectedLayer.id, { rotation: Number(event.target.value) })} /></label>
                  <div className="bpe-danger-row">
                    <button type="button" onClick={duplicateSelectedLayer} disabled={readOnly}><Copy size={15} /> Duplicate</button>
                    <button type="button" onClick={deleteSelectedLayer} disabled={readOnly || Boolean(protectSourceLayers && selectedLayer.source)} title={protectSourceLayers && selectedLayer.source ? "Canonical artwork and lettering layers cannot be deleted" : "Delete layer"}><Trash2 size={15} /> Delete</button>
                  </div>
                </section>
              </div>
            ) : (
              <div className="bpe-inspector-scroll">
                <section className="bpe-inspector-section bpe-no-layer">
                  <MousePointer2 size={24} />
                  <strong>Select a layer</strong>
                  <p>Drag it on the page, then use this panel for crop, type, order, and precise positioning.</p>
                </section>
              </div>
            )}

            <section className="bpe-inspector-section bpe-page-meta">
              <h3>Page metadata</h3>
              <label className="bpe-field"><span>Page title</span><input value={activePage.metadata.title} disabled={readOnly} onChange={(event) => updateMetadata({ title: event.target.value })} /></label>
              <label className="bpe-field"><span>Chapter</span><input value={activePage.metadata.chapterTitle ?? ""} disabled={readOnly} onChange={(event) => updateMetadata({ chapterTitle: event.target.value })} placeholder="Chapter title" /></label>
              <div className="bpe-two-fields">
                <label className="bpe-field"><span>Page number</span><input type="number" min="1" value={activePage.metadata.pageNumber ?? activePageIndex + 1} disabled={readOnly} onChange={(event) => updateMetadata({ pageNumber: Number(event.target.value) })} /></label>
                <label className="bpe-field"><span>Status</span><select value={activePage.metadata.status ?? "draft"} disabled={readOnly} onChange={(event) => updateMetadata({ status: event.target.value as BookPageStatus })}><option value="draft">Draft</option><option value="review">In review</option><option value="approved">Approved</option></select></label>
              </div>
              <label className="bpe-field"><span>Slug</span><input value={activePage.metadata.slug ?? ""} disabled={readOnly} onChange={(event) => updateMetadata({ slug: event.target.value })} placeholder="chapter-01-page-01" /></label>
              <label className="bpe-field"><span>Production notes</span><textarea rows={3} value={activePage.metadata.notes ?? ""} disabled={readOnly} onChange={(event) => updateMetadata({ notes: event.target.value })} placeholder="Continuity, lettering, or print notes…" /></label>
            </section>

            <footer className="bpe-shortcuts">
              <strong>Shortcuts</strong>
              <span><kbd>⌘/Ctrl Z</kbd> Undo</span>
              <span><kbd>⇧ + arrows</kbd> Nudge 10px</span>
              <span><kbd>[ / ]</kbd> Layer order</span>
              <span><kbd>Del</kbd> Delete layer</span>
            </footer>
          </aside>
        </div>
      </div>

      <div className="bpe-mobile">
        <header>
          <span className="bpe-kicker">PAGE COMPOSER</span>
          <h2>{activePage.metadata.title}</h2>
          <p>Canvas editing is available on a tablet in landscape or on desktop. You can still review pages and update production status here.</p>
        </header>
        <div className="bpe-mobile-preview">{pageThumbnail(activePage)}</div>
        <div className="bpe-mobile-nav">
          <button type="button" disabled={activePageIndex <= 0} onClick={() => setActivePage(documentPages[activePageIndex - 1].id)}><ChevronLeft size={16} /> Previous</button>
          <span>{activePageIndex + 1} / {documentPages.length}</span>
          <button type="button" disabled={activePageIndex >= documentPages.length - 1} onClick={() => setActivePage(documentPages[activePageIndex + 1].id)}>Next <ChevronRight size={16} /></button>
        </div>
        <label className="bpe-field"><span>Page title</span><input value={activePage.metadata.title} disabled={readOnly} onChange={(event) => updateMetadata({ title: event.target.value })} /></label>
        <label className="bpe-field"><span>Status</span><select value={activePage.metadata.status ?? "draft"} disabled={readOnly} onChange={(event) => updateMetadata({ status: event.target.value as BookPageStatus })}><option value="draft">Draft</option><option value="review">In review</option><option value="approved">Approved</option></select></label>
        <label className="bpe-field"><span>Production notes</span><textarea rows={4} value={activePage.metadata.notes ?? ""} disabled={readOnly} onChange={(event) => updateMetadata({ notes: event.target.value })} /></label>
        <button type="button" className="bpe-mobile-save" onClick={() => void autosaveNow()} disabled={!onAutosave || readOnly}><Save size={16} /> Save page notes</button>
      </div>
    </section>
  );
}
