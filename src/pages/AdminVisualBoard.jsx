import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Box as BoxIcon,
  BoxSelect,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronRight,
  ChevronsUp,
  Copy,
  Circle,
  ExternalLink,
  Eye,
  EyeOff,
  Frame,
  Group,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  LayoutTemplate,
  List,
  Megaphone,
  SeparatorHorizontal,
  SeparatorVertical,
  Lock,
  LockOpen,
  Minimize,
  Minus,
  MoreHorizontal,
  History,
  ImageDown,
  Plus,
  Redo2,
  RotateCcw,
  Shapes,
  Sticker,
  Square,
  Trash2,
  Triangle,
  Type,
  Undo2,
  Underline,
  Ungroup,
  UploadCloud,
  UsersRound,
  Zap,
  Video,
  X,
  Italic,
} from 'lucide-react';

import {
  DEFAULT_LAYOUT,
  applyTemplate,
  deleteTemplate,
  isVisible,
  loadBoardLayout,
  loadDraftLayout,
  historyLayout,
  publishBoardLayout,
  pruneBoardHistory,
  recordPublish,
  saveTemplate,
  subscribeBoardHistory,
  subscribeTemplates,
} from '../lib/boardLayout';
import { useBoardLayoutEditor, findElement, listRecentPhotos } from '../lib/useBoardLayoutEditor';
import { splitUploads, spreadAt } from '../lib/recentPhotos';
import { layerThumb } from '../lib/layerThumbs';
import { renamedLayer } from '../lib/layerNames';
import { layerTree } from '../lib/layerTree';
import {
  ALIGN_OPTIONS,
  CASE_OPTIONS,
  FONT_OPTIONS,
  FONT_STACKS,
  MAX_TEXT_SIZE,
  MIN_TEXT_SIZE,
  SHADOW_OPTIONS,
  WEIGHT_OPTIONS,
  resolveTextStyle,
} from '../lib/textStyle';
import { SHAPE_KINDS, isCarousel, isFrame, isZigzag, mediaStrokeCss, resolveShapeStyle, shapeLabel } from '../lib/shapeStyle';
import { normalizeOpacity, withOpacity } from '../lib/opacity';
import { CARD_DEFAULTS, normalizeCardSettings } from '../lib/candidateCard';
import { LOGO_BASE_WIDTH, PHOTO_BASE_WIDTH, positionStyle, scaledPositionStyle } from '../lib/boardGeometry';
import { ANIMATION_DIRECTIONS, ANIMATION_TYPES, CAROUSEL_ANIMATION, resolveAnimationCss } from '../lib/animationStyle';
import FillEditor from '../components/FillEditor';
import PhotoCarousel from '../components/PhotoCarousel';
import PhotoAdjuster from '../components/PhotoAdjuster';
import VideoAdjuster from '../components/VideoAdjuster';
import TextContent from '../components/TextContent';
import NumberField from '../components/NumberField';
import BorderControls from '../components/BorderControls';
import CandidateBoard from '../components/CandidateBoard';
import AnnouncementBanner from '../components/AnnouncementBanner';
import ZigzagRule from '../components/ZigzagRule';
import { subscribeAnnouncements, subscribeCandidates } from '../lib/firebaseBackend';
import { boardCandidates, nowKey } from '../lib/candidateVisibility';
import { DEFAULT_BOARD_SETTINGS, subscribeBoardSettings } from '../lib/boardSettings';
import { isShownOnBoard as isAnnouncementShownOnBoard } from '../lib/announcementVisibility';
import {
  DEFAULT_ANNOUNCEMENT_STYLE,
  resolveAnnouncementStyle,
  subscribeAnnouncementStyle,
} from '../lib/announcementStyle';
import { useToast } from '../components/ToastProvider';
import CanvasContextMenu from '../components/CanvasContextMenu';
import IconPanel from '../components/IconPanel';
import { GuideLines, Rulers } from '../components/RulerGuides';
import { addGuide, loadGuides, moveGuide, removeGuide, saveGuides } from '../lib/guides';
import FloatingSelectionBar from '../components/FloatingSelectionBar';
import { unionBounds } from '../lib/boardTransform';
import { shapeLayerName, textLayerName } from '../lib/layerNames';
import { pickImageFiles } from '../lib/imageFiles';
import { exportFileName } from '../lib/exportName';
import BarMenu from '../components/BarMenu';
import PropertySection from '../components/PropertySection';
import { isSectionOpen } from '../lib/propertySections';
import { EDITOR_SHORTCUTS } from '../lib/editorShortcuts';
import { clickTab, loadFolded, saveFolded } from '../lib/panelFold';
import { TEXT_PRESETS } from '../lib/textPresets';
import { fillTextCss } from '../lib/fill';
import SmartGuides from '../components/SmartGuides';
import CanvasTextEditor from '../components/CanvasTextEditor';
import SelectionHandles, { ALL_HANDLES, CORNER_HANDLES, TEXT_HANDLES } from '../components/SelectionHandles';

const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight };

const SHAPE_ICONS = {
  rectangle: Square,
  ellipse: Circle,
  triangle: Triangle,
  line: Minus,
  zigzag: Zap,
  frame: Frame,
  box: BoxIcon,
};

/* The left rail's tabs - each switches which panel sits beside it. */
const RAIL_TABS = [
  { id: 'elements', label: 'Elements', icon: Shapes },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'uploads', label: 'Uploads', icon: UploadCloud },
  { id: 'icons', label: 'Icons', icon: Sticker },
  { id: 'layers', label: 'Layers', icon: Layers },
];

/* The elements that are positioned boxes rather than points. */
const BOX_KINDS = {
  candidates: {
    label: 'Candidate Board',
    hint: 'Drag it anywhere, or drag its corner to resize. What it shows comes from Records.',
  },
  announcements: {
    label: 'Announcements',
    hint: 'Drag it anywhere, or drag its corner to resize. What it shows comes from Announcements.',
  },
};

/* The canvas zoom slider's range, as a percentage of "fit" - 100% already
   fills the stage exactly (see .vb-canvas in globals.css), so anything
   above that needs the stage's own scrollbar to see the rest of it. */
/* Kinds a Layers row can delete - the logo and the two boxes are one of a
   kind, so they are hidden instead (Layers can show them again). */
const DELETABLE_KINDS = new Set(['text', 'image', 'video', 'shape', 'divider']);

const MIN_ZOOM = 25;
const MAX_ZOOM = 150;
const ZOOM_PRESETS = [100, 50, 75, 125, 150];

/* How the canvas works, shown when nothing is selected. */
const CANVAS_HINT =
  'Click to select, drag to move, drag a handle to resize or rotate, double-click text to edit it. Changes save to your draft as you go - click Publish to put them on the live board.';

function propertiesTitle(kind, shape) {
  switch (kind) {
    case 'logo':
      return 'Logo';
    case 'image':
      return 'Photo';
    case 'video':
      return 'Video';
    case 'text':
      return 'Text';
    case 'shape':
      return shape ? shapeLabel(shape) : 'Shape';
    case 'divider':
      return 'Divider';
    default:
      return '';
  }
}

/* "Rectangle 1", "Photo frame 2" - numbered within their own kind. */
function labelShapes(shapes) {
  const counts = {};

  return shapes.map((shape) => {
    counts[shape.kind] = (counts[shape.kind] ?? 0) + 1;
    return shapeLayerName(shapeLabel(shape), counts[shape.kind], shape.photos?.length ?? 0, isFrame(shape));
  });
}

const ARROW_STEPS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/* The candidate board panel's card number fields - ranges match candidateCard.js. */
const CARD_LOOK_FIELDS = [
  { key: 'cardWidth', label: 'Card width', min: 60, max: 100, unit: '%' },
  { key: 'photoHeight', label: 'Card height', min: 50, max: 160, unit: '%' },
  { key: 'nameSize', label: 'Name size', min: 10, max: 60, unit: '' },
  { key: 'courseSize', label: 'Course size', min: 6, max: 32, unit: '' },
];

/* Whole-element opacity, 0-100% - every element and both boxes have it. */
function OpacityField({ element, onChange }) {
  const percent = Math.round(normalizeOpacity(element?.opacity) * 100);

  return (
    <div className="form-group">
      <label className="form-label">Element opacity</label>
      <div className="scale-field">
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={percent}
          aria-label="Element opacity"
          onChange={(event) => onChange(Number(event.target.value) / 100)}
        />
        <span className="scale-field-value">{percent}%</span>
      </div>
    </div>
  );
}

function isTypingTarget(target) {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

/* Space and Enter press a focused control (a toolbar or panel button, a
   link) - the canvas only takes them when focus isn't on one. Canvas
   elements are buttons too, so those still count as the canvas. */
function isControlTarget(target) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('button, a[href], [role="button"], [role="menuitem"], [role="menuitemcheckbox"], summary')) &&
    !target.closest('[data-vb-kind]')
  );
}

/* The picture at the start of a Layers row - see layerThumbs.js. */
function LayerThumb({ thumb, Icon }) {
  if (thumb.type === 'photo') {
    return (
      <span className="vb-layer-thumb">
        <img src={thumb.url} alt="" loading="lazy" />
      </span>
    );
  }
  if (thumb.type === 'text') {
    return (
      <span className="vb-layer-thumb is-text" style={{ fontFamily: thumb.font, color: thumb.color }}>
        Aa
      </span>
    );
  }
  if (thumb.type === 'colour') {
    return <span className="vb-layer-thumb" style={{ background: thumb.colour }} />;
  }
  return (
    <span className="vb-layer-thumb">
      <Icon size={13} />
    </span>
  );
}

export default function AdminVisualBoard() {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [selected, setSelected] = useState(null); // { kind, id? } | null
  const [multiSelected, setMultiSelected] = useState([]); // [{ kind, id }] - shift-click grouping
  const [activePanel, setActivePanel] = useState('elements');
  const [panelFolded, setPanelFolded] = useState(() => loadFolded(window.localStorage));
  /* Uploads tab: null until first opened, then 'loading' | 'error' | [urls] */
  const [recentPhotos, setRecentPhotos] = useState(null);
  const [uploadDropActive, setUploadDropActive] = useState(false);
  const [renamingLayer, setRenamingLayer] = useState(null); // 'kind:id' of the Layers row being renamed
  const [foldedGroups, setFoldedGroups] = useState(() => new Set()); // groupIds folded shut in Layers
  /* Which of the selected frame's carousel photos the Zoom/Move sliders
     below the grid are currently editing - reset whenever the selection
     changes so a stale index from a different frame can't linger. */
  const [editingPhotoIndex, setEditingPhotoIndex] = useState(null);
  const [editingTextId, setEditingTextId] = useState(null);
  /* a file is being dragged over the canvas */
  const [canvasDropActive, setCanvasDropActive] = useState(false);
  /* the last few published layouts, and whether the History list is open */
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  /* ruler guide lines - kept in this browser, never on the live board */
  const [guides, setGuides] = useState(() => loadGuides());
  const [guideDraft, setGuideDraft] = useState(null); // { axis, at, overRuler? } while dragging one out
  const [showRulers, setShowRulers] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [snapToGuides, setSnapToGuides] = useState(true);
  const [guidesLocked, setGuidesLocked] = useState(false);
  /* Sections the admin opened or closed, by name - kept as they move between elements. */
  const [sectionOverrides, setSectionOverrides] = useState({});

  /* What the live announcement strip is currently showing, so the canvas
     can show the same - and can tell when the live board would hide it. */
  const [announcements, setAnnouncements] = useState([]);
  const [announcementStyle, setAnnouncementStyle] = useState(DEFAULT_ANNOUNCEMENT_STYLE);

  /* { kind, id, x, y } while the right-click order menu is open */
  const [contextMenu, setContextMenu] = useState(null);

  /* { kind, id } of the layers-panel row being dragged, or null. */
  const [draggingLayer, setDraggingLayer] = useState(null);
  /* Key of the layers-panel row currently being dragged over, for a drop-line hint. */
  const [layerDropTarget, setLayerDropTarget] = useState(null);

  /* The element Ctrl+C remembered, for Ctrl+V to copy. */
  const [clipboard, setClipboard] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  // Publishing writes the whole layout document (photos and all) to
  // Firestore, which can take a good while for a board with a lot of
  // content - without this, the button gives no sign it's doing anything
  // and clicking it looks like it silently failed.
  const [publishing, setPublishing] = useState(false);

  // A percentage of "fit" (see MIN_ZOOM/MAX_ZOOM) - 100 exactly fills the stage.
  const [zoom, setZoom] = useState(100);
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  // Dragging on empty canvas draws a marquee instead of just deselecting.
  const [boxSelectMode, setBoxSelectMode] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  // The marquee's own rect (px, relative to the canvas surface) while a
  // box-select drag is in progress - null the rest of the time.
  const [boxSelectRect, setBoxSelectRect] = useState(null);

  const [templateModal, setTemplateModal] = useState(null); // null | 'save' | 'apply'
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState([]);

  // null until the first Firestore read resolves, so the dirty check below
  // never fires a false "unpublished changes" against an empty placeholder.
  const [publishedSnapshot, setPublishedSnapshot] = useState(null);

  const canvasRef = useRef(null);
  const middleColumnRef = useRef(null);
  const stageRef = useRef(null);
  const layoutRef = useRef(null);
  const showToast = useToast();

  /*
   * Free-form elements (logo, text, shapes) are bounded by the middle
   * column specifically, not the whole canvas - it's the column they
   * actually render within on the live board, so dragging one to x:50
   * centers it in that column, not the full three-column width.
   */
  const editor = useBoardLayoutEditor(layout, setLayout, middleColumnRef, {
    onError: (error) => showToast.error(error.message),
    onSuccess: (message) => showToast.success(message),
    onProgress: (message) => {
      const id = showToast.loading(message, { duration: Infinity });
      return () => showToast.dismiss(id);
    },
    snapEnabled,
    gridSnap: showGrid,
    multiSelected,
    guideLines: showGuides ? guides : null,
    snapToGuides,
  });

  useEffect(() => saveGuides(guides), [guides]);

  // The draft loads once, when the editor opens - there is normally only
  // one admin editing at a time, so it doesn't need to be a live subscription.
  useEffect(() => {
    let cancelled = false;
    loadDraftLayout().then((draft) => {
      if (!cancelled) setLayout(draft);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // One-time cleanup: a board built before photos went to Firebase Storage
  // may still carry some as base64 data URLs baked into the layout itself,
  // bloating the document and slowing every publish down. Once the real
  // draft has loaded (not the DEFAULT_LAYOUT placeholder), silently
  // re-upload any of those to Storage - a no-op if there's nothing legacy
  // left. Guarded by a ref rather than state so it only ever runs once,
  // even though migrating triggers this same effect again with new layout.
  const cleanedLegacyPhotosRef = useRef(false);

  useEffect(() => {
    if (cleanedLegacyPhotosRef.current || layout === DEFAULT_LAYOUT) return;
    cleanedLegacyPhotosRef.current = true;

    editor
      .cleanUpLegacyPhotos()
      .then((didMigrate) => {
        if (didMigrate) {
          showToast.success('Cleaned up some old photos to speed up publishing.');
        }
      })
      .catch((error) => console.warn('Could not move old photos into storage:', error));
  }, [layout]);

  useEffect(() => {
    let cancelled = false;
    loadBoardLayout().then((published) => {
      if (!cancelled) setPublishedSnapshot(JSON.stringify(published));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeTemplates(setTemplates);
  }, []);

  /* The same filter and order the live board applies (the board settings'
     "hide past candidates" included), so the canvas shows the same cards
     in the same places. */
  const [rawCandidates, setRawCandidates] = useState([]);
  const [boardSettings, setBoardSettings] = useState(DEFAULT_BOARD_SETTINGS);
  useEffect(() => subscribeCandidates(setRawCandidates), []);
  useEffect(() => subscribeBoardSettings(setBoardSettings), []);
  const candidates = useMemo(
    () => boardCandidates(rawCandidates, boardSettings, nowKey()),
    [rawCandidates, boardSettings]
  );

  useEffect(() => {
    return subscribeAnnouncements((rows) => {
      setAnnouncements(
        rows
          .filter(isAnnouncementShownOnBoard)
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      );
    });
  }, []);

  useEffect(() => subscribeAnnouncementStyle(setAnnouncementStyle), []);

  useEffect(() => {
    if (publishedSnapshot === null) return;
    setIsDirty(JSON.stringify(layout) !== publishedSnapshot);
  }, [layout, publishedSnapshot]);

  useEffect(() => {
    function updateFullscreenState() {
      const stillFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(stillFullscreen);
      // Focus mode always rides fullscreen - exiting it any way (Escape,
      // the browser's own exit-fullscreen UI, alt-tabbing away) should
      // bring the panels back rather than leaving the canvas stranded at
      // full width in a normal window.
      if (!stillFullscreen) setFocusMode(false);
    }

    updateFullscreenState();
    document.addEventListener('fullscreenchange', updateFullscreenState);
    return () => document.removeEventListener('fullscreenchange', updateFullscreenState);
  }, []);

  /*
   * A distraction-free view of just the board - fullscreen with the
   * toolbar, element rail, and properties panel all hidden, for presenting
   * or reviewing the board without the editing chrome. Toggling it off
   * exits fullscreen too, since focus mode has no meaning outside it.
   */
  function toggleFocusMode() {
    if (focusMode) {
      setFocusMode(false);
      if (document.fullscreenElement) document.exitFullscreen();
      return;
    }

    setFocusMode(true);
    // A selection outline and resize handle are editing chrome too - focus
    // mode hides the panels that would let you act on a selection, but
    // without this the selected element's own outline stayed drawn right
    // on the board underneath them.
    setSelected(null);
    setMultiSelected([]);
    if (!document.fullscreenElement) layoutRef.current?.requestFullscreen();
  }

  useEffect(() => {
    function handleKeydown(event) {
      if (isTypingTarget(event.target)) return;

      const isMeta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const selection = currentSelection();

      if (event.key === 'Escape') {
        setSelected(null);
        setMultiSelected([]);
        setContextMenu(null);
        return;
      }

      if (!isMeta && (event.key === 'Delete' || event.key === 'Backspace')) {
        if (!selection.length) return;
        event.preventDefault();
        removeSelection();
        return;
      }

      if (
        !isMeta &&
        event.key === 'Enter' &&
        selected?.kind === 'text' &&
        !isControlTarget(event.target) &&
        !findElement(layout, 'text', selected.id)?.locked
      ) {
        event.preventDefault();
        setEditingTextId(selected.id);
        return;
      }

      const arrow = ARROW_STEPS[event.key];
      if (arrow && !isMeta) {
        if (!selection.length) return;
        event.preventDefault();
        const distance = event.shiftKey ? 5 : 0.5;
        editor.nudgeSelection(selection, arrow[0] * distance, arrow[1] * distance);
        return;
      }

      if (!isMeta) return;

      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
      } else if (key === 'y') {
        event.preventDefault();
        editor.redo();
      } else if (key === 'a') {
        event.preventDefault();
        selectAll();
      } else if (key === 'c' || key === 'x' || key === 'd') {
        if (!selection.length) return;
        event.preventDefault();
        if (key === 'c') copySelection();
        else if (key === 'x') cutSelection();
        else duplicateSelection();
      } else if (key === 'v') {
        if (!clipboard.length) return;
        event.preventDefault();
        pasteClipboard();
      } else if (key === 'g') {
        event.preventDefault();
        if (event.shiftKey) ungroupSelection();
        else groupSelection();
      } else if (event.code === 'BracketRight' || event.code === 'BracketLeft') {
        if (!selection.length) return;
        event.preventDefault();
        const forward = event.code === 'BracketRight';
        orderSelection(event.shiftKey ? (forward ? 'front' : 'back') : forward ? 'up' : 'down');
      } else if (key === '=' || key === '+') {
        event.preventDefault();
        zoomBy(10);
      } else if (key === '-') {
        event.preventDefault();
        zoomBy(-10);
      } else if (key === '0') {
        event.preventDefault();
        setZoom(100);
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [editor, selected, multiSelected, clipboard, layout]);

  /* With Layers open, the selected element's row scrolls into view. */
  useEffect(() => {
    if (activePanel !== 'layers' || !selected) return;
    const key = `${selected.kind}:${selected.id ?? ''}`;
    const row = document.querySelector(`[data-layer-key="${CSS.escape(key)}"]`);
    const list = row?.closest('.vb-panel');
    if (!row || !list) return;
    const r = row.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    const top = l.top + (list.querySelector('.vb-panel-head')?.offsetHeight ?? 0);
    if (r.top < top) list.scrollTop -= top - r.top;
    else if (r.bottom > l.bottom) list.scrollTop += r.bottom - l.bottom;
  }, [selected, activePanel]);

  /* Ctrl/Cmd + scroll zooms the canvas instead of the page. */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    function onWheel(event) {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 10 : -10);
    }

    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  /* Holding Space turns a drag on the canvas into panning the stage. */
  useEffect(() => {
    function onKeyDown(event) {
      if (event.code !== 'Space' || isTypingTarget(event.target) || isControlTarget(event.target)) return;
      event.preventDefault();
      if (!event.repeat) setSpaceHeld(true);
    }

    /* Always lets go, whatever has focus - a keyup missed here would leave
       panning stuck on. */
    function onKeyUp(event) {
      if (event.code === 'Space') setSpaceHeld(false);
    }

    /* Alt-Tab away while holding Space swallows the keyup. */
    const release = () => setSpaceHeld(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', release);
    };
  }, []);

  function panStage(event) {
    if (!spaceHeld) return;
    event.preventDefault();
    event.stopPropagation();

    const stage = stageRef.current;
    const start = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop };

    function move(moveEvent) {
      stage.scrollLeft = start.left - (moveEvent.clientX - start.x);
      stage.scrollTop = start.top - (moveEvent.clientY - start.y);
    }

    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /*
   * Sizes the workspace to whatever is left below the header and toolbar,
   * measured rather than guessed: a hard-coded offset drifts the moment the
   * chrome above changes height, and being a few pixels out is the
   * difference between reaching the bottom and putting a scrollbar on the
   * page.
   */
  useEffect(() => {
    const node = layoutRef.current;
    if (!node) return;

    function fit() {
      if (document.fullscreenElement) {
        node.style.removeProperty('--vb-chrome');
        return;
      }

      const top = node.getBoundingClientRect().top + window.scrollY;

      /*
       * The page's own bottom padding sits below the workspace, so it has
       * to come out of the height too - leaving it in is what put a nine
       * pixel scrollbar on the page.
       */
      const container = node.closest('.dashboard-content');
      const gap = container
        ? parseFloat(getComputedStyle(container).paddingBottom) || 0
        : 18;

      /* rounded up, so a sub-pixel offset cannot leave a 1px scrollbar */
      node.style.setProperty('--vb-chrome', `${Math.ceil(top) + Math.ceil(gap) + 1}px`);
    }

    fit();

    const observer = new ResizeObserver(fit);
    observer.observe(document.documentElement);
    document.addEventListener('fullscreenchange', fit);

    return () => {
      observer.disconnect();
      document.removeEventListener('fullscreenchange', fit);
    };
  }, []);

  /*
   * Fullscreen takes the whole workspace rather than the canvas alone.
   * Only the canvas used to go fullscreen, which left the element rail and
   * the properties panel outside the fullscreen element and therefore
   * invisible - nothing could be selected or changed until you came back
   * out again.
   */
  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      layoutRef.current?.requestFullscreen();
    }
  }

  function select(kind, id) {
    /*
     * Clearing editingTextId below unmounts the canvas text editor before
     * its blur can fire - and only Chrome reliably fires blur just from a
     * focused node being removed, so on Firefox/Safari the edit was
     * silently lost. Blurring it here, while it's still in the DOM, saves
     * it through the ordinary onBlur path in every browser.
     */
    if (editingTextId) document.activeElement?.blur?.();
    setSelected({ kind, id });
    setEditingTextId(null);
    setMultiSelected([]);
    setEditingPhotoIndex(null);
  }

  function isSelected(kind, id) {
    if (!selected || selected.kind !== kind) return false;
    return id === undefined || selected.id === id;
  }

  function isMultiSelected(kind, id) {
    return multiSelected.some((item) => item.kind === kind && (item.id ?? null) === (id ?? null));
  }

  /*
   * A shift-click toggles an element into the multi-selection instead of
   * replacing the single selection - a plain click clears it and drags as
   * usual. The first shift-click folds whatever was already singly selected
   * into the group too, so "click A, shift-click B" ends with both selected
   * rather than just B.
   *
   * In box-select mode, every drag draws a marquee instead - including one
   * that starts on top of an element rather than bare canvas. Without this,
   * a board with little or no empty space to click (this one, for
   * instance) would leave box select with nowhere to actually start a drag
   * from.
   */
  /* Adds or removes one element from the multi-selection, folding the current single selection in first. */
  function toggleMulti(kind, id) {
    if (editingTextId) document.activeElement?.blur?.();
    setEditingTextId(null);
    setMultiSelected((current) => {
      const base = current.length > 0 ? current : selected ? [{ kind: selected.kind, id: selected.id ?? null }] : [];
      const exists = base.some((item) => item.kind === kind && (item.id ?? null) === (id ?? null));
      return exists
        ? base.filter((item) => !(item.kind === kind && (item.id ?? null) === (id ?? null)))
        : [...base, { kind, id: id ?? null }];
    });
    setSelected(null);
  }

  /* A Layers group row: every member at once. */
  function selectGroup(entries) {
    if (editingTextId) document.activeElement?.blur?.();
    setEditingTextId(null);
    setSelected(null);
    setMultiSelected(entries.map(({ kind, id }) => ({ kind, id: id ?? null })));
  }

  function handlePointerDown(kind, id) {
    return (event) => {
      if (boxSelectMode) {
        startBoxSelect(event);
        return;
      }

      if (event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        toggleMulti(kind, id);
        return;
      }

      /*
       * Starting a plain drag on something already part of the current
       * multi-selection (however it was built - shift-click or box select)
       * keeps that selection intact and drags the whole thing together -
       * see the multiSelected handling in beginDrag. Clicking anything
       * else collapses back to a single selection, as before.
       */
      const isPartOfMultiSelection = multiSelected.some(
        (item) => item.kind === kind && (item.id ?? null) === (id ?? null)
      );
      if (multiSelected.length > 0 && !isPartOfMultiSelection) setMultiSelected([]);
      grab(kind, id)(event);
    };
  }

  /*
   * Box (marquee) select - drag a rectangle across empty canvas to select
   * every element it touches, rather than shift-clicking each one. Only
   * armed while boxSelectMode is on, so a plain drag on empty canvas keeps
   * meaning "deselect" the rest of the time.
   *
   * Elements are found by their actual rendered position (getBoundingClientRect
   * on every [data-vb-kind] node) rather than by their stored x/y/width/height,
   * so it stays correct through rotation, zoom, and the resize handles some
   * kinds add - anything simpler would have to reimplement all of that.
   */
  function startBoxSelect(event) {
    const surface = middleColumnRef.current;
    if (!surface) return;

    event.preventDefault();
    const surfaceRect = surface.getBoundingClientRect();

    function toLocal(clientX, clientY) {
      return {
        x: Math.min(Math.max(clientX - surfaceRect.left, 0), surfaceRect.width),
        y: Math.min(Math.max(clientY - surfaceRect.top, 0), surfaceRect.height),
      };
    }

    const start = toLocal(event.clientX, event.clientY);

    function rectBetween(point) {
      const left = Math.min(start.x, point.x);
      const top = Math.min(start.y, point.y);
      return {
        left,
        top,
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
      };
    }

    setBoxSelectRect(rectBetween(start));

    function handleMove(moveEvent) {
      setBoxSelectRect(rectBetween(toLocal(moveEvent.clientX, moveEvent.clientY)));
    }

    function handleUp(upEvent) {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);

      const finalRect = rectBetween(toLocal(upEvent.clientX, upEvent.clientY));
      setBoxSelectRect(null);

      // A plain click (no real drag) inside box-select mode still just clears
      // the selection, the same as it would with the mode off.
      if (finalRect.width < 4 && finalRect.height < 4) {
        setSelected(null);
        setMultiSelected([]);
        return;
      }

      const picked = [];
      surface.querySelectorAll('[data-vb-kind]').forEach((node) => {
        const nodeRect = node.getBoundingClientRect();
        const left = nodeRect.left - surfaceRect.left;
        const top = nodeRect.top - surfaceRect.top;
        const intersects =
          left < finalRect.left + finalRect.width &&
          left + nodeRect.width > finalRect.left &&
          top < finalRect.top + finalRect.height &&
          top + nodeRect.height > finalRect.top;

        if (intersects) {
          picked.push({ kind: node.dataset.vbKind, id: node.dataset.vbId || null });
        }
      });

      if (picked.length >= 2) {
        setSelected(null);
        setMultiSelected(picked);
      } else if (picked.length === 1) {
        setSelected(picked[0]);
        setMultiSelected([]);
      } else {
        setSelected(null);
        setMultiSelected([]);
      }
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }

  /*
   * Right-clicking an element selects it and opens the order menu at the
   * pointer, so layering is reachable on the canvas rather than only in the
   * layers panel.
   */
  useEffect(() => {
    if (!contextMenu) return;

    const close = () => setContextMenu(null);
    const onKey = (event) => {
      if (event.key === 'Escape') close();
    };
    /* A press inside the menu is choosing an item, not dismissing it. */
    /* ...and scrolling a long menu is reading it. */
    const closeOutside = (event) => {
      if (!event.target.closest?.('.vb-context-menu')) close();
    };

    // capture, so the menu closes even if the target stops propagation
    window.addEventListener('pointerdown', closeOutside, true);
    window.addEventListener('scroll', closeOutside, true);
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('pointerdown', closeOutside, true);
      window.removeEventListener('scroll', closeOutside, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  function handleContextMenu(kind, id) {
    return (event) => {
      event.preventDefault();
      event.stopPropagation();

      /* right-clicking part of the multi-selection acts on all of it */
      const inMulti = multiSelected.some((item) => item.kind === kind && (item.id ?? null) === (id ?? null));
      if (!inMulti) select(kind, id);
      setContextMenu({ x: event.clientX, y: event.clientY, onElement: true });
    };
  }

  function runMenuAction(action) {
    setContextMenu(null);
    const selection = currentSelection();

    switch (action) {
      case 'cut': cutSelection(); break;
      case 'copy': copySelection(); break;
      case 'paste': pasteClipboard(); break;
      case 'duplicate': duplicateSelection(); break;
      case 'delete': removeSelection(); break;
      case 'lock': editor.setLockedMany(selection, !selectionLocked); break;
      case 'hide':
        editor.hideMany(selection);
        setSelected(null);
        setMultiSelected([]);
        break;
      case 'group': groupSelection(); break;
      case 'ungroup': ungroupSelection(); break;
      case 'selectAll': selectAll(); break;
      default: orderSelection(action);
    }
  }

  function handleGroup() {
    if (multiSelected.length < 2) return;
    editor.groupElements(multiSelected);
    setMultiSelected([]);
  }

  async function handleSaveTemplate(event) {
    event.preventDefault();
    if (!templateName.trim()) return;

    await saveTemplate(templateName, layout);
    setTemplateName('');
    setTemplateModal(null);
    showToast.success('Template saved.');
  }

  useEffect(() => subscribeBoardHistory(setHistory), []);
  useEffect(() => {
    // a failed prune just leaves an extra version until the next publish tries again
    pruneBoardHistory(history).catch((error) => console.warn('Could not prune the board history:', error));
  }, [history]);
  useEffect(() => saveFolded(panelFolded, window.localStorage), [panelFolded]);

  function loadRecentPhotos() {
    setRecentPhotos((current) => (Array.isArray(current) ? current : 'loading'));
    listRecentPhotos()
      .then(setRecentPhotos)
      .catch(() => setRecentPhotos('error'));
  }

  const recentPhotosShown = useRef(false);
  recentPhotosShown.current = activePanel === 'uploads' && !panelFolded;

  useEffect(() => {
    if (activePanel === 'uploads' && !panelFolded && recentPhotos === null) loadRecentPhotos();
  }, [activePanel, panelFolded, recentPhotos]);

  /* Photos and videos dropped on (or chosen in) the Uploads tab, added one at a time. */
  async function uploadFiles(fileList) {
    const { photos, videos, others } = splitUploads(fileList);
    if (others.length) showToast.error('Only photos (PNG, JPG, WEBP) or videos (MP4, WEBM, OGG) can be added.');
    for (const [index, file] of photos.entries()) await addPhotoAndSelect(file, photos.length > 1 ? spreadAt(index) : undefined);
    for (const file of videos) await addVideoAndSelect(file);
  }

  useEffect(() => {
    const guard = (event) => {
      if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    };
  }, []);

  /* Export PNG: the draft as the live board draws it, at 1920x1080. */
  async function exportPng() {
    setExporting(true);
    try {
      const { exportBoardPng } = await import('../lib/exportBoard');
      const { dataUrl, missing } = await exportBoardPng(layout);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = exportFileName(new Date());
      link.click();
      if (missing > 0) {
        showToast.error("Some photos or videos couldn't be included - run the one-time storage setup (see cors.json).");
      } else {
        showToast.success('Board saved as a picture.');
      }
    } catch (error) {
      console.warn('Could not export the board:', error);
      showToast.error(`Could not export the board (${error?.message ?? error}).`);
    } finally {
      setExporting(false);
    }
  }

  /* A published version goes into the draft - check it, then Publish. One undo step. */
  function restoreVersion(entry) {
    const restored = historyLayout(entry);
    if (!restored) {
      showToast.error('That version is from an older editor and cannot be restored.');
      return;
    }
    editor.replaceLayout(restored);
    setSelected(null);
    setMultiSelected([]);
    setHistoryOpen(false);
    showToast.success(`Restored the board from ${new Date(entry.publishedAt).toLocaleString()}. Publish to put it live.`);
  }

  function handleApplyTemplate(id) {
    const nextLayout = applyTemplate(templates, id);
    if (!nextLayout) {
      showToast.error('That template is gone.');
      return;
    }

    editor.replaceLayout(nextLayout);
    setSelected(null);
    setMultiSelected([]);
    setTemplateModal(null);
    showToast.success('Template applied to your draft.');
  }

  function handleDeleteTemplate(id) {
    deleteTemplate(id);
  }

  async function publish() {
    setPublishing(true);

    try {
      await publishBoardLayout(layout);
      setPublishedSnapshot(JSON.stringify(layout));
      setIsDirty(false);
      showToast.success('Published to the live board.');
      recordPublish(layout).catch((error) => {
        console.warn('Could not keep this version in History:', error);
        showToast.error('Published, but this version could not be kept in History.');
      });
    } catch (error) {
      console.warn('Could not publish the board layout:', error);
      showToast.error('Could not publish - the board may be too large (try a smaller photo).');
    } finally {
      setPublishing(false);
    }
  }

  async function addPhotoAndSelect(file, at) {
    const id = await editor.handleAddPhoto(file, at);
    if (id) {
      select('image', id);
      refreshRecentPhotos();
    }
  }

  /* Any upload path (Uploads tab, Add Photo, a canvas drop) brings the new photo into Recent. */
  function refreshRecentPhotos() {
    if (recentPhotosShown.current) loadRecentPhotos();
    else setRecentPhotos(null); // reloads when the Uploads tab next shows
  }

  /*
   * Photos dropped straight onto the board land where they were dropped -
   * several a little apart - and the last one is selected, as if each had
   * come through Add Photo.
   */
  async function dropPhotosOnCanvas(event) {
    event.preventDefault();
    setCanvasDropActive(false);
    const files = pickImageFiles(event.dataTransfer.files);
    if (!files.length) {
      if (event.dataTransfer.files?.length) showToast.error('Only PNG, JPG or WEBP photos can be dropped.');
      return;
    }
    const skipped = event.dataTransfer.files.length - files.length;
    if (skipped) showToast.error(`${skipped} file${skipped === 1 ? ' was' : 's were'} skipped: only PNG, JPG or WEBP photos can be dropped.`);

    const rect = middleColumnRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    let lastId = null;
    for (const [index, file] of files.entries()) {
      // one at a time, so they stack in drop order
      const id = await editor.handleAddPhoto(file, { x: x + index * 3, y: y + index * 3 });
      if (id) lastId = id;
    }
    if (lastId) {
      select('image', lastId);
      refreshRecentPhotos();
    }
  }

  async function addVideoAndSelect(file) {
    const id = await editor.handleAddVideo(file);
    if (id) select('video', id);
  }

  function addTextAndSelect(preset) {
    select('text', editor.addText(preset));
  }

  function addDividerAndSelect(orientation) {
    select('divider', editor.addDivider(orientation));
  }

  function addShapeAndSelect(kind) {
    select('shape', editor.addShape(kind));
  }

  /* The current selection as a list - multi first, else the single one. */
  function currentSelection() {
    if (multiSelected.length) return multiSelected;
    return selected ? [{ kind: selected.kind, id: selected.id ?? null }] : [];
  }

  function selectMany(list) {
    if (list.length === 1) {
      setSelected(list[0]);
      setMultiSelected([]);
    } else {
      setSelected(null);
      setMultiSelected(list);
    }
  }

  function removeSelection() {
    removeEntries(currentSelection());
  }

  /* Deletes (or, for the one-of-a-kind boxes and logo, hides) these
     elements - the Delete key, the menus and each Layers row all land here. */
  function removeEntries(selection) {
    if (!selection.length) return;

    const { removed, hidden, locked } = editor.removeMany(selection);

    if (locked && !removed && !hidden) {
      showToast(locked === 1 ? 'That element is locked.' : 'Those elements are locked.');
      return;
    }
    if (hidden) {
      showToast(
        `${hidden === 1 ? 'One element was' : `${hidden} elements were`} hidden - turn it back on from Layers.`
      );
    }

    const current = currentSelection();
    if (selection.some(({ kind, id }) => current.some((c) => c.kind === kind && (c.id ?? null) === (id ?? null)))) {
      setSelected(null);
      setMultiSelected([]);
    }
  }

  function duplicateSelection() {
    const copies = editor.duplicateMany(currentSelection());
    if (!copies.length) {
      showToast('The logo and the boxes are one of a kind - they can’t be copied.');
      return;
    }
    selectMany(copies);
  }

  function copySelection() {
    const snapshots = editor.snapshotElements(currentSelection());
    if (!snapshots.length) {
      showToast('The logo and the boxes are one of a kind - they can’t be copied.');
      return false;
    }
    setClipboard(snapshots);
    return true;
  }

  function cutSelection() {
    if (copySelection()) removeSelection();
  }

  function pasteClipboard() {
    if (!clipboard.length) return;
    selectMany(editor.pasteSnapshots(clipboard));
  }

  function groupSelection() {
    if (multiSelected.length >= 2) handleGroup();
  }

  function ungroupSelection() {
    const groupIds = new Set(
      currentSelection()
        .map(({ kind, id }) => findElement(layout, kind, id)?.groupId)
        .filter(Boolean)
    );
    groupIds.forEach((groupId) => editor.ungroup(groupId));
  }

  function orderSelection(direction) {
    const selection = currentSelection();
    if (selection.length === 1) editor.moveLayer(selection[0].kind, selection[0].id, direction);
    else if (selection.length > 1) editor.moveLayers(selection, direction);
  }

  function selectAll() {
    selectMany(editor.selectableElements());
  }

  function alignSelection(edge) {
    editor.alignSelection(currentSelection(), edge);
  }

  function distributeSelection(axis) {
    editor.distributeSelection(currentSelection(), axis);
  }

  function zoomBy(step) {
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + step)));
  }

  /*
   * A divider's CSS. The grab area is padded out to a usable thickness even
   * when the rule itself is a hairline, so a 1px line is still easy to hit.
   */
  function dividerStyle(divider) {
    const vertical = divider.orientation !== 'horizontal';
    const grab = Math.max(divider.thickness, 10);

    return {
      left: `${divider.x}%`,
      top: `${divider.y}%`,
      width: vertical ? `${grab}px` : `${divider.length}%`,
      height: vertical ? `${divider.length}%` : `${grab}px`,
      transform: 'translate(-50%, -50%)',
      /* the rule inside is drawn at the divider's real thickness */
      '--vb-divider-thickness': `${divider.thickness}px`,
    };
  }

  /* A photo or video's picture: its border and opacity, kept off the button
     so the selection handles are never bordered or faded. */
  function mediaStyle(media) {
    return withOpacity({ ...mediaStrokeCss(media.stroke, media.scale), boxSizing: 'border-box' }, media);
  }

  /* A positioned box's CSS - centred on its position, sized in percentages. */
  function boxStyle(box) {
    return {
      left: `${box.x}%`,
      top: `${box.y}%`,
      width: `${box.width}%`,
      ...(box.height === undefined ? {} : { height: `${box.height}%` }),
      transform: 'translate(-50%, -50%)',
    };
  }

  /* Selecting on the canvas and starting a drag are the same gesture. */
  function grab(kind, id) {
    return (event) => {
      // select() would collapse the multi-selection to just this one
      // element - skip it for a member of the current multi-selection, so
      // beginDrag sees the whole thing still selected and moves it as a
      // group (see the multiSelected handling there).
      const isPartOfMultiSelection = multiSelected.some(
        (item) => item.kind === kind && (item.id ?? null) === (id ?? null)
      );
      if (!isPartOfMultiSelection) select(kind, id);
      editor.beginDrag(kind, id)(event);
    };
  }

  /* The layers panel's label, icon, and underlying data object for one
     layerOrder entry - null if it names something that no longer exists. */
  function layerInfo(entry) {
    const info = autoLayerInfo(entry);
    if (info && DELETABLE_KINDS.has(entry.kind) && info.element?.name) return { ...info, label: info.element.name };
    return info;
  }

  function renameLayer(entry, value) {
    setRenamingLayer(null);
    const element = findElement(layout, entry.kind, entry.id);
    if (!element) return;
    const result = renamedLayer(value, { name: element.name, autoLabel: autoLayerInfo(entry)?.label });
    if (result.change) editor.updateElement(entry.kind, entry.id, { name: result.name });
  }

  function autoLayerInfo(entry) {
    if (entry.kind === 'logo') {
      return { label: 'Logo', Icon: ImageIcon, element: layout.logo };
    }

    if (entry.kind === 'candidates') {
      return { label: 'Candidate Board', Icon: UsersRound, element: layout.candidates };
    }

    if (entry.kind === 'announcements') {
      return { label: 'Announcements', Icon: Megaphone, element: layout.announcements };
    }

    if (entry.kind === 'divider') {
      const index = layout.dividers.findIndex((item) => item.id === entry.id);
      if (index < 0) return null;
      return {
        label: `Divider ${index + 1}`,
        Icon: SeparatorVertical,
        element: layout.dividers[index],
      };
    }

    if (entry.kind === 'text') {
      const index = layout.texts.findIndex((item) => item.id === entry.id);
      if (index < 0) return null;
      return { label: textLayerName(layout.texts[index].text, index), Icon: Type, element: layout.texts[index] };
    }

    if (entry.kind === 'image') {
      const index = layout.images.findIndex((item) => item.id === entry.id);
      if (index < 0) return null;
      return { label: `Photo ${index + 1}`, Icon: ImagePlus, element: layout.images[index] };
    }

    if (entry.kind === 'video') {
      const index = layout.videos.findIndex((item) => item.id === entry.id);
      if (index < 0) return null;
      return { label: `Video ${index + 1}`, Icon: Video, element: layout.videos[index] };
    }

    if (entry.kind === 'shape') {
      const index = layout.shapes.findIndex((item) => item.id === entry.id);
      if (index < 0) return null;
      const shape = layout.shapes[index];
      return { label: shapeLabels[index], Icon: SHAPE_ICONS[shape.kind] ?? Square, element: shape };
    }

    return null;
  }

  /*
   * One entry of layerOrder, drawn on the canvas - 'candidates' is handled
   * separately inline, since its markup is a fixed, non-draggable block.
   */
  function renderLayerEntry(entry) {
    if (entry.kind === 'divider') {
      const divider = layout.dividers.find((item) => item.id === entry.id);
      if (!divider || !isVisible(divider)) return null;

      const selectedOnCanvas = isSelected('divider', divider.id);

      return (
        <div
          key={divider.id}
          className={`vb-box vb-divider-box ${
            divider.orientation === 'horizontal' ? 'is-horizontal' : ''
          } ${selectedOnCanvas ? 'selected' : ''} ${
            isMultiSelected('divider', divider.id) ? 'multi-selected' : ''
          }`}
          style={dividerStyle(divider)}
          data-vb-kind="divider"
          data-vb-id={divider.id}
          onPointerDown={handlePointerDown('divider', divider.id)}
          onContextMenu={handleContextMenu('divider', divider.id)}
        >
          <span className="vb-divider-line" aria-hidden="true" style={withOpacity({}, divider)} />

          {selectedOnCanvas && !divider.locked && (
            <SelectionHandles
              handles={divider.orientation === 'horizontal' ? ['w', 'e'] : ['n', 's']}
              onResize={(h) => editor.beginDividerResize(divider.id, h.x || h.y)}
            />
          )}
        </div>
      );
    }

    if (entry.kind === 'candidates') {
      const box = layout.candidates;
      if (!isVisible(box)) return null;

      const selectedOnCanvas = isSelected('candidates');

      return (
        <div
          key="candidates"
          className={`vb-box vb-candidates ${selectedOnCanvas ? 'selected' : ''} ${
            isMultiSelected('candidates') ? 'multi-selected' : ''
          }`}
          style={boxStyle(box)}
          data-vb-kind="candidates"
          onPointerDown={handlePointerDown('candidates', null)}
          onContextMenu={handleContextMenu('candidates', null)}
        >
          {/* the live board's own candidate cards, so the box shows what it will hold;
              faded on this inner wrapper so the resize handles stay solid */}
          <div className="vb-box-content" style={withOpacity({}, box)}>
            <CandidateBoard
              candidates={candidates}
              perRow={box.perRow ?? 2}
              secondsPerCard={box.secondsPerCard ?? 4}
              look={normalizeCardSettings(box)}
            />
          </div>

          {selectedOnCanvas && !box.locked && (
            <SelectionHandles handles={ALL_HANDLES} onResize={(h) => editor.beginHandleResize('candidates', null, h)} />
          )}
        </div>
      );
    }

    if (entry.kind === 'announcements') {
      const box = layout.announcements;
      if (!isVisible(box)) return null;

      const selectedOnCanvas = isSelected('announcements');
      /* the live board shows the oldest active announcement first, and
         hides the strip altogether while there are none */
      const liveAnnouncement = announcements[0] ?? null;

      return (
        <div
          key="announcements"
          className={`vb-box vb-announcements ${liveAnnouncement ? '' : 'is-placeholder'} ${
            selectedOnCanvas ? 'selected' : ''
          } ${
            isMultiSelected('announcements') ? 'multi-selected' : ''
          }`}
          style={boxStyle(box)}
          data-vb-kind="announcements"
          onPointerDown={handlePointerDown('announcements', null)}
          onContextMenu={handleContextMenu('announcements', null)}
          title={
            liveAnnouncement
              ? undefined
              : 'Hidden on the live board until an announcement is posted'
          }
        >
          <div className="vb-box-content" style={withOpacity({}, box)}>
            <AnnouncementBanner
              message={liveAnnouncement ? liveAnnouncement.message : 'Announcements'}
              style={resolveAnnouncementStyle(announcementStyle)}
              showIcon={announcementStyle.showIcon}
              icon={announcementStyle.icon}
              background={announcementStyle.background}
            />
          </div>

          {selectedOnCanvas && !box.locked && (
            <SelectionHandles handles={ALL_HANDLES} onResize={(h) => editor.beginHandleResize('announcements', null, h)} />
          )}
        </div>
      );
    }

    if (entry.kind === 'logo') {
      if (!isVisible(layout.logo)) return null;

      return (
        <button
          key="logo"
          type="button"
          className={`vb-element vb-element-media ${isSelected('logo') ? 'selected' : ''} ${
            isMultiSelected('logo') ? 'multi-selected' : ''
          }`}
          style={{
            ...scaledPositionStyle(layout.logo, LOGO_BASE_WIDTH),
            ...resolveAnimationCss(layout.logo.animation),
          }}
          data-vb-kind="logo"
          onPointerDown={handlePointerDown('logo')}
          onContextMenu={handleContextMenu('logo', null)}
        >
          <img
            src={layout.logo.url || '/visual/logo.png'}
            alt=""
            className="vb-logo-img"
            style={withOpacity({}, layout.logo)}
          />

          {isSelected('logo') && !layout.logo.locked && (
            <SelectionHandles
              handles={CORNER_HANDLES}
              rotation={layout.logo.rotation ?? 0}
              inverseScale={1 / layout.logo.scale}
              onResize={(h) => editor.beginHandleResize('logo', null, h)}
              onRotate={editor.beginRotate('logo', null)}
            />
          )}
        </button>
      );
    }

    if (entry.kind === 'text') {
      const text = layout.texts.find((item) => item.id === entry.id);
      if (!text || !isVisible(text)) return null;

      if (editingTextId === text.id) {
        return (
          <div key={text.id} className="vb-text-editing" style={positionStyle(text)}>
            <CanvasTextEditor
              text={text}
              onDone={(value) => {
                if (value !== text.text) editor.setTextContent(text.id, value);
                setEditingTextId(null);
              }}
            />
          </div>
        );
      }

      return (
        <button
          key={text.id}
          type="button"
          className={`vb-element ${isSelected('text', text.id) ? 'selected' : ''} ${
            isMultiSelected('text', text.id) ? 'multi-selected' : ''
          }`}
          style={{ ...positionStyle(text), ...resolveAnimationCss(text.animation) }}
          data-vb-kind="text"
          data-vb-id={text.id}
          onPointerDown={handlePointerDown('text', text.id)}
          onContextMenu={handleContextMenu('text', text.id)}
          onDoubleClick={() => {
            if (!text.locked) setEditingTextId(text.id);
          }}
        >
          <span style={withOpacity(resolveTextStyle(text), text)}>
            <TextContent text={text} />
          </span>

          {isSelected('text', text.id) && !text.locked && (
            <SelectionHandles
              handles={TEXT_HANDLES}
              rotation={text.rotation ?? 0}
              onResize={(h) => editor.beginHandleResize('text', text.id, h)}
              onRotate={editor.beginRotate('text', text.id)}
            />
          )}
        </button>
      );
    }

    if (entry.kind === 'image') {
      const image = layout.images.find((item) => item.id === entry.id);
      if (!image || !isVisible(image)) return null;

      return (
        <button
          key={image.id}
          type="button"
          className={`vb-element vb-element-media ${isSelected('image', image.id) ? 'selected' : ''} ${
            isMultiSelected('image', image.id) ? 'multi-selected' : ''
          }`}
          style={{
            ...scaledPositionStyle(image, PHOTO_BASE_WIDTH),
            ...resolveAnimationCss(image.animation),
          }}
          data-vb-kind="image"
          data-vb-id={image.id}
          onPointerDown={handlePointerDown('image', image.id)}
          onContextMenu={handleContextMenu('image', image.id)}
        >
          <img src={image.url} alt="" className="vb-photo-img" style={mediaStyle(image)} />

          {isSelected('image', image.id) && !image.locked && (
            <SelectionHandles
              handles={CORNER_HANDLES}
              rotation={image.rotation ?? 0}
              inverseScale={1 / image.scale}
              onResize={(h) => editor.beginHandleResize('image', image.id, h)}
              onRotate={editor.beginRotate('image', image.id)}
            />
          )}
        </button>
      );
    }

    if (entry.kind === 'video') {
      const video = layout.videos.find((item) => item.id === entry.id);
      if (!video || !isVisible(video)) return null;

      return (
        <button
          key={video.id}
          type="button"
          className={`vb-element vb-element-media ${isSelected('video', video.id) ? 'selected' : ''} ${
            isMultiSelected('video', video.id) ? 'multi-selected' : ''
          }`}
          style={{
            ...scaledPositionStyle(video, PHOTO_BASE_WIDTH),
            ...resolveAnimationCss(video.animation),
          }}
          data-vb-kind="video"
          data-vb-id={video.id}
          onPointerDown={handlePointerDown('video', video.id)}
          onContextMenu={handleContextMenu('video', video.id)}
        >
          <video src={video.url} className="vb-photo-img" style={mediaStyle(video)} muted loop autoPlay playsInline />

          {isSelected('video', video.id) && !video.locked && (
            <SelectionHandles
              handles={CORNER_HANDLES}
              rotation={video.rotation ?? 0}
              inverseScale={1 / video.scale}
              onResize={(h) => editor.beginHandleResize('video', video.id, h)}
              onRotate={editor.beginRotate('video', video.id)}
            />
          )}
        </button>
      );
    }

    if (entry.kind === 'shape') {
      const shape = layout.shapes.find((item) => item.id === entry.id);
      if (!shape || !isVisible(shape)) return null;

      const isEmptyFrame =
        (shape.fill.type === 'image' || shape.fill.type === 'video') &&
        !shape.fill.url &&
        !isCarousel(shape);
      const selectedOnCanvas = isSelected('shape', shape.id);
      /*
       * left/top/width/height/transform position and size .vb-shape itself,
       * so SelectionHandles (a sibling of .vb-shape-fill below, positioned
       * absolute against .vb-shape) stays put. Everything else - border,
       * fill, a triangle's clip-path - goes on the inner .vb-shape-fill
       * instead: clip-path also clips a node's descendants' hit-testing,
       * and SelectionHandles must stay clickable outside the silhouette.
       */
      const { left, top, width, height, transform, ...shapeFillStyle } = resolveShapeStyle(shape);

      return (
        <div
          key={shape.id}
          className={`vb-shape ${selectedOnCanvas ? 'selected' : ''} ${
            isEmptyFrame ? 'is-empty-frame' : ''
          } ${isMultiSelected('shape', shape.id) ? 'multi-selected' : ''}`}
          style={{ left, top, width, height, transform }}
          data-vb-kind="shape"
          data-vb-id={shape.id}
          onPointerDown={handlePointerDown('shape', shape.id)}
          onContextMenu={handleContextMenu('shape', shape.id)}
        >
          <div className="vb-shape-fill" style={withOpacity(shapeFillStyle, shape)}>
            {isEmptyFrame && <Frame size={16} className="vb-frame-hint" />}

            {isZigzag(shape) ? (
              <ZigzagRule
                color={shape.stroke.color}
                width={shape.stroke.width}
                peaks={shape.peaks}
              />
            ) : isCarousel(shape) ? (
              <PhotoCarousel
                photos={shape.photos}
                direction={shape.animation.direction}
                speed={shape.animation.speed}
                fit={shape.fill.fit}
              />
            ) : (
              <>
                {shape.fill.type === 'image' && <PhotoAdjuster fill={shape.fill} />}
                {shape.fill.type === 'video' && <VideoAdjuster fill={shape.fill} />}
              </>
            )}
          </div>

          {selectedOnCanvas && !shape.locked && (
            <SelectionHandles
              handles={ALL_HANDLES}
              rotation={shape.rotation}
              onResize={(h) => editor.beginHandleResize('shape', shape.id, h)}
              onRotate={editor.beginRotate('shape', shape.id)}
            />
          )}
        </div>
      );
    }

    return null;
  }

  const selectedImage =
    selected?.kind === 'image' ? layout.images.find((image) => image.id === selected.id) : null;
  const selectedVideo =
    selected?.kind === 'video' ? layout.videos.find((video) => video.id === selected.id) : null;
  const selectedText =
    selected?.kind === 'text' ? layout.texts.find((text) => text.id === selected.id) : null;
  const selectedShape =
    selected?.kind === 'shape' ? layout.shapes.find((shape) => shape.id === selected.id) : null;

  const selectedDivider =
    selected?.kind === 'divider'
      ? layout.dividers.find((divider) => divider.id === selected.id)
      : null;

  const selectedElement =
    selected?.kind === 'logo'
      ? layout.logo
      : selected?.kind === 'image'
        ? selectedImage
        : selected?.kind === 'video'
          ? selectedVideo
          : selected?.kind === 'text'
            ? selectedText
            : selected?.kind === 'divider'
              ? selectedDivider
              : selectedShape;

  const isTextSelected = selected?.kind === 'text';
  const shapeLabels = labelShapes(layout.shapes);
  const overlayIn = (node) => (isFullscreen && layoutRef.current ? createPortal(node, layoutRef.current) : node);

  /* Props for a folding section of the selected element (or the board, with nothing selected). */
  function sectionProps(name) {
    const kind = selected?.kind ?? 'board';
    const open = isSectionOpen(name, kind, sectionOverrides);
    return { name, open, onToggle: () => setSectionOverrides((current) => ({ ...current, [name]: !open })) };
  }

  const selectionNow = currentSelection();

  /* The selection's on-screen rect, for the floating bar (null when none of it is drawn). */
  function measureSelection() {
    const surface = middleColumnRef.current;
    const parts = currentSelection()
      .map(({ kind, id }) => editor.measure(kind, id))
      .filter(Boolean);
    if (!surface || !parts.length) return null;

    const bounds = unionBounds(parts);
    const rect = surface.getBoundingClientRect();
    return {
      left: rect.left + (bounds.left / 100) * rect.width,
      right: rect.left + (bounds.right / 100) * rect.width,
      top: rect.top + (bounds.top / 100) * rect.height,
      bottom: rect.top + (bounds.bottom / 100) * rect.height,
    };
  }

  const showFloatingBar =
    selectionNow.length > 0 && !editor.interacting && !boxSelectRect && !editingTextId && !focusMode && !contextMenu;
  const selectionLocked =
    selectionNow.length > 0 &&
    selectionNow.every(({ kind, id }) => findElement(layout, kind, id)?.locked);

  return (
    <>
      <section className="panel table-panel">
        {/* ================= EDITOR BAR ================= */}

        <div className="vb-toolbar">
          <div className="vb-toolbar-group">
            <button
              type="button"
              className="vb-toolbar-button"
              onClick={editor.undo}
              disabled={!editor.canUndo}
              title="Undo"
              aria-label="Undo"
            >
              <Undo2 size={15} />
            </button>
            <button
              type="button"
              className="vb-toolbar-button"
              onClick={editor.redo}
              disabled={!editor.canRedo}
              title="Redo"
              aria-label="Redo"
            >
              <Redo2 size={15} />
            </button>
            <button
              type="button"
              className={`vb-toolbar-button ${boxSelectMode ? 'active' : ''}`}
              onClick={() => setBoxSelectMode((current) => !current)}
              aria-pressed={boxSelectMode}
              aria-label="Box select"
              title="Box select - drag a rectangle across the canvas to select everything it touches"
            >
              <BoxSelect size={15} />
            </button>
          </div>

          <span className="vb-toolbar-divider" aria-hidden="true" />

          <BarMenu
            label={`${zoom}%`}
            title="Zoom"
            portal={overlayIn}
            items={[
              { type: 'action', label: 'Zoom in', onSelect: () => zoomBy(10), disabled: zoom >= MAX_ZOOM },
              { type: 'action', label: 'Zoom out', onSelect: () => zoomBy(-10), disabled: zoom <= MIN_ZOOM },
              { type: 'separator' },
              ...ZOOM_PRESETS.map((value) => ({
                type: 'action',
                label: value === 100 ? 'Fit (100%)' : `${value}%`,
                onSelect: () => setZoom(value),
              })),
            ]}
          />

          <BarMenu
            label="View"
            title="View"
            portal={overlayIn}
            items={[
              { type: 'group', label: 'Show' },
              { type: 'check', label: 'Grid (snap to it)', checked: showGrid, onToggle: () => setShowGrid((current) => !current) },
              { type: 'check', label: 'Rulers', checked: showRulers, onToggle: () => setShowRulers((current) => !current) },
              { type: 'check', label: 'Guide lines', checked: showGuides, onToggle: () => setShowGuides((current) => !current) },
              { type: 'separator' },
              { type: 'group', label: 'Snapping' },
              {
                type: 'check',
                label: 'Snap to elements',
                hint: 'hold Ctrl to skip',
                checked: snapEnabled,
                onToggle: () => setSnapEnabled((current) => !current),
              },
              { type: 'check', label: 'Snap to guide lines', checked: snapToGuides, onToggle: () => setSnapToGuides((current) => !current) },
              { type: 'separator' },
              { type: 'group', label: 'Guide lines' },
              { type: 'check', label: 'Lock guide lines', checked: guidesLocked, onToggle: () => setGuidesLocked((current) => !current) },
              {
                type: 'action',
                label: 'Clear all guide lines',
                disabled: !guides.x.length && !guides.y.length,
                onSelect: () => setGuides({ x: [], y: [] }),
              },
              { type: 'separator' },
              { type: 'group', label: 'Screen' },
              { type: 'check', label: 'Focus mode', checked: focusMode, onToggle: toggleFocusMode },
              { type: 'check', label: 'Fullscreen', checked: isFullscreen, onToggle: toggleFullscreen },
            ]}
          />

          <span className="vb-toolbar-spacer" />

          <BarMenu
            label="Templates"
            title="Templates"
            portal={overlayIn}
            items={[
              { type: 'action', label: 'Save as template…', onSelect: () => setTemplateModal('save') },
              { type: 'action', label: 'Apply a template…', onSelect: () => setTemplateModal('apply') },
            ]}
          />

          <BarMenu
            icon={MoreHorizontal}
            title="More"
            portal={overlayIn}
            items={[{ type: 'action', label: 'Reset board to default', onSelect: editor.resetLayout }]}
          />

          <span className="vb-toolbar-divider" aria-hidden="true" />

          <button
            type="button"
            className="vb-toolbar-button"
            onClick={exportPng}
            disabled={exporting}
            title="Save the draft as a 1920x1080 picture"
          >
            <ImageDown size={14} />
            <span>{exporting ? 'Exporting…' : 'Export PNG'}</span>
          </button>
          <button
            type="button"
            className="vb-toolbar-button"
            onClick={() => setHistoryOpen(true)}
            title="Earlier published versions of the board"
          >
            <History size={14} />
            <span>History</span>
          </button>
          <a
            href="/admin/visual-board/preview"
            target="_blank"
            rel="noopener noreferrer"
            className="vb-toolbar-button"
            title="See your unpublished changes as they'll look once Published"
          >
            <span>Preview</span>
            <ExternalLink size={11} />
          </a>
          <button
            type="button"
            className="primary-button vb-publish-button"
            onClick={publish}
            disabled={!isDirty || publishing}
            title={isDirty ? 'Publish (unpublished changes)' : 'Up to date with the live board'}
            aria-label={isDirty ? 'Publish (unpublished changes)' : 'Up to date with the live board'}
          >
            {isDirty && <span className="vb-publish-dot" aria-hidden="true" />}
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>

        <div className={`vb-layout ${focusMode ? 'vb-focus-mode' : ''} ${panelFolded ? 'panel-folded' : ''}`} ref={layoutRef}>
          {focusMode && (
            <button
              type="button"
              className="vb-focus-exit"
              onClick={toggleFocusMode}
              title="Exit focus mode (Esc)"
            >
              <Minimize size={14} />
              Exit Focus
            </button>
          )}

          {/* ================= ELEMENTS ================= */}

          <div className="vb-elements-col">
            <div className="vb-rail">
              {RAIL_TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`vb-rail-button ${activePanel === tab.id ? 'active' : ''}`}
                    aria-pressed={activePanel === tab.id && !panelFolded}
                    onClick={() => {
                      const next = clickTab({ active: activePanel, folded: panelFolded }, tab.id);
                      setActivePanel(next.active);
                      setPanelFolded(next.folded);
                    }}
                  >
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
              {panelFolded && (
                <button
                  type="button"
                  className="vb-rail-button vb-rail-open"
                  onClick={() => setPanelFolded(false)}
                  aria-label="Open panel"
                  title="Open panel"
                >
                  <ChevronsRight size={16} />
                </button>
              )}
            </div>

            {!panelFolded && (
            <div className="vb-panel">
              <div className="vb-panel-head">
                <h3>{RAIL_TABS.find((tab) => tab.id === activePanel)?.label}</h3>
                {activePanel === 'layers' && (
                  <span className="vb-panel-count">{layout.layerOrder.filter((entry) => layerInfo(entry)).length}</span>
                )}
                <button
                  type="button"
                  className="vb-panel-fold"
                  onClick={() => setPanelFolded(true)}
                  aria-label="Fold panel"
                  title="Fold panel"
                >
                  <ChevronsLeft size={15} />
                </button>
              </div>
              {activePanel === 'elements' && (
                <>
                  <p className="vb-panel-label">Shapes</p>
                  <div className="vb-shape-grid">
                    {SHAPE_KINDS.filter((option) => option.value !== 'line').map((option) => {
                      const Icon = SHAPE_ICONS[option.value] ?? Square;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className="vb-shape-grid-button"
                          onClick={() => addShapeAndSelect(option.value)}
                        >
                          <Icon size={16} />
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <p className="vb-panel-label">Lines</p>
                  <div className="vb-shape-grid">
                    <button
                      type="button"
                      className="vb-shape-grid-button"
                      onClick={() => addShapeAndSelect('line')}
                    >
                      <Minus size={16} />
                      <span>Line</span>
                    </button>
                    <button
                      type="button"
                      className="vb-shape-grid-button"
                      onClick={() => addDividerAndSelect('vertical')}
                    >
                      <SeparatorVertical size={16} />
                      <span>Divider ↕</span>
                    </button>
                    <button
                      type="button"
                      className="vb-shape-grid-button"
                      onClick={() => addDividerAndSelect('horizontal')}
                    >
                      <SeparatorHorizontal size={16} />
                      <span>Divider ↔</span>
                    </button>
                  </div>
                </>
              )}

              {activePanel === 'text' && (
                <>
                  {TEXT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`vb-text-preset is-${preset.id}`}
                      onClick={() => addTextAndSelect(preset)}
                      aria-label={`Add ${preset.label.toLowerCase()}`}
                    >
                      <span
                        style={{
                          fontFamily: FONT_STACKS[preset.style.fontFamily],
                          fontWeight: preset.style.weight,
                          textTransform: preset.style.textCase === 'uppercase' ? 'uppercase' : 'none',
                          ...fillTextCss(preset.style.fill),
                        }}
                      >
                        {preset.bulletList
                          ? preset.text.split('\n').map((line) => <span key={line} className="vb-text-preset-line">• {line}</span>)
                          : preset.text}
                      </span>
                    </button>
                  ))}
                  <p className="vb-panel-hint">Click a style to add it to the board.</p>
                </>
              )}

              {activePanel === 'uploads' && (
                <>
                  <input
                    id="vb-add-upload"
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/ogg"
                    className="vb-upload-input"
                    aria-label="Choose photos or videos to add"
                    onChange={(event) => {
                      const files = [...(event.target.files ?? [])];
                      event.target.value = '';
                      void uploadFiles(files);
                    }}
                  />
                  <label
                    htmlFor="vb-add-upload"
                    className={`vb-upload-drop ${uploadDropActive ? 'is-over' : ''}`}
                    onDragOver={(event) => {
                      if (!event.dataTransfer.types.includes('Files')) return;
                      event.preventDefault();
                      setUploadDropActive(true);
                    }}
                    onDragLeave={(event) => {
                      // crossing onto the icon or text inside still counts as over the zone
                      if (!event.currentTarget.contains(event.relatedTarget)) setUploadDropActive(false);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setUploadDropActive(false);
                      if (event.dataTransfer.files?.length) void uploadFiles(event.dataTransfer.files);
                    }}
                  >
                    <UploadCloud size={20} />
                    <span>Drop photos or videos here</span>
                    <strong>or choose files</strong>
                  </label>

                  <p className="vb-panel-label">Recent photos</p>
                  {recentPhotos === 'loading' || recentPhotos === null ? (
                    <p className="vb-panel-hint">Loading…</p>
                  ) : recentPhotos === 'error' ? (
                    <p className="vb-panel-hint">
                      Recent photos couldn't be loaded.{' '}
                      <button type="button" className="vb-retry-link" onClick={loadRecentPhotos}>
                        Retry
                      </button>
                    </p>
                  ) : recentPhotos.length === 0 ? (
                    <p className="vb-panel-hint">Photos you upload show up here.</p>
                  ) : (
                    <>
                      <div className="vb-recent-grid">
                        {recentPhotos.map((url) => (
                          <button
                            key={url}
                            type="button"
                            className="vb-recent-photo"
                            onClick={() => select('image', editor.addImageFromUrl(url))}
                            aria-label="Add this photo to the board"
                            title="Add to the board"
                          >
                            <img src={url} alt="" loading="lazy" />
                          </button>
                        ))}
                      </div>
                      <p className="vb-panel-hint">Click a photo to put it on the board again, with no new upload.</p>
                    </>
                  )}
                </>
              )}

              {activePanel === 'icons' && (
                <IconPanel onInsert={(url) => select('image', editor.addImageFromUrl(url))} />
              )}

              {activePanel === 'layers' && (
                <>
                  <p className="vb-panel-label">Front to back</p>
                  {(() => {
                  const list = [...layout.layerOrder].reverse();
                  const renderRow = (entry, nested = false) => {
                    const displayIndex = list.indexOf(entry);
                    const info = layerInfo(entry);
                    if (!info) return null;

                    const key = `${entry.kind}:${entry.id ?? ''}`;
                    const visible = info.element ? isVisible(info.element) : true;
                    const locked = info.element?.locked ?? false;
                    const Icon = info.Icon;

                    const isDragging = draggingLayer?.kind === entry.kind && draggingLayer?.id === entry.id;

                    return (
                      <div
                        key={key}
                        data-layer-key={key}
                        className={`vb-layer-row ${
                          isSelected(entry.kind, entry.id) || isMultiSelected(entry.kind, entry.id) ? 'active' : ''
                        } ${nested ? 'is-nested' : ''} ${
                          isDragging ? 'dragging' : ''
                        } ${layerDropTarget === key && !isDragging ? 'drop-target' : ''} ${visible ? '' : 'is-hidden'}`}
                        draggable={renamingLayer !== key}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          setDraggingLayer({ kind: entry.kind, id: entry.id });
                        }}
                        onDragEnd={() => {
                          setDraggingLayer(null);
                          setLayerDropTarget(null);
                        }}
                        onDragEnter={() => setLayerDropTarget(key)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (draggingLayer && !isDragging) {
                            editor.reorderLayer(
                              draggingLayer.kind,
                              draggingLayer.id,
                              entry.kind,
                              entry.id
                            );
                          }
                          setDraggingLayer(null);
                          setLayerDropTarget(null);
                        }}
                      >
                        {renamingLayer === key ? (
                          <div className="vb-layer-name is-renaming">
                            <LayerThumb thumb={layerThumb(entry.kind, info.element)} Icon={Icon} />
                            <input
                              className="vb-layer-rename"
                              defaultValue={info.element?.name ?? info.label}
                              aria-label={`Rename ${info.label}`}
                              maxLength={40}
                              autoFocus
                              onFocus={(event) => event.target.select()}
                              onKeyDown={(event) => {
                                event.stopPropagation(); // typing never fires the editor's shortcuts
                                if (event.key === 'Enter') event.currentTarget.blur();
                                if (event.key === 'Escape') {
                                  event.currentTarget.dataset.cancel = '1';
                                  event.currentTarget.blur();
                                }
                              }}
                              onBlur={(event) => {
                                if (event.target.dataset.cancel) setRenamingLayer(null);
                                else renameLayer(entry, event.target.value);
                              }}
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="vb-layer-name"
                            title={DELETABLE_KINDS.has(entry.kind) ? `${info.label} - double-click or F2 to rename` : info.label}
                            onClick={(event) => {
                              if (event.shiftKey || event.ctrlKey || event.metaKey) toggleMulti(entry.kind, entry.id);
                              else select(entry.kind, entry.id);
                            }}
                            onDoubleClick={() => {
                              if (DELETABLE_KINDS.has(entry.kind)) setRenamingLayer(key);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== 'F2' || !DELETABLE_KINDS.has(entry.kind)) return;
                              event.preventDefault();
                              event.stopPropagation();
                              setRenamingLayer(key);
                            }}
                          >
                            <LayerThumb thumb={layerThumb(entry.kind, info.element)} Icon={Icon} />
                            <span>{info.label}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className={`vb-layer-icon-button vb-layer-toggle ${visible ? '' : 'is-set'}`}
                          onClick={() => editor.toggleVisible(entry.kind, entry.id)}
                          aria-label={visible ? `Hide ${info.label}` : `Show ${info.label}`}
                        >
                          {visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>

                        <button
                          type="button"
                          className={`vb-layer-icon-button vb-layer-toggle ${locked ? 'is-set' : ''}`}
                          onClick={() => editor.setLocked(entry.kind, entry.id, !locked)}
                          aria-label={locked ? `Unlock ${info.label}` : `Lock ${info.label}`}
                        >
                          {locked ? <Lock size={13} /> : <LockOpen size={13} />}
                        </button>


                        <div className="vb-layer-actions">
                        <div className="vb-layer-move">
                          <button
                            type="button"
                            className="vb-layer-icon-button"
                            disabled={displayIndex === 0}
                            onClick={() => editor.moveLayer(entry.kind, entry.id, 'front')}
                            aria-label={`Bring ${info.label} to front`}
                            title="Bring to front"
                          >
                            <ChevronsUp size={13} />
                          </button>
                          <button
                            type="button"
                            className="vb-layer-icon-button"
                            disabled={displayIndex === 0}
                            onClick={() => editor.moveLayer(entry.kind, entry.id, 'up')}
                            aria-label={`Bring ${info.label} forward`}
                            title="Bring forward"
                          >
                            <ChevronUp size={13} />
                          </button>
                          <button
                            type="button"
                            className="vb-layer-icon-button"
                            disabled={displayIndex === list.length - 1}
                            onClick={() => editor.moveLayer(entry.kind, entry.id, 'down')}
                            aria-label={`Send ${info.label} backward`}
                            title="Send backward"
                          >
                            <ChevronDown size={13} />
                          </button>
                          <button
                            type="button"
                            className="vb-layer-icon-button"
                            disabled={displayIndex === list.length - 1}
                            onClick={() => editor.moveLayer(entry.kind, entry.id, 'back')}
                            aria-label={`Send ${info.label} to back`}
                            title="Send to back"
                          >
                            <ChevronsDown size={13} />
                          </button>
                        </div>

                        {DELETABLE_KINDS.has(entry.kind) && (
                          <button
                            type="button"
                            className="vb-layer-icon-button vb-layer-delete"
                            onClick={() => removeEntries([{ kind: entry.kind, id: entry.id }])}
                            aria-label={`Delete ${info.label}`}
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        </div>
                      </div>
                    );
                  };

                  const groupOf = (entry) => findElement(layout, entry.kind, entry.id)?.groupId ?? null;
                  return layerTree(list, groupOf).map((node) => {
                    if (node.type === 'item') return renderRow(node.entry);
                    const open = !foldedGroups.has(node.groupId);
                    const allSelected = node.entries.every((entry) => isMultiSelected(entry.kind, entry.id));
                    // folded shut, a selected member would otherwise show nowhere in the list
                    const hiddenSelection =
                      !open &&
                      node.entries.some((entry) => isSelected(entry.kind, entry.id) || isMultiSelected(entry.kind, entry.id));
                    return (
                      <div key={`group:${node.groupId}`} className="vb-layer-group">
                        <div className={`vb-layer-group-row ${allSelected || hiddenSelection ? 'active' : ''}`}>
                          <button
                            type="button"
                            className="vb-layer-icon-button"
                            aria-expanded={open}
                            aria-label={open ? 'Fold group' : 'Open group'}
                            onClick={() =>
                              setFoldedGroups((current) => {
                                const next = new Set(current);
                                if (open) next.add(node.groupId);
                                else next.delete(node.groupId);
                                return next;
                              })
                            }
                          >
                            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </button>
                          <button
                            type="button"
                            className="vb-layer-name"
                            title="Select the whole group"
                            onClick={() => selectGroup(node.entries)}
                          >
                            <span className="vb-layer-thumb">
                              <Group size={13} />
                            </span>
                            <span>Group · {node.entries.length} items</span>
                          </button>
                        </div>
                        {open && node.entries.map((entry) => renderRow(entry, true))}
                      </div>
                    );
                  });
                  })()}
                </>
              )}
            </div>
            )}
          </div>

          {/* ================= CANVAS ================= */}

          <div className="vb-canvas-col">
            {showRulers && (
              <Rulers
                stageRef={stageRef}
                canvasRef={canvasRef}
                zoom={zoom}
                onDraft={(draft) => {
                  setGuideDraft(draft);
                  if (draft) setShowGuides(true);
                }}
                onDrop={(axis, at) => setGuides((current) => addGuide(current, axis, at))}
              />
            )}
            <div
              className={`vb-canvas-stage ${spaceHeld ? 'is-panning' : ''} ${showRulers ? 'has-rulers' : ''}`}
              ref={stageRef}
              onPointerDownCapture={panStage}
            >
              <div
                className={`vb-canvas ${showGrid ? 'show-grid' : ''}`}
                ref={canvasRef}
                // Read by .vb-canvas in globals.css - see the comment there.
                style={{ '--vb-zoom': zoom / 100 }}
              >
                {/* The live board's backdrop - see .vb-canvas-bg in globals.css. */}
                <video
                  className="vb-canvas-bg"
                  src="/visual/bg.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  aria-hidden="true"
                />
                <div className="vb-canvas-bg-shade" aria-hidden="true" />

                {/*
                  One free-form surface, matching the live board: every
                  element is positioned against it, and pressing the empty
                  canvas clears the selection.

                  This listens for pointerdown rather than click because a
                  click that starts on an element and ends on the background
                  is reported against their common ancestor, which would drop
                  the selection every time an element was dragged into space.
                */}
                <div
                  className={`vb-canvas-surface ${boxSelectMode ? 'vb-box-select-mode' : ''}`}
                  ref={middleColumnRef}
                  data-drop-active={canvasDropActive || undefined}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types?.includes('Files')) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                    setCanvasDropActive(true);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setCanvasDropActive(false);
                  }}
                  onDrop={(event) => {
                    if (!event.dataTransfer.types?.includes('Files')) return;
                    void dropPhotosOnCanvas(event);
                  }}
                  onContextMenu={(event) => {
                    if (event.target !== event.currentTarget) return;
                    event.preventDefault();
                    setContextMenu({ x: event.clientX, y: event.clientY, onElement: false });
                  }}
                  onPointerDown={(event) => {
                    if (event.target !== event.currentTarget) return;

                    if (boxSelectMode) {
                      startBoxSelect(event);
                      return;
                    }

                    setSelected(null);
                    setMultiSelected([]);
                  }}
                >
                  {layout.layerOrder.map(renderLayerEntry)}

                  <SmartGuides guides={editor.guides} />

                  {showGuides && (
                    <GuideLines
                      guides={guides}
                      draft={guideDraft}
                      locked={guidesLocked}
                      highlighted={{
                        x: editor.guides.lines.filter((line) => line.axis === 'x').map((line) => line.at),
                        y: editor.guides.lines.filter((line) => line.axis === 'y').map((line) => line.at),
                      }}
                      onMove={(axis, index, at) => setGuides((current) => moveGuide(current, axis, index, at))}
                      onRemove={(axis, index) => setGuides((current) => removeGuide(current, axis, index))}
                    />
                  )}

                  {boxSelectRect && (
                    <div
                      className="vb-box-select-rect"
                      style={{
                        left: boxSelectRect.left,
                        top: boxSelectRect.top,
                        width: boxSelectRect.width,
                        height: boxSelectRect.height,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* ================= PROPERTIES ================= */}

          <div className="vb-properties">
            {multiSelected.length >= 2 ? (
              <>
                <h3 className="vb-properties-title">{multiSelected.length} Elements Selected</h3>
                <div className="vb-multi-actions">
                  <button type="button" className="primary-button" onClick={handleGroup}>
                    <Group size={13} />
                    Group
                  </button>
                  <button type="button" className="secondary-button" onClick={duplicateSelection}>
                    <Copy size={13} />
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => editor.setLockedMany(multiSelected, !selectionLocked)}
                  >
                    {selectionLocked ? <LockOpen size={13} /> : <Lock size={13} />}
                    {selectionLocked ? 'Unlock' : 'Lock'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      editor.hideMany(multiSelected);
                      setMultiSelected([]);
                    }}
                  >
                    <EyeOff size={13} />
                    Hide
                  </button>
                  <button type="button" className="secondary-button vb-danger-button" onClick={removeSelection}>
                    <Trash2 size={13} />
                    Delete
                  </button>
                </div>
              </>
            ) : !selected ? (
              <div className="vb-board-panel">
                <h3 className="vb-properties-title">Board</h3>
                <p className="vb-properties-hint">
                  {CANVAS_HINT} Shift-click to select more than one and group them.
                </p>

                <div className="vb-board-links">
                  <button type="button" className="secondary-button" onClick={() => select('candidates')}>
                    <UsersRound size={13} />
                    Candidate Board settings
                  </button>
                  <button type="button" className="secondary-button" onClick={() => select('announcements')}>
                    <Megaphone size={13} />
                    Announcement strip settings
                  </button>
                </div>

                <PropertySection {...sectionProps('Keyboard shortcuts')}>
                  <dl className="vb-shortcuts">
                    {EDITOR_SHORTCUTS.map(({ keys, action }) => (
                      <div key={keys}>
                        <dt>{keys}</dt>
                        <dd>{action}</dd>
                      </div>
                    ))}
                  </dl>
                </PropertySection>
              </div>
            ) : BOX_KINDS[selected.kind] ? (
              (() => {
                const box = layout[selected.kind];

                return (
                  <>
                    <h3 className="vb-properties-title">
                      {BOX_KINDS[selected.kind].label}
                    </h3>
                    <p className="vb-properties-hint">
                      {BOX_KINDS[selected.kind].hint}
                    </p>

                    <PropertySection {...sectionProps('Position & size')}>
                      <div className="vb-field-row">
                        <label htmlFor="vb-box-x">
                          X %
                          <input
                            id="vb-box-x"
                            className="form-input"
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={Number(box.x.toFixed(1))}
                            onChange={(event) =>
                              editor.updateElement(selected.kind, null, {
                                x: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label htmlFor="vb-box-y">
                          Y %
                          <input
                            id="vb-box-y"
                            className="form-input"
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={Number(box.y.toFixed(1))}
                            onChange={(event) =>
                              editor.updateElement(selected.kind, null, {
                                y: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>

                      <div className="vb-field-row">
                        {box.width !== undefined && (
                          <label htmlFor="vb-box-w">
                            W %
                            <input
                              id="vb-box-w"
                              className="form-input"
                              type="number"
                              min="1"
                              max="100"
                              step="0.5"
                              value={Number(box.width.toFixed(1))}
                              onChange={(event) =>
                                editor.updateElement(selected.kind, null, {
                                  width: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                        )}

                        {box.height !== undefined && (
                          <label htmlFor="vb-box-h">
                            H %
                            <input
                              id="vb-box-h"
                              className="form-input"
                              type="number"
                              min="8"
                              max="100"
                              step="0.5"
                              value={Number(box.height.toFixed(1))}
                              onChange={(event) =>
                                editor.updateElement(selected.kind, null, {
                                  height: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                        )}
                      </div>
                    </PropertySection>

                    {(box.secondsPerCard !== undefined || box.perRow !== undefined) && (
                      <PropertySection {...sectionProps('Carousel')}>
                        {box.secondsPerCard !== undefined && (
                          <div className="vb-field-row">
                            <label htmlFor="vb-carousel-speed">
                              Carousel seconds per card
                              <input
                                id="vb-carousel-speed"
                                className="form-input"
                                type="number"
                                min="0.5"
                                max="30"
                                step="0.5"
                                value={box.secondsPerCard}
                                onChange={(event) =>
                                  editor.updateElement(selected.kind, null, {
                                    secondsPerCard: Number(event.target.value),
                                  })
                                }
                              />
                            </label>
                          </div>
                        )}

                        {box.secondsPerCard !== undefined && (
                          <input
                            className="vb-range"
                            type="range"
                            min="0.5"
                            max="12"
                            step="0.5"
                            value={box.secondsPerCard}
                            aria-label="Carousel speed"
                            onChange={(event) =>
                              editor.updateElement(selected.kind, null, {
                                secondsPerCard: Number(event.target.value),
                              })
                            }
                          />
                        )}

                        {box.perRow !== undefined && (
                          <div className="vb-field-row">
                            <label htmlFor="vb-per-row">
                              Candidates per row
                              <input
                                id="vb-per-row"
                                className="form-input"
                                type="number"
                                min="1"
                                max="6"
                                step="1"
                                value={box.perRow}
                                onChange={(event) =>
                                  editor.updateElement(selected.kind, null, {
                                    perRow: Number(event.target.value),
                                  })
                                }
                              />
                            </label>
                          </div>
                        )}

                        {box.perRow !== undefined && (
                          <input
                            className="vb-range"
                            type="range"
                            min="1"
                            max="6"
                            step="1"
                            value={box.perRow}
                            aria-label="Candidates per row"
                            onChange={(event) =>
                              editor.updateElement(selected.kind, null, {
                                perRow: Number(event.target.value),
                              })
                            }
                          />
                        )}
                      </PropertySection>
                    )}

                    {selected.kind === 'candidates' && (
                      <PropertySection {...sectionProps('Candidate cards')}>
                        {selected.kind === 'candidates' && (() => {
                          const look = normalizeCardSettings(box);
                          return (
                            <div className="form-group vb-card-look">
                              <label className="form-label">Candidate cards</label>
                              {CARD_LOOK_FIELDS.map(({ key, label, min, max, unit }) => (
                                <label key={key} className="vb-card-look-row">
                                  <span>{label}</span>
                                  <NumberField
                                    className="form-input"
                                    min={min}
                                    max={max}
                                    step="1"
                                    decimals={0}
                                    value={look[key]}
                                    onCommit={(next) =>
                                      editor.updateElement('candidates', null, {
                                        [key]: Math.min(max, Math.max(min, Math.round(next))),
                                      })
                                    }
                                  />
                                  <span className="vb-card-look-unit">{unit}</span>
                                </label>
                              ))}

                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => editor.updateElement('candidates', null, CARD_DEFAULTS)}
                              >
                                Reset card look
                              </button>
                            </div>
                          );
                        })()}
                      </PropertySection>
                    )}

                    <PropertySection {...sectionProps('Border & effects')}>
                      <OpacityField
                        element={box}
                        onChange={(opacity) => editor.updateElement(selected.kind, null, { opacity })}
                      />
                    </PropertySection>

                    <div className="vb-element-actions">
                      <button
                        type="button"
                        className="delete-button vb-remove-button"
                        onClick={removeSelection}
                        title="Remove (Delete)"
                      >
                        <Trash2 size={12} />
                        Remove from board
                      </button>
                    </div>
                  </>
                );
              })()
            ) : !selectedElement ? (
              <div className="vb-properties-empty">
                <LayoutTemplate size={22} />
                <p>That element is no longer on the board.</p>
              </div>
            ) : (
              <>
                <h3 className="vb-properties-title">
                  {propertiesTitle(selected.kind, selectedShape)}
                </h3>

                <label className="settings-option">
                  <span>
                    <strong>Visible on board</strong>
                  </span>
                  <input
                    type="checkbox"
                    checked={isVisible(selectedElement)}
                    onChange={() => editor.toggleVisible(selected.kind, selected.id)}
                  />
                </label>

                {selectedElement.groupId && (
                  <div className="vb-group-note">
                    <p>Grouped - dragging this moves the whole group together.</p>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => editor.ungroup(selectedElement.groupId)}
                    >
                      <Ungroup size={13} />
                      Ungroup
                    </button>
                  </div>
                )}

                {selected.kind === 'text' && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="vb-extra-text">
                      Text
                    </label>
                    <textarea
                      id="vb-extra-text"
                      className="form-input form-textarea"
                      rows={3}
                      value={selectedText.text}
                      onChange={(event) => editor.setTextContent(selected.id, event.target.value)}
                    />
                    <p className="vb-properties-hint">
                      Press Enter to start a new line on the board.
                    </p>

                    <label className="settings-option">
                      <span className="settings-option-label">
                        <List size={13} />
                        Bulleted list
                      </span>
                      <input
                        type="checkbox"
                        checked={selectedText.bulletList === true}
                        onChange={(event) =>
                          editor.updateElement('text', selected.id, {
                            bulletList: event.target.checked,
                          })
                        }
                      />
                    </label>

                    {selectedText.bulletList && (
                      <p className="vb-properties-hint">
                        Each line on its own becomes a bullet - put one item per line above.
                      </p>
                    )}
                  </div>
                )}

                {selected.kind === 'logo' && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="vb-logo-upload">
                      Image
                    </label>
                    <div className="photo-upload">
                      <label htmlFor="vb-logo-upload" className="photo-upload-box">
                        <input
                          id="vb-logo-upload"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => {
                            void editor.handleLogoUpload(event.target.files?.[0] ?? null);
                            event.target.value = '';
                          }}
                        />
                        <div className="photo-upload-content">
                          <span className="photo-upload-title">
                            {layout.logo.url ? 'Replace logo' : 'Upload a custom logo'}
                          </span>
                          <span className="photo-upload-subtitle">PNG, JPG or WEBP</span>
                        </div>
                      </label>

                      {layout.logo.url && (
                        <button type="button" className="secondary-button" onClick={editor.resetLogo}>
                          Use default
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {selected.kind === 'image' && (
                  <img src={selectedImage.url} alt="" className="vb-properties-thumb" />
                )}

                {selected.kind === 'video' && (
                  <video
                    src={selectedVideo.url}
                    className="vb-properties-thumb"
                    muted
                    loop
                    autoPlay
                    playsInline
                  />
                )}

                {selected.kind === 'shape' && (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="vb-shape-kind">
                        Shape
                      </label>
                      <select
                        id="vb-shape-kind"
                        className="form-select"
                        value={selectedShape.kind}
                        onChange={(event) =>
                          editor.updateShape(selected.id, { kind: event.target.value })
                        }
                      >
                        {SHAPE_KINDS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {isTextSelected && (
                  <PropertySection {...sectionProps('Font')}>
                    <div className="form-group">
                      <label className="form-label vb-sr-only" htmlFor="vb-font">
                        Font
                      </label>
                      <select
                        id="vb-font"
                        className="form-select"
                        value={selectedElement.style.fontFamily}
                        onChange={(event) =>
                          editor.setTextStyle(selected.kind, selected.id, {
                            fontFamily: event.target.value,
                          })
                        }
                      >
                        {FONT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value} style={{ fontFamily: option.stack }}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="vb-field-row">
                      <label htmlFor="vb-weight">
                        Weight
                        <select
                          id="vb-weight"
                          className="form-select"
                          value={selectedElement.style.weight}
                          onChange={(event) =>
                            editor.setTextStyle(selected.kind, selected.id, {
                              weight: Number(event.target.value),
                            })
                          }
                        >
                          {WEIGHT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label htmlFor="vb-case">
                        Case
                        <select
                          id="vb-case"
                          className="form-select"
                          value={selectedElement.style.textCase}
                          onChange={(event) =>
                            editor.setTextStyle(selected.kind, selected.id, {
                              textCase: event.target.value,
                            })
                          }
                        >
                          {CASE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {selected.kind === 'text' && (
                      <div className="form-group">
                        <label className="form-label" htmlFor="vb-text-size">
                          Size
                        </label>
                        {/*
                          The slider spans the whole range a text's size may
                          take, so every size a corner-drag can reach can also
                          be nudged here. The box beside it types an exact
                          value, since one slider covering that whole range
                          moves in fairly coarse steps.
                        */}
                        <div className="scale-field">
                          <input
                            type="range"
                            min={MIN_TEXT_SIZE}
                            max={MAX_TEXT_SIZE}
                            step="0.1"
                            value={selectedElement.fontSize}
                            aria-label="Size"
                            onChange={(event) =>
                              editor.setFontSize(selected.id, Number(event.target.value))
                            }
                          />
                          <NumberField
                            id="vb-text-size"
                            className="scale-field-input"
                            min={MIN_TEXT_SIZE}
                            max={MAX_TEXT_SIZE}
                            step="0.1"
                            value={selectedElement.fontSize}
                            onCommit={(next) => editor.setFontSize(selected.id, next)}
                          />
                        </div>
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label">Alignment</label>
                      <div className="vb-text-style-row">
                      <div className="vb-segment">
                        {ALIGN_OPTIONS.map((option) => {
                          const Icon = ALIGN_ICONS[option.value];
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={`vb-segment-button ${
                                selectedElement.style.align === option.value ? 'active' : ''
                              }`}
                              title={option.label}
                              aria-label={option.label}
                              onClick={() =>
                                editor.setTextStyle(selected.kind, selected.id, {
                                  align: option.value,
                                })
                              }
                            >
                              <Icon size={14} />
                            </button>
                          );
                        })}
                      </div>

                      <div className="vb-segment">
                        {[
                          { key: 'italic', label: 'Italic', Icon: Italic },
                          { key: 'underline', label: 'Underline', Icon: Underline },
                        ].map(({ key, label, Icon }) => (
                          <button
                            key={key}
                            type="button"
                            className={`vb-segment-button ${selectedElement.style[key] ? 'active' : ''}`}
                            title={label}
                            aria-label={label}
                            aria-pressed={selectedElement.style[key] === true}
                            onClick={() =>
                              editor.setTextStyle(selected.kind, selected.id, { [key]: !selectedElement.style[key] })
                            }
                          >
                            <Icon size={14} />
                          </button>
                        ))}
                      </div>
                      </div>
                    </div>
                  </PropertySection>
                )}

                {isTextSelected && (
                  <PropertySection {...sectionProps('Spacing')}>
                    <div className="form-group">
                      <label className="form-label">Letter spacing</label>
                      <div className="scale-field">
                        <input
                          type="range"
                          min="-0.05"
                          max="0.4"
                          step="0.005"
                          value={selectedElement.style.letterSpacing ?? 0}
                          onChange={(event) =>
                            editor.setTextStyle(selected.kind, selected.id, {
                              letterSpacing: Number(event.target.value),
                            })
                          }
                        />
                        <span className="scale-field-value">
                          {(selectedElement.style.letterSpacing ?? 0).toFixed(3)}em
                        </span>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Line height</label>
                      <div className="scale-field">
                        <input
                          type="range"
                          min="0.9"
                          max="2"
                          step="0.05"
                          value={selectedElement.style.lineHeight ?? 1.35}
                          onChange={(event) =>
                            editor.setTextStyle(selected.kind, selected.id, {
                              lineHeight: Number(event.target.value),
                            })
                          }
                        />
                        <span className="scale-field-value">
                          {(selectedElement.style.lineHeight ?? 1.35).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {selected.kind === 'text' && selectedElement && (
                      <div className="vb-field-row">
                        <label htmlFor="vb-text-box-width">
                          Box width %
                          <input
                            id="vb-text-box-width"
                            className="form-input"
                            type="number"
                            min="5"
                            max="100"
                            step="1"
                            value={Number((selectedElement.boxWidth ?? 92).toFixed(0))}
                            onChange={(event) =>
                              editor.updateElement('text', selected.id, {
                                boxWidth: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                    )}
                  </PropertySection>
                )}

                {(isTextSelected || selected.kind === 'shape') && (
                  <PropertySection {...sectionProps('Fill')}>
                    {(isTextSelected || selected.kind === 'shape') && (
                      <div className="form-group">
                        <FillEditor
                          fill={
                            selected.kind === 'shape'
                              ? selectedShape.fill
                              : selectedElement.style.fill
                          }
                          allowImage={selected.kind === 'shape'}
                          uploadId="vb-fill-photo"
                          onUploadImage={(file) => editor.handleFramePhoto(selected.id, file)}
                          allowVideo={selected.kind === 'shape'}
                          videoUploadId="vb-fill-video"
                          onUploadVideo={(file) => editor.handleFrameVideo(selected.id, file)}
                          onChange={(fill) => editor.setFill(selected.kind, selected.id, fill)}
                        />
                      </div>
                    )}

                    {selected.kind === 'shape' &&
                      (selectedShape.fill.type === 'image' || selectedShape.fill.type === 'video') &&
                      selectedShape.fill.url && (
                      <div className="form-group">
                        <div className="vb-photo-position-header">
                          <label className="form-label">
                            {selectedShape.fill.type === 'video' ? 'Video position' : 'Photo position'}
                          </label>
                          <button
                            type="button"
                            className="vb-photo-position-reset"
                            onClick={() =>
                              editor.adjustImageFill(selected.id, { offsetX: 0, offsetY: 0, zoom: 1 })
                            }
                          >
                            <RotateCcw size={11} />
                            Reset
                          </button>
                        </div>

                        <label className="form-label" htmlFor="vb-photo-zoom">
                          Zoom
                        </label>
                        <div className="scale-field">
                          <input
                            id="vb-photo-zoom"
                            type="range"
                            min="1"
                            max="4"
                            step="0.05"
                            value={selectedShape.fill.zoom}
                            onChange={(event) =>
                              editor.adjustImageFill(selected.id, { zoom: Number(event.target.value) })
                            }
                          />
                          <span className="scale-field-value">
                            {selectedShape.fill.zoom.toFixed(2)}x
                          </span>
                        </div>

                        <div className="vb-field-row">
                          <label htmlFor="vb-photo-x">
                            Move X
                            <input
                              id="vb-photo-x"
                              className="form-input"
                              type="range"
                              min="-50"
                              max="50"
                              step="1"
                              value={selectedShape.fill.offsetX}
                              onChange={(event) =>
                                editor.adjustImageFill(selected.id, {
                                  offsetX: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                          <label htmlFor="vb-photo-y">
                            Move Y
                            <input
                              id="vb-photo-y"
                              className="form-input"
                              type="range"
                              min="-50"
                              max="50"
                              step="1"
                              value={selectedShape.fill.offsetY}
                              onChange={(event) =>
                                editor.adjustImageFill(selected.id, {
                                  offsetY: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>
                    )}

                    {selected.kind === 'shape' && isFrame(selectedShape) && (
                      <div className="form-group">
                        <label className="form-label">Carousel photos</label>
                        <p className="vb-properties-hint">
                          Add two or more to unlock the Carousel animation below - it slides between
                          them instead of showing the single photo above. Click a photo to crop and
                          position it on its own.
                        </p>

                        <div className="vb-carousel-photos">
                          {selectedShape.photos.map((photo, index) => (
                            <div
                              key={index}
                              className={`vb-carousel-photo ${editingPhotoIndex === index ? 'active' : ''}`}
                            >
                              <button
                                type="button"
                                className="vb-carousel-photo-select"
                                aria-label={`Edit photo ${index + 1}`}
                                aria-pressed={editingPhotoIndex === index}
                                onClick={() =>
                                  setEditingPhotoIndex((current) => (current === index ? null : index))
                                }
                              >
                                <img src={photo.url} alt="" />
                              </button>
                              <button
                                type="button"
                                className="vb-carousel-photo-remove"
                                aria-label={`Remove photo ${index + 1}`}
                                onClick={() => {
                                  editor.removeFramePhoto(selected.id, index);
                                  setEditingPhotoIndex((current) =>
                                    current === null || current < index
                                      ? current
                                      : current === index
                                        ? null
                                        : current - 1
                                  );
                                }}
                              >
                                <X size={11} />
                              </button>
                            </div>
                          ))}

                          <label htmlFor="vb-carousel-photo-add" className="vb-carousel-photo-add">
                            <input
                              id="vb-carousel-photo-add"
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              multiple
                              onChange={(event) => {
                                void editor.addFramePhotos(selected.id, event.target.files);
                                event.target.value = '';
                              }}
                            />
                            <Plus size={16} />
                          </label>
                        </div>

                        {editingPhotoIndex !== null && selectedShape.photos[editingPhotoIndex] && (
                          <div className="vb-carousel-photo-editor">
                            <label className="form-label" htmlFor="vb-carousel-photo-zoom">
                              Zoom
                            </label>
                            <div className="scale-field">
                              <input
                                id="vb-carousel-photo-zoom"
                                type="range"
                                min="1"
                                max="4"
                                step="0.05"
                                value={selectedShape.photos[editingPhotoIndex].zoom}
                                onChange={(event) =>
                                  editor.adjustFramePhoto(selected.id, editingPhotoIndex, {
                                    zoom: Number(event.target.value),
                                  })
                                }
                              />
                              <span className="scale-field-value">
                                {selectedShape.photos[editingPhotoIndex].zoom.toFixed(2)}x
                              </span>
                            </div>

                            <div className="vb-field-row">
                              <label htmlFor="vb-carousel-photo-x">
                                Move X
                                <input
                                  id="vb-carousel-photo-x"
                                  className="form-input"
                                  type="range"
                                  min="-50"
                                  max="50"
                                  step="1"
                                  value={selectedShape.photos[editingPhotoIndex].offsetX}
                                  onChange={(event) =>
                                    editor.adjustFramePhoto(selected.id, editingPhotoIndex, {
                                      offsetX: Number(event.target.value),
                                    })
                                  }
                                />
                              </label>
                              <label htmlFor="vb-carousel-photo-y">
                                Move Y
                                <input
                                  id="vb-carousel-photo-y"
                                  className="form-input"
                                  type="range"
                                  min="-50"
                                  max="50"
                                  step="1"
                                  value={selectedShape.photos[editingPhotoIndex].offsetY}
                                  onChange={(event) =>
                                    editor.adjustFramePhoto(selected.id, editingPhotoIndex, {
                                      offsetY: Number(event.target.value),
                                    })
                                  }
                                />
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </PropertySection>
                )}

                <PropertySection {...sectionProps('Border & effects')}>
                  {isTextSelected && (
                    <>
                      <BorderControls
                        label="Outline"
                        showStyle={false}
                        max={8}
                        step={0.5}
                        stroke={{ width: 0, color: '#000000', ...selectedElement.style.outline }}
                        onChange={(patch) =>
                          editor.setTextStyle(selected.kind, selected.id, {
                            outline: { width: 0, color: '#000000', ...selectedElement.style.outline, ...patch },
                          })
                        }
                      />
                    </>
                  )}

                  {selected.kind === 'shape' && (
                    <>
                      {/* a zigzag's stroke is its drawn line, so it has no line style */}
                      <BorderControls
                        stroke={selectedShape.stroke}
                        label={isZigzag(selectedShape) ? 'Line' : 'Border'}
                        showStyle={!isZigzag(selectedShape)}
                        onChange={(patch) => editor.setStroke('shape', selected.id, patch)}
                      />
                    </>
                  )}

                  {(selected.kind === 'image' || selected.kind === 'video') && (
                    <BorderControls
                      stroke={selectedElement.stroke}
                      onChange={(patch) => editor.setStroke(selected.kind, selected.id, patch)}
                    />
                  )}

                  {isTextSelected && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="vb-shadow">
                        Shadow
                      </label>
                      <select
                        id="vb-shadow"
                        className="form-select"
                        value={selectedElement.style.shadow}
                        onChange={(event) =>
                          editor.setTextStyle(selected.kind, selected.id, {
                            shadow: event.target.value,
                          })
                        }
                      >
                        {SHADOW_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <OpacityField
                    element={selectedElement}
                    onChange={(opacity) => editor.updateElement(selected.kind, selected.id, { opacity })}
                  />
                </PropertySection>

                {['text', 'logo', 'image', 'shape'].includes(selected.kind) && (
                  <PropertySection {...sectionProps('Animation')}>
                    {(selected.kind === 'text' ||
                      selected.kind === 'logo' ||
                      selected.kind === 'image' ||
                      selected.kind === 'shape') && (
                      <div className="form-group">
                        <label className="form-label" htmlFor="vb-animation-type">
                          Animation
                        </label>
                        <div className="vb-field-row">
                          <select
                            id="vb-animation-type"
                            className="form-select"
                            value={selectedElement.animation.type}
                            onChange={(event) =>
                              editor.setAnimation(selected.kind, selected.id, { type: event.target.value })
                            }
                          >
                            {ANIMATION_TYPES.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                            {selected.kind === 'shape' &&
                              isFrame(selectedShape) &&
                              selectedShape.photos.length > 1 && (
                                <option value={CAROUSEL_ANIMATION.value}>{CAROUSEL_ANIMATION.label}</option>
                              )}
                          </select>

                          {(selectedElement.animation.type === 'slide' ||
                            selectedElement.animation.type === 'carousel') && (
                            <select
                              className="form-select"
                              aria-label="Animation direction"
                              value={selectedElement.animation.direction}
                              onChange={(event) =>
                                editor.setAnimation(selected.kind, selected.id, {
                                  direction: event.target.value,
                                })
                              }
                            >
                              {ANIMATION_DIRECTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {selectedElement.animation.type !== 'none' && (
                          <div className="scale-field">
                            <input
                              type="range"
                              min="1"
                              max="30"
                              step="1"
                              value={selectedElement.animation.speed}
                              aria-label={
                                selectedElement.animation.type === 'carousel'
                                  ? 'Seconds per photo'
                                  : 'Animation speed'
                              }
                              onChange={(event) =>
                                editor.setAnimation(selected.kind, selected.id, {
                                  speed: Number(event.target.value),
                                })
                              }
                            />
                            <span className="scale-field-value">{selectedElement.animation.speed}s</span>
                          </div>
                        )}
                      </div>
                    )}
                  </PropertySection>
                )}

                <PropertySection {...sectionProps('Position & size')}>
                  {selected.kind === 'shape' && (
                    <>
                      <div className="vb-field-row">
                        <label htmlFor="vb-width">
                          W %
                          <input
                            id="vb-width"
                            className="form-input"
                            type="number"
                            min="0.4"
                            max="200"
                            step="0.5"
                            value={Number(selectedShape.width.toFixed(1))}
                            onChange={(event) =>
                              editor.updateShape(selected.id, { width: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label htmlFor="vb-height">
                          H %
                          <input
                            id="vb-height"
                            className="form-input"
                            type="number"
                            min="0.4"
                            max="200"
                            step="0.5"
                            value={Number(selectedShape.height.toFixed(1))}
                            onChange={(event) =>
                              editor.updateShape(selected.id, { height: Number(event.target.value) })
                            }
                          />
                        </label>
                      </div>

                      <div className="vb-field-row">
                        <label htmlFor="vb-radius">
                          Corner
                          <input
                            id="vb-radius"
                            className="form-input"
                            type="number"
                            min="0"
                            max="999"
                            value={Math.round(selectedShape.radius)}
                            onChange={(event) =>
                              editor.updateShape(selected.id, { radius: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label htmlFor="vb-rotation">
                          Rotate
                          <input
                            id="vb-rotation"
                            className="form-input"
                            type="number"
                            min="-180"
                            max="180"
                            value={Math.round(selectedShape.rotation)}
                            onChange={(event) =>
                              editor.updateShape(selected.id, {
                                rotation: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                    </>
                  )}

                  {selected.kind === 'divider' && selectedElement && (
                    <>
                      <div className="vb-field-row">
                        <label htmlFor="vb-divider-dir">
                          Direction
                          <select
                            id="vb-divider-dir"
                            className="form-select"
                            value={selectedElement.orientation}
                            onChange={(event) =>
                              editor.updateDivider(selected.id, {
                                orientation: event.target.value,
                              })
                            }
                          >
                            <option value="vertical">Vertical</option>
                            <option value="horizontal">Horizontal</option>
                          </select>
                        </label>
                      </div>

                      <div className="vb-field-row">
                        <label htmlFor="vb-divider-len">
                          Length %
                          <input
                            id="vb-divider-len"
                            className="form-input"
                            type="number"
                            min="2"
                            max="100"
                            step="1"
                            value={Number(selectedElement.length.toFixed(1))}
                            onChange={(event) =>
                              editor.updateDivider(selected.id, {
                                length: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label htmlFor="vb-divider-thick">
                          Thickness
                          <input
                            id="vb-divider-thick"
                            className="form-input"
                            type="number"
                            min="1"
                            max="24"
                            step="1"
                            value={selectedElement.thickness}
                            onChange={(event) =>
                              editor.updateDivider(selected.id, {
                                thickness: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                    </>
                  )}

                  {(selected.kind === 'logo' || selected.kind === 'image' || selected.kind === 'video') && (
                    <div className="form-group">
                      <label className="form-label">Size</label>
                      <div className="scale-field">
                        <input
                          type="range"
                          min="0.3"
                          max="2.5"
                          step="0.05"
                          value={selectedElement.scale}
                          onChange={(event) =>
                            editor.setScale(selected.kind, selected.id, Number(event.target.value))
                          }
                        />
                        <span className="scale-field-value">
                          {Math.round(selectedElement.scale * 100)}%
                        </span>
                      </div>
                    </div>
                  )}

                  {selected.kind === 'text' && selected.id === 'heading' ? (
                    <p className="vb-properties-hint">
                      This is the board's headline, so it's fixed at the top of the candidate
                      column instead of being freely positioned.
                    </p>
                  ) : (
                    <div className="form-group">
                      <label className="form-label">Position</label>
                      <div className="vb-field-row">
                        <label htmlFor="vb-pos-x">
                          X
                          <input
                            id="vb-pos-x"
                            className="form-input"
                            type="number"
                            min="0"
                            max="100"
                            value={Math.round(selectedElement.x)}
                            onChange={(event) =>
                              editor.setPosition(
                                selected.kind,
                                selected.id,
                                Number(event.target.value),
                                selectedElement.y
                              )
                            }
                          />
                        </label>
                        <label htmlFor="vb-pos-y">
                          Y
                          <input
                            id="vb-pos-y"
                            className="form-input"
                            type="number"
                            min="0"
                            max="100"
                            value={Math.round(selectedElement.y)}
                            onChange={(event) =>
                              editor.setPosition(
                                selected.kind,
                                selected.id,
                                selectedElement.x,
                                Number(event.target.value)
                              )
                            }
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {['text', 'logo', 'image', 'video'].includes(selected.kind) && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="vb-element-rotation">
                        Rotate
                      </label>
                      <input
                        id="vb-element-rotation"
                        className="form-input"
                        type="number"
                        min="-180"
                        max="180"
                        value={Math.round(selectedElement.rotation ?? 0)}
                        onChange={(event) =>
                          editor.updateElement(selected.kind, selected.id, {
                            rotation: Math.max(-180, Math.min(180, Number(event.target.value) || 0)),
                          })
                        }
                      />
                    </div>
                  )}
                </PropertySection>

                <div className="vb-element-actions">
                  {(selected.kind === 'image' ||
                    selected.kind === 'video' ||
                    selected.kind === 'text' ||
                    selected.kind === 'shape' ||
                    selected.kind === 'divider') && (
                    <button
                      type="button"
                      className="secondary-button vb-duplicate-button"
                      onClick={duplicateSelection}
                      title="Duplicate (Ctrl+D)"
                    >
                      <Copy size={12} />
                      Duplicate
                    </button>
                  )}

                  <button
                    type="button"
                    className="delete-button vb-remove-button"
                    onClick={removeSelection}
                    title="Remove (Delete)"
                  >
                    <Trash2 size={12} />
                    Remove
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {templateModal === 'save' && (
        <div className="confirmation-overlay" role="presentation">
          <form
            className="candidate-edit-popup"
            onSubmit={handleSaveTemplate}
            aria-labelledby="vb-save-template-title"
          >
            <h2 id="vb-save-template-title">Save as Template</h2>

            <label className="form-label" htmlFor="vb-template-name">
              Template name
            </label>
            <input
              id="vb-template-name"
              className="form-input"
              required
              autoFocus
              placeholder="e.g. Holiday theme"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
            />

            <div className="confirmation-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setTemplateModal(null)}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button">
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {historyOpen && (
        <div className="confirmation-overlay" role="presentation">
          <div className="candidate-edit-popup vb-template-popup" role="dialog" aria-labelledby="vb-history-title">
            <div className="modal-heading-row">
              <div>
                <h2 id="vb-history-title">History</h2>
                <p className="modal-subtitle">
                  {history.length === 1 ? 'The last published version. Restore puts it' : 'Recent published versions. Restore puts one'}{' '}
                  into your draft.
                </p>
              </div>
              <button type="button" className="modal-close-button" onClick={() => setHistoryOpen(false)} aria-label="Close">
                &times;
              </button>
            </div>

            {history.length === 0 ? (
              <p className="vb-properties-hint">No published versions yet. Each Publish keeps a copy here.</p>
            ) : (
              <div className="vb-template-list">
                {history.map((entry, index) => (
                  <div key={entry.id} className="vb-template-row">
                    <TemplatePreview layout={historyLayout(entry)} />
                    <div className="vb-template-row-info">
                      <strong>{new Date(entry.publishedAt).toLocaleString()}</strong>
                      <span>{index === 0 ? 'Latest publish' : `${index} publish${index === 1 ? '' : 'es'} ago`}</span>
                    </div>
                    <div className="vb-template-row-actions">
                      <button type="button" className="secondary-button" onClick={() => restoreVersion(entry)}>
                        Restore
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {templateModal === 'apply' && (
        <div className="confirmation-overlay" role="presentation">
          <div
            className="candidate-edit-popup vb-template-popup"
            role="dialog"
            aria-labelledby="vb-apply-template-title"
          >
            <div className="modal-heading-row">
              <h2 id="vb-apply-template-title">Apply a Template</h2>
              <button
                type="button"
                className="modal-close-button"
                onClick={() => setTemplateModal(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {templates.length === 0 ? (
              <p className="vb-properties-hint">
                No templates saved yet - use Save Template on the toolbar first.
              </p>
            ) : (
              <div className="vb-template-list">
                {templates.map((template) => (
                  <div key={template.id} className="vb-template-row">
                    <TemplatePreview layout={template.layout} />
                    <div className="vb-template-row-info">
                      <strong>{template.name}</strong>
                      <span>{new Date(template.savedAt).toLocaleString()}</span>
                    </div>
                    <div className="vb-template-row-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handleApplyTemplate(template.id)}
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => handleDeleteTemplate(template.id)}
                        aria-label={`Delete ${template.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fullscreen shows only the fullscreen element, so the pointer overlays
          go inside it then; otherwise they stay here, under the theme. */}
      {overlayIn(
        <>
          {showFloatingBar && (
            <FloatingSelectionBar
              measureSelection={measureSelection}
              stageRef={stageRef}
              canvasRef={canvasRef}
              locked={selectionLocked}
              multi={multiSelected.length >= 2}
              canDuplicate={DELETABLE_KINDS.has(selected?.kind)}
              canDistribute={multiSelected.length >= 3}
              onAlign={alignSelection}
              onDistribute={distributeSelection}
              onDuplicate={duplicateSelection}
              onGroup={handleGroup}
              onToggleLock={() => editor.setLockedMany(selectionNow, !selectionLocked)}
              onMore={(x, y) => setContextMenu({ x, y, onElement: true })}
            />
          )}

          {editor.rotating && (
            <div className="vb-rotate-tooltip" style={{ left: editor.rotating.x + 14, top: editor.rotating.y + 14 }}>
              {Math.round(editor.rotating.rotation)}°
            </div>
          )}

          {contextMenu && (
            <CanvasContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              onElement={contextMenu.onElement}
              locked={selectionLocked}
              canPaste={clipboard.length > 0}
              canGroup={multiSelected.length >= 2}
              canUngroup={selectionNow.some(({ kind, id }) => findElement(layout, kind, id)?.groupId)}
              onAction={runMenuAction}
              onAlign={(edge) => {
                setContextMenu(null);
                alignSelection(edge);
              }}
            />
          )}
        </>
      )}
    </>
  );
}

/*
 * A miniature, non-interactive render of a saved template's layout, so
 * choosing one in "Apply a Template" doesn't mean guessing from its name and
 * timestamp alone. Every position and size on the board is already a
 * percentage (or a cqw/cqh unit sized against the board's own box), so the
 * same geometry that paints the real board paints this thumbnail correctly
 * just by giving it `container-type: size` and a 16:9 box of its own.
 */
function TemplatePreview({ layout }) {
  if (!layout) {
    return <div className="vb-template-preview vb-template-preview-empty" aria-hidden="true" />;
  }

  return (
    <div className="vb-template-preview" style={{ containerType: 'size' }} aria-hidden="true">
      {layout.dividers.filter(isVisible).map((divider) => {
        const vertical = divider.orientation !== 'horizontal';
        return (
          <span
            key={divider.id}
            className="vb-template-preview-divider"
            style={{
              left: `${divider.x}%`,
              top: `${divider.y}%`,
              width: vertical ? '1px' : `${divider.length}%`,
              height: vertical ? `${divider.length}%` : '1px',
            }}
          />
        );
      })}

      {layout.shapes.filter(isVisible).map((shape) => (
        <div key={shape.id} className="vb-template-preview-shape" style={resolveShapeStyle(shape)} />
      ))}

      {isVisible(layout.candidates) && (
        <div
          className="vb-template-preview-box"
          style={{
            left: `${layout.candidates.x}%`,
            top: `${layout.candidates.y}%`,
            width: `${layout.candidates.width}%`,
            height: `${layout.candidates.height}%`,
          }}
        />
      )}

      {isVisible(layout.announcements) && (
        <div
          className="vb-template-preview-box vb-template-preview-box-announcements"
          style={{
            left: `${layout.announcements.x}%`,
            top: `${layout.announcements.y}%`,
            width: `${layout.announcements.width}%`,
            height: `${layout.announcements.height}%`,
          }}
        />
      )}

      {layout.logo?.visible && layout.logo?.url && (
        <img
          className="vb-template-preview-logo"
          src={layout.logo.url}
          alt=""
          style={scaledPositionStyle(layout.logo, LOGO_BASE_WIDTH)}
        />
      )}

      {layout.texts.filter(isVisible).map((text) => (
        <div
          key={text.id}
          className="vb-template-preview-text"
          style={{ ...positionStyle(text), ...resolveTextStyle(text) }}
        >
          {text.text}
        </div>
      ))}
    </div>
  );
}
