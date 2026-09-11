import { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Box as BoxIcon,
  BoxSelect,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Circle,
  Crown,
  ExternalLink,
  Eye,
  EyeOff,
  Focus,
  FolderOpen,
  Frame,
  Grid3x3,
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
  Magnet,
  Maximize,
  Minimize,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Scan,
  Shapes,
  Square,
  Trash2,
  Triangle,
  Type,
  Undo2,
  Ungroup,
  UploadCloud,
  UsersRound,
  Zap,
  Video,
  X,
  ZoomIn,
} from 'lucide-react';

import {
  DEFAULT_LAYOUT,
  applyTemplate,
  deleteTemplate,
  isVisible,
  loadBoardLayout,
  loadDraftLayout,
  publishBoardLayout,
  saveTemplate,
  subscribeTemplates,
} from '../lib/boardLayout';
import { useBoardLayoutEditor, findElement } from '../lib/useBoardLayoutEditor';
import {
  ALIGN_OPTIONS,
  CASE_OPTIONS,
  FONT_OPTIONS,
  MAX_TEXT_SIZE,
  MIN_TEXT_SIZE,
  SHADOW_OPTIONS,
  WEIGHT_OPTIONS,
  resolveTextStyle,
} from '../lib/textStyle';
import { SHAPE_KINDS, isCarousel, isFrame, isZigzag, resolveShapeStyle, shapeLabel } from '../lib/shapeStyle';
import { LOGO_BASE_WIDTH, PHOTO_BASE_WIDTH, positionStyle, scaledPositionStyle } from '../lib/boardGeometry';
import { ANIMATION_DIRECTIONS, ANIMATION_TYPES, CAROUSEL_ANIMATION, resolveAnimationCss } from '../lib/animationStyle';
import FillEditor from '../components/FillEditor';
import PhotoCarousel from '../components/PhotoCarousel';
import PhotoAdjuster from '../components/PhotoAdjuster';
import VideoAdjuster from '../components/VideoAdjuster';
import TextContent from '../components/TextContent';
import NumberField from '../components/NumberField';
import CandidateBoard from '../components/CandidateBoard';
import AnnouncementBanner from '../components/AnnouncementBanner';
import ZigzagRule from '../components/ZigzagRule';
import { subscribeAnnouncements, subscribeCandidates } from '../lib/firebaseBackend';
import { isShownOnBoard } from '../lib/candidateVisibility';
import { isShownOnBoard as isAnnouncementShownOnBoard } from '../lib/announcementVisibility';
import {
  DEFAULT_ANNOUNCEMENT_STYLE,
  resolveAnnouncementStyle,
  subscribeAnnouncementStyle,
} from '../lib/announcementStyle';
import { useToast } from '../components/ToastProvider';

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
  { id: 'brand', label: 'Brand', icon: Crown },
  { id: 'uploads', label: 'Uploads', icon: UploadCloud },
  { id: 'layers', label: 'Layers', icon: Layers },
];

/* Which rail tab owns a given kind of element, so selecting one on the
   canvas brings its panel forward too. */
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

const PANEL_BY_KIND = {
  logo: 'brand',
  candidates: 'brand',
  text: 'text',
  image: 'uploads',
  video: 'uploads',
  shape: 'elements',
};

/* The canvas zoom slider's range, as a percentage of "fit" - 100% already
   fills the stage exactly (see .vb-canvas in globals.css), so anything
   above that needs the stage's own scrollbar to see the rest of it. */
const MIN_ZOOM = 25;
const MAX_ZOOM = 150;

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
    return `${shapeLabel(shape)} ${counts[shape.kind]}`;
  });
}

export default function AdminVisualBoard() {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [selected, setSelected] = useState(null); // { kind, id? } | null
  const [multiSelected, setMultiSelected] = useState([]); // [{ kind, id }] - shift-click grouping
  const [activePanel, setActivePanel] = useState('elements');
  /* Which of the selected frame's carousel photos the Zoom/Move sliders
     below the grid are currently editing - reset whenever the selection
     changes so a stale index from a different frame can't linger. */
  const [editingPhotoIndex, setEditingPhotoIndex] = useState(null);
  const [candidates, setCandidates] = useState([]);
  /* What the live announcement strip is currently showing, so the canvas
     can show the same - and can tell when the live board would hide it. */
  const [announcements, setAnnouncements] = useState([]);
  const [announcementStyle, setAnnouncementStyle] = useState(DEFAULT_ANNOUNCEMENT_STYLE);

  /* { kind, id, x, y } while the right-click order menu is open */
  const [orderMenu, setOrderMenu] = useState(null);

  /* The element Ctrl+C remembered, for Ctrl+V to copy. */
  const [clipboard, setClipboard] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  // Publishing writes the whole layout document (photos and all) to
  // Firestore, which can take a good while for a board with a lot of
  // content - without this, the button gives no sign it's doing anything
  // and clicking it looks like it silently failed.
  const [publishing, setPublishing] = useState(false);

  // A percentage of "fit" (see MIN_ZOOM/MAX_ZOOM) - 100 exactly fills the stage.
  const [zoom, setZoom] = useState(100);
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  // Dragging on empty canvas draws a marquee instead of just deselecting.
  const [boxSelectMode, setBoxSelectMode] = useState(false);
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
    multiSelected,
  });

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

    editor.cleanUpLegacyPhotos().then((didMigrate) => {
      if (didMigrate) {
        showToast.success('Cleaned up some old photos to speed up publishing.');
      }
    });
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

  /* The same filter and order the live board applies, so the canvas
     shows the same cards in the same places. */
  useEffect(() => {
    return subscribeCandidates((rows) => {
      setCandidates(
        rows
          .filter((candidate) => isShownOnBoard(candidate))
          .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
      );
    });
  }, []);

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

  /* Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y to redo - but not
     while the user is typing in a field. */
  useEffect(() => {
    function handleKeydown(event) {
      const isEditing = event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]');
      if (isEditing) return;

      const isMeta = event.ctrlKey || event.metaKey;

      /* Delete needs no modifier - it is the obvious key for it. */
      if (!isMeta && (event.key === 'Delete' || event.key === 'Backspace')) {
        if (!selected) return;
        event.preventDefault();
        removeSelected();
        return;
      }

      if (!isMeta) return;

      const key = event.key.toLowerCase();

      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        editor.redo();
      } else if (key === 'z') {
        event.preventDefault();
        editor.undo();
      } else if (key === 'y') {
        event.preventDefault();
        editor.redo();
      } else if (key === 'c') {
        /* Copy remembers the selection; paste puts a copy of it down. */
        if (!selected) return;
        event.preventDefault();
        setClipboard(selected);
      } else if (key === 'v') {
        if (!clipboard) return;
        event.preventDefault();
        const copyId = editor.duplicateElement(clipboard.kind, clipboard.id);
        if (copyId) setSelected({ kind: clipboard.kind, id: copyId });
        else showToast(`There can only be one ${describe(clipboard).toLowerCase()}.`);
      } else if (key === 'd') {
        if (!selected) return;
        event.preventDefault();
        duplicateSelected();
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [editor, selected, clipboard, layout]);

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
    setSelected({ kind, id });
    setMultiSelected([]);
    setEditingPhotoIndex(null);
    if (PANEL_BY_KIND[kind]) setActivePanel(PANEL_BY_KIND[kind]);
  }

  function isSelected(kind, id) {
    if (!selected || selected.kind !== kind) return false;
    return id === undefined || selected.id === id;
  }

  function isMultiSelected(kind, id) {
    return multiSelected.some((item) => item.kind === kind && item.id === id);
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
  function handlePointerDown(kind, id) {
    return (event) => {
      if (boxSelectMode) {
        startBoxSelect(event);
        return;
      }

      if (event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        setMultiSelected((current) => {
          const base = current.length > 0 ? current : selected ? [selected] : [];
          const exists = base.some((item) => item.kind === kind && item.id === id);
          return exists
            ? base.filter((item) => !(item.kind === kind && item.id === id))
            : [...base, { kind, id }];
        });
        setSelected(null);
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
        (item) => item.kind === kind && item.id === id
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
    if (!orderMenu) return;

    const close = () => setOrderMenu(null);
    const onKey = (event) => {
      if (event.key === 'Escape') close();
    };

    // capture, so the menu closes even if the target stops propagation
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [orderMenu]);

  /*
   * Arrow keys nudge whatever is selected. This is what makes an element
   * that something larger is sitting on top of still movable: pick it in
   * the layers panel, then walk it out from under the thing covering it.
   * Shift takes bigger steps.
   */
  useEffect(() => {
    if (!selected) return;

    function onKeyDown(event) {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
        event.key
      ];
      if (!step) return;

      // never steal the arrows from a field being typed in
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) {
        return;
      }

      const element = findElement(layout, selected.kind, selected.id);
      if (!element || element.locked) return;

      event.preventDefault();

      const distance = event.shiftKey ? 5 : 0.5;
      editor.setPosition(
        selected.kind,
        selected.id,
        element.x + step[0] * distance,
        element.y + step[1] * distance
      );
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, layout, editor]);

  function handleContextMenu(kind, id) {
    return (event) => {
      event.preventDefault();
      event.stopPropagation();

      select(kind, id);
      setMultiSelected([]);
      setOrderMenu({ kind, id, x: event.clientX, y: event.clientY });
    };
  }

  function orderAndClose(direction) {
    if (!orderMenu) return;
    editor.moveLayer(orderMenu.kind, orderMenu.id, direction);
    setOrderMenu(null);
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

  /* Deselects first if the removed element was the one being edited. */
  function deselectIfSelected(kind, id) {
    setSelected((current) => (current?.kind === kind && current.id === id ? null : current));
  }

  async function publish() {
    setPublishing(true);

    try {
      await publishBoardLayout(layout);
      setPublishedSnapshot(JSON.stringify(layout));
      setIsDirty(false);
      showToast.success('Published to the live board.');
    } catch (error) {
      console.warn('Could not publish the board layout:', error);
      showToast.error('Could not publish - the board may be too large (try a smaller photo).');
    } finally {
      setPublishing(false);
    }
  }

  async function addPhotoAndSelect(file) {
    const id = await editor.handleAddPhoto(file);
    if (id) select('image', id);
  }

  async function addVideoAndSelect(file) {
    const id = await editor.handleAddVideo(file);
    if (id) select('video', id);
  }

  function addTextAndSelect() {
    select('text', editor.addText());
  }

  function addDividerAndSelect(orientation) {
    select('divider', editor.addDivider(orientation));
  }

  function addShapeAndSelect(kind) {
    select('shape', editor.addShape(kind));
  }

  function removePhoto(id) {
    editor.removePhoto(id);
    deselectIfSelected('image', id);
  }

  function removeVideo(id) {
    editor.removeVideo(id);
    deselectIfSelected('video', id);
  }

  function removeText(id) {
    editor.removeText(id);
    deselectIfSelected('text', id);
  }

  function removeShape(id) {
    editor.removeShape(id);
    deselectIfSelected('shape', id);
  }

  function removeSelected() {
    if (!selected) return;

    const element = findElement(layout, selected.kind, selected.id);
    if (element?.locked) {
      showToast('That element is locked.');
      return;
    }

    const outcome = editor.removeElement(selected.kind, selected.id);

    if (outcome === 'hidden') {
      showToast(`${describe(selected)} hidden - turn it back on from Layers.`);
    }

    setSelected(null);
    setMultiSelected([]);
  }

  /* Copies the selected element, and selects the copy. */
  function duplicateSelected() {
    if (!selected) return;

    const copyId = editor.duplicateElement(selected.kind, selected.id);

    if (!copyId) {
      showToast(`There can only be one ${describe(selected).toLowerCase()}.`);
      return;
    }

    setSelected({ kind: selected.kind, id: copyId });
    setMultiSelected([]);
  }

  /* A readable name for a selection, for messages. */
  function describe(target) {
    if (BOX_KINDS[target.kind]) return BOX_KINDS[target.kind].label;
    if (target.kind === 'logo') return 'Logo';
    return target.kind.charAt(0).toUpperCase() + target.kind.slice(1);
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
        (item) => item.kind === kind && item.id === id
      );
      if (!isPartOfMultiSelection) select(kind, id);
      editor.beginDrag(kind, id)(event);
    };
  }

  /* The layers panel's label, icon, and underlying data object for one
     layerOrder entry - null if it names something that no longer exists. */
  function layerInfo(entry) {
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
      return { label: `Text ${index + 1}`, Icon: Type, element: layout.texts[index] };
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
          <span className="vb-divider-line" aria-hidden="true" />

          {selectedOnCanvas && (
            <span
              className="vb-shape-resize"
              title="Drag to set its length"
              onPointerDown={editor.beginDividerResize(divider.id)}
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
          {/* the live board's own candidate cards, so the box shows what it will hold */}
          <CandidateBoard
            candidates={candidates}
            perRow={box.perRow ?? 2}
            secondsPerCard={box.secondsPerCard ?? 4}
          />

          {selectedOnCanvas && (
            <span
              className="vb-shape-resize"
              title="Drag to resize"
              onPointerDown={editor.beginResizeBox('candidates')}
            />
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
          <AnnouncementBanner
            message={liveAnnouncement ? liveAnnouncement.message : 'Announcements'}
            style={resolveAnnouncementStyle(announcementStyle)}
            showIcon={announcementStyle.showIcon}
            icon={announcementStyle.icon}
            background={announcementStyle.background}
          />

          {selectedOnCanvas && (
            <span
              className="vb-shape-resize"
              title="Drag to resize"
              onPointerDown={editor.beginResizeBox('announcements')}
            />
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
          <img src={layout.logo.url || '/visual/logo.png'} alt="" className="vb-logo-img" />

          {isSelected('logo') && (
            <span
              className="vb-shape-resize"
              title="Drag to resize"
              onPointerDown={editor.beginScaleResize('logo', null, LOGO_BASE_WIDTH)}
            />
          )}
        </button>
      );
    }

    if (entry.kind === 'text') {
      const text = layout.texts.find((item) => item.id === entry.id);
      if (!text || !isVisible(text)) return null;

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
        >
          <span style={resolveTextStyle(text)}>
            <TextContent text={text} />
          </span>

          {isSelected('text', text.id) && (
            <span
              className="vb-shape-resize"
              title="Drag to resize"
              onPointerDown={editor.beginFontResize(text.id)}
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
          <img src={image.url} alt="" className="vb-photo-img" />

          {isSelected('image', image.id) && (
            <span
              className="vb-shape-resize"
              title="Drag to resize"
              onPointerDown={editor.beginScaleResize('image', image.id, PHOTO_BASE_WIDTH)}
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
          style={scaledPositionStyle(video, PHOTO_BASE_WIDTH)}
          data-vb-kind="video"
          data-vb-id={video.id}
          onPointerDown={handlePointerDown('video', video.id)}
          onContextMenu={handleContextMenu('video', video.id)}
        >
          <video src={video.url} className="vb-photo-img" muted loop autoPlay playsInline />

          {isSelected('video', video.id) && (
            <span
              className="vb-shape-resize"
              title="Drag to resize"
              onPointerDown={editor.beginScaleResize('video', video.id, PHOTO_BASE_WIDTH)}
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

      return (
        <div
          key={shape.id}
          className={`vb-shape ${selectedOnCanvas ? 'selected' : ''} ${
            isEmptyFrame ? 'is-empty-frame' : ''
          } ${isMultiSelected('shape', shape.id) ? 'multi-selected' : ''}`}
          style={resolveShapeStyle(shape)}
          data-vb-kind="shape"
          data-vb-id={shape.id}
          onPointerDown={handlePointerDown('shape', shape.id)}
          onContextMenu={handleContextMenu('shape', shape.id)}
        >
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

          {selectedOnCanvas && (
            <span
              className="vb-shape-resize"
              title="Drag to resize"
              onPointerDown={editor.beginResize(shape.id)}
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

  return (
    <>
      <header className="dashboard-header">
        <div>
        
        </div>
      </header>

      <section className="panel table-panel">
        <div className="panel-header">
          <div className="panel-title-area">
            <div className="panel-title-icon">
              <LayoutTemplate size={12} strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="panel-title">Visual Board</h2>
              <p className={`panel-subtitle ${isDirty ? 'vb-unpublished' : ''}`}>
                {isDirty ? 'Unpublished changes' : 'Up to date with the live board'}
              </p>
            </div>
          </div>

          <div className="panel-actions">
            <button type="button" className="secondary-button" onClick={editor.resetLayout}>
              <RotateCcw size={12} />
              Reset
            </button>
            <a
              href="/admin/visual-board/preview"
              target="_blank"
              rel="noopener noreferrer"
              className="secondary-button"
              title="See your unpublished changes as they'll look once Published"
            >
              Preview
              <ExternalLink size={11} />
            </a>
            <button
              type="button"
              className="primary-button"
              onClick={publish}
              disabled={!isDirty || publishing}
            >
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </div>

        {/* ================= TOOLBAR ================= */}

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
          </div>

          <span className="vb-toolbar-divider" aria-hidden="true" />

          <button
            type="button"
            className={`vb-toolbar-button ${zoom === 100 ? 'active' : ''}`}
            onClick={() => setZoom(100)}
            title="Reset zoom to fit the stage"
          >
            <Scan size={15} />
            <span>Fit</span>
          </button>

          <label className="vb-toolbar-zoom" title="Canvas size">
            <ZoomIn size={14} />
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step="5"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              aria-label="Canvas size"
            />
            <span className="vb-toolbar-zoom-value">{zoom}%</span>
          </label>

          <span className="vb-toolbar-divider" aria-hidden="true" />

          <div className="vb-toolbar-group">
            <button
              type="button"
              className={`vb-toolbar-button ${showGrid ? 'active' : ''}`}
              onClick={() => setShowGrid((current) => !current)}
              aria-pressed={showGrid}
              title="Toggle grid"
            >
              <Grid3x3 size={15} />
              <span>Grid</span>
            </button>
            <button
              type="button"
              className={`vb-toolbar-button ${snapEnabled ? 'active' : ''}`}
              onClick={() => setSnapEnabled((current) => !current)}
              aria-pressed={snapEnabled}
              title="Snap to center, edges, grid, and other elements"
            >
              <Magnet size={15} />
              <span>Snap</span>
            </button>
            <button
              type="button"
              className={`vb-toolbar-button ${boxSelectMode ? 'active' : ''}`}
              onClick={() => setBoxSelectMode((current) => !current)}
              aria-pressed={boxSelectMode}
              title="Box select - drag a rectangle across the canvas to select everything it touches"
            >
              <BoxSelect size={15} />
              <span>Box Select</span>
            </button>
          </div>

          <span className="vb-toolbar-spacer" />

          <button
            type="button"
            className="vb-toolbar-button"
            onClick={() => setTemplateModal('save')}
            title="Save the current board as a template"
          >
            <Save size={15} />
            <span>Save Template</span>
          </button>
          <button
            type="button"
            className="vb-toolbar-button"
            onClick={() => setTemplateModal('apply')}
            title="Apply a saved template"
          >
            <FolderOpen size={15} />
            <span>Apply</span>
          </button>

          <span className="vb-toolbar-divider" aria-hidden="true" />

          <button
            type="button"
            className="vb-toolbar-button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
            <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
          </button>
          <button
            type="button"
            className={`vb-toolbar-button ${focusMode ? 'active' : ''}`}
            onClick={toggleFocusMode}
            title="Fullscreen with every editing control hidden - just the board"
          >
            <Focus size={15} />
            <span>Focus</span>
          </button>
        </div>

        <div className={`vb-layout ${focusMode ? 'vb-focus-mode' : ''}`} ref={layoutRef}>
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
                    onClick={() => setActivePanel(tab.id)}
                  >
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="vb-panel">
              {activePanel === 'elements' && (
                <>
                  <p className="vb-panel-label">Add a divider</p>
                  <div className="vb-shape-grid">
                    <button
                      type="button"
                      className="vb-shape-grid-button"
                      onClick={() => addDividerAndSelect('vertical')}
                    >
                      <SeparatorVertical size={16} />
                      <span>Vertical</span>
                    </button>
                    <button
                      type="button"
                      className="vb-shape-grid-button"
                      onClick={() => addDividerAndSelect('horizontal')}
                    >
                      <SeparatorHorizontal size={16} />
                      <span>Horizontal</span>
                    </button>
                  </div>

                  <p className="vb-panel-label">Add a shape</p>
                  <div className="vb-shape-grid">
                    {SHAPE_KINDS.map((option) => {
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

                  {layout.shapes.length > 0 && (
                    <>
                      <p className="vb-panel-label">On the board</p>
                      {layout.shapes.map((shape, index) => {
                        const Icon = SHAPE_ICONS[shape.kind] ?? Square;

                        return (
                          <div
                            key={shape.id}
                            className={`vb-element-row-wrap ${isSelected('shape', shape.id) ? 'active' : ''}`}
                          >
                            <button
                              type="button"
                              className={`vb-element-row ${isVisible(shape) ? '' : 'is-hidden'}`}
                              onClick={() => select('shape', shape.id)}
                            >
                              <Icon size={14} />
                              {shapeLabels[index]}
                            </button>
                            <button
                              type="button"
                              className="vb-layer-icon-button"
                              onClick={() => editor.setLocked('shape', shape.id, !shape.locked)}
                              aria-label={`${shape.locked ? 'Unlock' : 'Lock'} ${shapeLabels[index]}`}
                            >
                              {shape.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                            </button>
                            <button
                              type="button"
                              className="vb-element-remove"
                              onClick={() => removeShape(shape.id)}
                              aria-label={`Remove ${shapeLabels[index]}`}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
              )}

              {activePanel === 'text' && (
                <>
                  <button type="button" className="vb-panel-add" onClick={addTextAndSelect}>
                    <Plus size={14} />
                    Add Text
                  </button>

                  {layout.texts.length > 0 && (
                    <>
                      <p className="vb-panel-label">On the board</p>
                      {layout.texts.map((text, index) => (
                        <div
                          key={text.id}
                          className={`vb-element-row-wrap ${isSelected('text', text.id) ? 'active' : ''}`}
                        >
                          <button
                            type="button"
                            className={`vb-element-row ${isVisible(text) ? '' : 'is-hidden'}`}
                            onClick={() => select('text', text.id)}
                          >
                            <Type size={14} />
                            Text {index + 1}
                          </button>
                          <button
                            type="button"
                            className="vb-layer-icon-button"
                            onClick={() => editor.setLocked('text', text.id, !text.locked)}
                            aria-label={`${text.locked ? 'Unlock' : 'Lock'} Text ${index + 1}`}
                          >
                            {text.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                          </button>
                          <button
                            type="button"
                            className="vb-element-remove"
                            onClick={() => removeText(text.id)}
                            aria-label={`Remove Text ${index + 1}`}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}

              {activePanel === 'brand' && (
                <>
                  <p className="vb-panel-label">Board identity</p>

                  <div className={`vb-element-row-wrap ${isSelected('logo') ? 'active' : ''}`}>
                    <button
                      type="button"
                      className={`vb-element-row ${isVisible(layout.logo) ? '' : 'is-hidden'}`}
                      onClick={() => select('logo')}
                    >
                      <ImageIcon size={14} />
                      Logo
                    </button>
                    <button
                      type="button"
                      className="vb-layer-icon-button"
                      onClick={() => editor.setLocked('logo', null, !layout.logo.locked)}
                      aria-label={`${layout.logo.locked ? 'Unlock' : 'Lock'} Logo`}
                    >
                      {layout.logo.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                    </button>
                  </div>

                  <div className={`vb-element-row-wrap ${isSelected('candidates') ? 'active' : ''}`}>
                    <button
                      type="button"
                      className="vb-element-row"
                      onClick={() => select('candidates')}
                    >
                      <UsersRound size={14} />
                      Candidate Board
                    </button>
                    <button
                      type="button"
                      className="vb-layer-icon-button"
                      onClick={() => editor.setLocked('candidates', null, !layout.candidates.locked)}
                      aria-label={`${layout.candidates.locked ? 'Unlock' : 'Lock'} Candidate Board`}
                    >
                      {layout.candidates.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                    </button>
                  </div>
                </>
              )}

              {activePanel === 'uploads' && (
                <>
                  <label htmlFor="vb-add-photo" className="vb-panel-add">
                    <Plus size={14} />
                    Add Photo
                  </label>
                  <input
                    id="vb-add-photo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      void addPhotoAndSelect(event.target.files?.[0] ?? null);
                      event.target.value = '';
                    }}
                  />

                  {layout.images.length > 0 && (
                    <>
                      <p className="vb-panel-label">Uploaded photos</p>
                      {layout.images.map((image, index) => (
                        <div
                          key={image.id}
                          className={`vb-element-row-wrap ${isSelected('image', image.id) ? 'active' : ''}`}
                        >
                          <button
                            type="button"
                            className={`vb-element-row ${isVisible(image) ? '' : 'is-hidden'}`}
                            onClick={() => select('image', image.id)}
                          >
                            <ImagePlus size={14} />
                            Photo {index + 1}
                          </button>
                          <button
                            type="button"
                            className="vb-layer-icon-button"
                            onClick={() => editor.setLocked('image', image.id, !image.locked)}
                            aria-label={`${image.locked ? 'Unlock' : 'Lock'} Photo ${index + 1}`}
                          >
                            {image.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                          </button>
                          <button
                            type="button"
                            className="vb-element-remove"
                            onClick={() => removePhoto(image.id)}
                            aria-label={`Remove Photo ${index + 1}`}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </>
                  )}

                  <label htmlFor="vb-add-video" className="vb-panel-add">
                    <Plus size={14} />
                    Add Video
                  </label>
                  <input
                    id="vb-add-video"
                    type="file"
                    accept="video/mp4,video/webm,video/ogg"
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      void addVideoAndSelect(event.target.files?.[0] ?? null);
                      event.target.value = '';
                    }}
                  />

                  {layout.videos.length > 0 && (
                    <>
                      <p className="vb-panel-label">Uploaded videos</p>
                      {layout.videos.map((video, index) => (
                        <div
                          key={video.id}
                          className={`vb-element-row-wrap ${isSelected('video', video.id) ? 'active' : ''}`}
                        >
                          <button
                            type="button"
                            className={`vb-element-row ${isVisible(video) ? '' : 'is-hidden'}`}
                            onClick={() => select('video', video.id)}
                          >
                            <Video size={14} />
                            Video {index + 1}
                          </button>
                          <button
                            type="button"
                            className="vb-layer-icon-button"
                            onClick={() => editor.setLocked('video', video.id, !video.locked)}
                            aria-label={`${video.locked ? 'Unlock' : 'Lock'} Video ${index + 1}`}
                          >
                            {video.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                          </button>
                          <button
                            type="button"
                            className="vb-element-remove"
                            onClick={() => removeVideo(video.id)}
                            aria-label={`Remove Video ${index + 1}`}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}

              {activePanel === 'layers' && (
                <>
                  <p className="vb-panel-label">Front to back</p>
                  {[...layout.layerOrder].reverse().map((entry, displayIndex, list) => {
                    const info = layerInfo(entry);
                    if (!info) return null;

                    const key = `${entry.kind}:${entry.id ?? ''}`;
                    const canLockOrHide = true;
                    const visible = info.element ? isVisible(info.element) : true;
                    const locked = info.element?.locked ?? false;
                    const Icon = info.Icon;

                    return (
                      <div
                        key={key}
                        className={`vb-layer-row ${isSelected(entry.kind, entry.id) ? 'active' : ''}`}
                      >
                        <button
                          type="button"
                          className="vb-layer-icon-button"
                          disabled={!canLockOrHide}
                          onClick={() => editor.toggleVisible(entry.kind, entry.id)}
                          aria-label={visible ? `Hide ${info.label}` : `Show ${info.label}`}
                        >
                          {visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>

                        <button
                          type="button"
                          className="vb-layer-icon-button"
                          disabled={!canLockOrHide}
                          onClick={() => editor.setLocked(entry.kind, entry.id, !locked)}
                          aria-label={locked ? `Unlock ${info.label}` : `Lock ${info.label}`}
                        >
                          {locked ? <Lock size={13} /> : <LockOpen size={13} />}
                        </button>

                        <button
                          type="button"
                          className="vb-layer-name"
                          onClick={() => select(entry.kind, entry.id)}
                        >
                          <Icon size={13} />
                          <span>{info.label}</span>
                        </button>

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
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {/* ================= CANVAS ================= */}

          <div className="vb-canvas-col">
            <div className="vb-canvas-stage" ref={stageRef}>
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

                  {editor.centerGuide.x && <div className="vb-guide vb-guide-vertical" aria-hidden="true" />}
                  {editor.centerGuide.y && <div className="vb-guide vb-guide-horizontal" aria-hidden="true" />}

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

            <p className="vb-canvas-hint">
              Click an element to select it, drag to move it, and drag a selected shape's corner
              to resize it. Changes save to your draft as you go - click Publish to put them on
              the live board.
            </p>
          </div>

          {/* ================= PROPERTIES ================= */}

          <div className="vb-properties">
            {multiSelected.length >= 2 ? (
              <>
                <h3 className="vb-properties-title">{multiSelected.length} Elements Selected</h3>
                <p className="vb-properties-hint">
                  Group them so dragging any one moves the rest together.
                </p>
                <button type="button" className="primary-button vb-group-button" onClick={handleGroup}>
                  <Group size={13} />
                  Group Selected
                </button>
              </>
            ) : !selected ? (
              <div className="vb-properties-empty">
                <LayoutTemplate size={22} />
                <p>
                  Select an element on the canvas or from the list on the left. Shift-click to
                  select more than one and group them.
                </p>
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

                    <div className="vb-element-actions">
                      <button
                        type="button"
                        className="delete-button vb-remove-button"
                        onClick={removeSelected}
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
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="vb-font">
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

                    <div className="form-group">
                      <label className="form-label">Alignment</label>
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
                    </div>
                  </>
                )}

                {(isTextSelected || selected.kind === 'shape') && (
                  <div className="form-group">
                    <label className="form-label">Fill</label>
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

                    <div className="form-group">
                      <label className="form-label">Border</label>
                      <div className="vb-stroke-field">
                        <input
                          type="color"
                          className="vb-color-input"
                          value={selectedShape.stroke.color}
                          aria-label="Border colour"
                          onChange={(event) =>
                            editor.setShapeStroke(selected.id, { color: event.target.value })
                          }
                        />
                        <input
                          type="range"
                          min="0"
                          max="16"
                          step="1"
                          value={selectedShape.stroke.width}
                          aria-label="Border width"
                          onChange={(event) =>
                            editor.setShapeStroke(selected.id, {
                              width: Number(event.target.value),
                            })
                          }
                        />
                        <span className="scale-field-value">{selectedShape.stroke.width}px</span>
                      </div>
                    </div>
                  </>
                )}

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

                <div className="vb-element-actions">
                  {(selected.kind === 'image' ||
                    selected.kind === 'video' ||
                    selected.kind === 'text' ||
                    selected.kind === 'shape' ||
                    selected.kind === 'divider') && (
                    <button
                      type="button"
                      className="secondary-button vb-duplicate-button"
                      onClick={duplicateSelected}
                      title="Duplicate (Ctrl+D)"
                    >
                      <Copy size={12} />
                      Duplicate
                    </button>
                  )}

                  <button
                    type="button"
                    className="delete-button vb-remove-button"
                    onClick={removeSelected}
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

      {orderMenu && (
        <div
          className="vb-order-menu"
          style={{ left: orderMenu.x, top: orderMenu.y }}
          /* the dismiss listener runs in capture, so keep it off this menu */
          onPointerDown={(event) => event.stopPropagation()}
          role="menu"
        >
          <button type="button" role="menuitem" onClick={() => orderAndClose('front')}>
            <ChevronsUp size={13} />
            <span>Bring to front</span>
          </button>
          <button type="button" role="menuitem" onClick={() => orderAndClose('up')}>
            <ChevronUp size={13} />
            <span>Bring forward</span>
          </button>
          <button type="button" role="menuitem" onClick={() => orderAndClose('down')}>
            <ChevronDown size={13} />
            <span>Send backward</span>
          </button>
          <button type="button" role="menuitem" onClick={() => orderAndClose('back')}>
            <ChevronsDown size={13} />
            <span>Send to back</span>
          </button>
        </div>
      )}
    </>
  );
}
