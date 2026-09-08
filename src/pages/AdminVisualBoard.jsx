import { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Circle,
  Crown,
  ExternalLink,
  Eye,
  EyeOff,
  FolderOpen,
  Frame,
  Grid3x3,
  Group,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  LayoutTemplate,
  Megaphone,
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
  Shapes,
  Square,
  Trash2,
  Triangle,
  Type,
  Undo2,
  Ungroup,
  UploadCloud,
  UsersRound,
  X,
} from 'lucide-react';

import {
  applyTemplate,
  deleteTemplate,
  isVisible,
  loadBoardLayout,
  loadDraftLayout,
  loadTemplates,
  publishBoardLayout,
  saveTemplate,
} from '../lib/boardLayout';
import { useBoardLayoutEditor } from '../lib/useBoardLayoutEditor';
import {
  ALIGN_OPTIONS,
  CASE_OPTIONS,
  FONT_OPTIONS,
  SHADOW_OPTIONS,
  WEIGHT_OPTIONS,
  resolveTextStyle,
} from '../lib/textStyle';
import { SHAPE_KINDS, resolveShapeStyle, shapeLabel } from '../lib/shapeStyle';
import { LOGO_BASE_WIDTH, PHOTO_BASE_WIDTH, positionStyle, scaledPositionStyle } from '../lib/boardGeometry';
import FillEditor from '../components/FillEditor';
import { subscribeCandidates } from '../lib/localBackend';
import { isShownOnBoard } from '../lib/candidateVisibility';
import { useToast } from '../components/ToastProvider';

const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight };

const SHAPE_ICONS = {
  rectangle: Square,
  ellipse: Circle,
  triangle: Triangle,
  line: Minus,
  frame: Frame,
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
const PANEL_BY_KIND = {
  logo: 'brand',
  candidates: 'brand',
  text: 'text',
  image: 'uploads',
  shape: 'elements',
};

/* The zoom toolbar's fixed presets; 'fit' is computed instead of literal. */
const ZOOM_OPTIONS = [
  { value: '0.5', label: '50%' },
  { value: '0.75', label: '75%' },
  { value: '1', label: '100%' },
  { value: 'fit', label: 'Fit to screen' },
];

function propertiesTitle(kind, shape) {
  switch (kind) {
    case 'logo':
      return 'Logo';
    case 'image':
      return 'Photo';
    case 'text':
      return 'Text';
    case 'shape':
      return shape ? shapeLabel(shape) : 'Shape';
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
  const [layout, setLayout] = useState(() => loadDraftLayout());
  const [selected, setSelected] = useState(null); // { kind, id? } | null
  const [multiSelected, setMultiSelected] = useState([]); // [{ kind, id }] - shift-click grouping
  const [activePanel, setActivePanel] = useState('elements');
  const [candidates, setCandidates] = useState([]);

  /* { kind, id, x, y } while the right-click order menu is open */
  const [orderMenu, setOrderMenu] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  const [zoom, setZoom] = useState('1'); // '0.5' | '0.75' | '1' | 'fit'
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitPercent, setFitPercent] = useState(100);

  const [templateModal, setTemplateModal] = useState(null); // null | 'save' | 'apply'
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState(() => loadTemplates());

  const canvasRef = useRef(null);
  const middleColumnRef = useRef(null);
  const stageRef = useRef(null);
  const publishedSnapshotRef = useRef(JSON.stringify(loadBoardLayout()));
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
    snapEnabled,
  });

  useEffect(() => {
    return subscribeCandidates((rows) => {
      setCandidates(rows.filter((candidate) => isShownOnBoard(candidate)));
    });
  }, []);

  useEffect(() => {
    setIsDirty(JSON.stringify(layout) !== publishedSnapshotRef.current);
  }, [layout]);

  /*
   * "Fit to screen" only has real work to do in fullscreen, where the stage
   * is a fixed, known-size viewport - outside it the stage's height simply
   * follows the canvas, so there is nothing independent to fit against and
   * 100% width is already the fit.
   */
  useEffect(() => {
    function recomputeFit() {
      setIsFullscreen(Boolean(document.fullscreenElement));

      if (!document.fullscreenElement) {
        setFitPercent(100);
        return;
      }

      const ratio = (window.innerHeight * 16) / (9 * window.innerWidth);
      setFitPercent(Math.min(100, ratio * 100));
    }

    recomputeFit();
    window.addEventListener('resize', recomputeFit);
    document.addEventListener('fullscreenchange', recomputeFit);

    return () => {
      window.removeEventListener('resize', recomputeFit);
      document.removeEventListener('fullscreenchange', recomputeFit);
    };
  }, []);

  /* Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y to redo - but not
     while the user is typing in a field. */
  useEffect(() => {
    function handleKeydown(event) {
      const isMeta = event.ctrlKey || event.metaKey;
      if (!isMeta) return;

      const isEditing = event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]');
      if (isEditing) return;

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
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [editor]);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      stageRef.current?.requestFullscreen();
    }
  }

  function select(kind, id) {
    setSelected({ kind, id });
    setMultiSelected([]);
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
   */
  function handlePointerDown(kind, id) {
    return (event) => {
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

      if (multiSelected.length > 0) setMultiSelected([]);
      grab(kind, id)(event);
    };
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

  function handleSaveTemplate(event) {
    event.preventDefault();
    if (!templateName.trim()) return;

    saveTemplate(templateName, layout);
    setTemplates(loadTemplates());
    setTemplateName('');
    setTemplateModal(null);
    showToast.success('Template saved.');
  }

  function handleApplyTemplate(id) {
    const nextLayout = applyTemplate(id);
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
    setTemplates(loadTemplates());
  }

  /* Deselects first if the removed element was the one being edited. */
  function deselectIfSelected(kind, id) {
    setSelected((current) => (current?.kind === kind && current.id === id ? null : current));
  }

  function publish() {
    publishBoardLayout(layout);
    publishedSnapshotRef.current = JSON.stringify(layout);
    setIsDirty(false);
    showToast.success('Published to the live board.');
  }

  async function addPhotoAndSelect(file) {
    const id = await editor.handleAddPhoto(file);
    if (id) select('image', id);
  }

  function addTextAndSelect() {
    select('text', editor.addText());
  }

  function addShapeAndSelect(kind) {
    select('shape', editor.addShape(kind));
  }

  function removePhoto(id) {
    editor.removePhoto(id);
    deselectIfSelected('image', id);
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
    if (selected.kind === 'image') removePhoto(selected.id);
    if (selected.kind === 'text') removeText(selected.id);
    if (selected.kind === 'shape') removeShape(selected.id);
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
      select(kind, id);
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
          onPointerDown={handlePointerDown('candidates', null)}
          onContextMenu={handleContextMenu('candidates', null)}
        >
          {candidates.length === 0 ? (
            <span className="vb-candidates-empty">No candidates currently shown</span>
          ) : (
            <div className="vb-candidate-preview-grid">
              {candidates.slice(0, 4).map((candidate) => (
                <div key={candidate.id} className="vb-candidate-preview-card">
                  <div className="vb-candidate-preview-photo">
                    {candidate.photo_url ? (
                      <img src={candidate.photo_url} alt="" />
                    ) : (
                      <UsersRound size={14} />
                    )}
                  </div>
                  <div className="vb-candidate-preview-name">{candidate.name}</div>
                </div>
              ))}
            </div>
          )}

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

      return (
        <div
          key="announcements"
          className={`vb-box vb-announcements ${selectedOnCanvas ? 'selected' : ''} ${
            isMultiSelected('announcements') ? 'multi-selected' : ''
          }`}
          style={boxStyle(box)}
          onPointerDown={handlePointerDown('announcements', null)}
          onContextMenu={handleContextMenu('announcements', null)}
        >
          <Megaphone size={14} aria-hidden="true" />
          <span>Announcements</span>

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
          className={`vb-element ${isSelected('logo') ? 'selected' : ''} ${
            isMultiSelected('logo') ? 'multi-selected' : ''
          }`}
          style={scaledPositionStyle(layout.logo, LOGO_BASE_WIDTH)}
          onPointerDown={handlePointerDown('logo')}
          onContextMenu={handleContextMenu('logo', null)}
        >
          <img src={layout.logo.url || '/visual/logo.png'} alt="" className="vb-logo-img" />
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
          style={positionStyle(text)}
          onPointerDown={handlePointerDown('text', text.id)}
          onContextMenu={handleContextMenu('text', text.id)}
        >
          <span style={resolveTextStyle(text)}>{text.text}</span>
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
          className={`vb-element ${isSelected('image', image.id) ? 'selected' : ''} ${
            isMultiSelected('image', image.id) ? 'multi-selected' : ''
          }`}
          style={scaledPositionStyle(image, PHOTO_BASE_WIDTH)}
          onPointerDown={handlePointerDown('image', image.id)}
          onContextMenu={handleContextMenu('image', image.id)}
        >
          <img src={image.url} alt="" className="vb-photo-img" />
        </button>
      );
    }

    if (entry.kind === 'shape') {
      const shape = layout.shapes.find((item) => item.id === entry.id);
      if (!shape || !isVisible(shape)) return null;

      const isEmptyFrame = shape.fill.type === 'image' && !shape.fill.url;
      const selectedOnCanvas = isSelected('shape', shape.id);

      return (
        <div
          key={shape.id}
          className={`vb-shape ${selectedOnCanvas ? 'selected' : ''} ${
            isEmptyFrame ? 'is-empty-frame' : ''
          } ${isMultiSelected('shape', shape.id) ? 'multi-selected' : ''}`}
          style={resolveShapeStyle(shape)}
          onPointerDown={handlePointerDown('shape', shape.id)}
          onContextMenu={handleContextMenu('shape', shape.id)}
        >
          {isEmptyFrame && <Frame size={16} className="vb-frame-hint" />}

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
  const selectedText =
    selected?.kind === 'text' ? layout.texts.find((text) => text.id === selected.id) : null;
  const selectedShape =
    selected?.kind === 'shape' ? layout.shapes.find((shape) => shape.id === selected.id) : null;

  const selectedElement =
    selected?.kind === 'logo'
      ? layout.logo
      : selected?.kind === 'image'
        ? selectedImage
        : selected?.kind === 'text'
          ? selectedText
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
            <a href="/visual" target="_blank" rel="noopener noreferrer" className="secondary-button">
              Preview
              <ExternalLink size={11} />
            </a>
            <button type="button" className="primary-button" onClick={publish} disabled={!isDirty}>
              Publish
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

          <select
            className="form-select vb-toolbar-zoom"
            value={zoom}
            onChange={(event) => setZoom(event.target.value)}
            aria-label="Zoom"
          >
            {ZOOM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

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
            <span>Apply Template</span>
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
        </div>

        <div className="vb-layout">
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

                  <button
                    type="button"
                    className={`vb-element-row ${isSelected('logo') ? 'active' : ''} ${
                      isVisible(layout.logo) ? '' : 'is-hidden'
                    }`}
                    onClick={() => select('logo')}
                  >
                    <ImageIcon size={14} />
                    Logo
                  </button>

                  <button
                    type="button"
                    className={`vb-element-row ${isSelected('candidates') ? 'active' : ''}`}
                    onClick={() => select('candidates')}
                  >
                    <UsersRound size={14} />
                    Candidate Board
                  </button>
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
                      <p className="vb-panel-label">Uploaded</p>
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
                style={{ width: `${zoom === 'fit' ? fitPercent : Number(zoom) * 100}%` }}
              >
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
                  className="vb-canvas-surface"
                  ref={middleColumnRef}
                  onPointerDown={(event) => {
                    if (event.target === event.currentTarget) {
                      setSelected(null);
                      setMultiSelected([]);
                    }
                  }}
                >
                  {layout.layerOrder.map(renderLayerEntry)}

                  {editor.centerGuide.x && <div className="vb-guide vb-guide-vertical" aria-hidden="true" />}
                  {editor.centerGuide.y && <div className="vb-guide vb-guide-horizontal" aria-hidden="true" />}
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
            ) : selected.kind === 'candidates' || selected.kind === 'announcements' ? (
              (() => {
                const isBoard = selected.kind === 'candidates';
                const box = isBoard ? layout.candidates : layout.announcements;

                return (
                  <>
                    <h3 className="vb-properties-title">
                      {isBoard ? 'Candidate Board' : 'Announcements'}
                    </h3>
                    <p className="vb-properties-hint">
                      {isBoard
                        ? 'Drag it anywhere on the board, or drag its corner to resize. What it shows comes from Records.'
                        : 'Drag it anywhere on the board, or drag its corner to set its width. What it shows comes from Announcements.'}
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
                      <label htmlFor="vb-box-w">
                        W %
                        <input
                          id="vb-box-w"
                          className="form-input"
                          type="number"
                          min="8"
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
                      onChange={(fill) => editor.setFill(selected.kind, selected.id, fill)}
                    />
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
                    <label className="form-label">Size</label>
                    <div className="scale-field">
                      <input
                        type="range"
                        min="0.6"
                        max="14"
                        step="0.1"
                        value={selectedElement.fontSize}
                        onChange={(event) =>
                          editor.setFontSize(selected.id, Number(event.target.value))
                        }
                      />
                      <span className="scale-field-value">{selectedElement.fontSize.toFixed(1)}</span>
                    </div>
                  </div>
                )}

                {(selected.kind === 'logo' || selected.kind === 'image') && (
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

                {(selected.kind === 'image' ||
                  selected.kind === 'text' ||
                  selected.kind === 'shape') && (
                  <button type="button" className="delete-button vb-remove-button" onClick={removeSelected}>
                    <Trash2 size={12} />
                    Remove {propertiesTitle(selected.kind, selectedShape)}
                  </button>
                )}
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
