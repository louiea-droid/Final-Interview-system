import { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Circle,
  Crown,
  ExternalLink,
  Frame,
  Image as ImageIcon,
  ImagePlus,
  LayoutTemplate,
  Minus,
  Plus,
  RotateCcw,
  Shapes,
  Square,
  Trash2,
  Triangle,
  Type,
  UploadCloud,
  UsersRound,
  X,
} from 'lucide-react';

import { isVisible, loadBoardLayout, loadDraftLayout, publishBoardLayout } from '../lib/boardLayout';
import { useBoardLayoutEditor } from '../lib/useBoardLayoutEditor';
import {
  ALIGN_OPTIONS,
  CASE_OPTIONS,
  FONT_OPTIONS,
  SHADOW_OPTIONS,
  WEIGHT_OPTIONS,
  resolveTextStyle,
} from '../lib/textStyle';
import { LAYER_OPTIONS, SHAPE_KINDS, resolveShapeStyle, shapeLabel } from '../lib/shapeStyle';
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
  const [activePanel, setActivePanel] = useState('elements');
  const [candidates, setCandidates] = useState([]);
  const [isDirty, setIsDirty] = useState(false);

  const canvasRef = useRef(null);
  const publishedSnapshotRef = useRef(JSON.stringify(loadBoardLayout()));
  const showToast = useToast();

  const editor = useBoardLayoutEditor(layout, setLayout, canvasRef, {
    onError: (error) => showToast.error(error.message),
    onSuccess: (message) => showToast.success(message),
  });

  useEffect(() => {
    return subscribeCandidates((rows) => {
      setCandidates(rows.filter((candidate) => isShownOnBoard(candidate)));
    });
  }, []);

  useEffect(() => {
    setIsDirty(JSON.stringify(layout) !== publishedSnapshotRef.current);
  }, [layout]);

  function select(kind, id) {
    setSelected({ kind, id });
    if (PANEL_BY_KIND[kind]) setActivePanel(PANEL_BY_KIND[kind]);
  }

  function isSelected(kind, id) {
    if (!selected || selected.kind !== kind) return false;
    return id === undefined || selected.id === id;
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

  /* Selecting on the canvas and starting a drag are the same gesture. */
  function grab(kind, id) {
    return (event) => {
      select(kind, id);
      editor.beginDrag(kind, id)(event);
    };
  }

  /*
   * The canvas draws shapes in two passes, matching the live board: the ones
   * set to sit behind the candidate board, then - after it - the ones in front.
   */
  function renderShapes(layer) {
    return layout.shapes
      .filter(
        (shape) =>
          isVisible(shape) && (layer === 'front' ? shape.layer === 'front' : shape.layer !== 'front')
      )
      .map((shape) => {
        const isEmptyFrame = shape.fill.type === 'image' && !shape.fill.url;
        const selectedOnCanvas = isSelected('shape', shape.id);

        return (
          <div
            key={shape.id}
            className={`vb-shape ${selectedOnCanvas ? 'selected' : ''} ${
              isEmptyFrame ? 'is-empty-frame' : ''
            }`}
            style={resolveShapeStyle(shape)}
            onPointerDown={grab('shape', shape.id)}
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
      });
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
          <p className="greeting-subtitle">
            Select an element to edit it, or add text, photos, shapes, and photo frames from the
            list on the left.
          </p>
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
            </div>
          </div>

          {/* ================= CANVAS ================= */}

          <div className="vb-canvas-col">
            <div
              className="vb-canvas"
              ref={canvasRef}
              /*
               * Pressing the empty canvas clears the selection. This listens
               * for pointerdown rather than click because a click that starts
               * on an element and ends on the background is reported against
               * their common ancestor - the canvas - which would drop the
               * selection every time an element was dragged out into space.
               */
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) setSelected(null);
              }}
            >
              {renderShapes('back')}

              {isVisible(layout.logo) && (
                <button
                  type="button"
                  className={`vb-element ${isSelected('logo') ? 'selected' : ''}`}
                  style={scaledPositionStyle(layout.logo, LOGO_BASE_WIDTH)}
                  onPointerDown={grab('logo')}
                >
                  <img src={layout.logo.url || '/visual/logo.png'} alt="" className="vb-logo-img" />
                </button>
              )}

              <button
                type="button"
                className={`vb-element vb-candidates ${isSelected('candidates') ? 'selected' : ''}`}
                style={{ left: '50%', top: '58%', transform: 'translate(-50%, -50%)' }}
                onClick={() => select('candidates')}
              >
                {candidates.length === 0 ? (
                  <span className="vb-candidates-empty">No candidates currently shown</span>
                ) : (
                  <div className="vb-candidate-grid">
                    {candidates.slice(0, 4).map((candidate) => (
                      <div key={candidate.id} className="vb-candidate-chip">
                        <div className="vb-candidate-photo">
                          {candidate.photo_url ? (
                            <img src={candidate.photo_url} alt="" />
                          ) : (
                            <UsersRound size={14} />
                          )}
                        </div>
                        <span>{candidate.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </button>

              {renderShapes('front')}

              {layout.images
                .filter((image) => isVisible(image))
                .map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    className={`vb-element ${isSelected('image', image.id) ? 'selected' : ''}`}
                    style={scaledPositionStyle(image, PHOTO_BASE_WIDTH)}
                    onPointerDown={grab('image', image.id)}
                  >
                    <img src={image.url} alt="" className="vb-photo-img" />
                  </button>
                ))}

              {layout.texts
                .filter((text) => isVisible(text))
                .map((text) => (
                  <button
                    key={text.id}
                    type="button"
                    className={`vb-element ${isSelected('text', text.id) ? 'selected' : ''}`}
                    style={positionStyle(text)}
                    onPointerDown={grab('text', text.id)}
                  >
                    <span style={resolveTextStyle(text)}>{text.text}</span>
                  </button>
                ))}
            </div>

            <p className="vb-canvas-hint">
              Click an element to select it, drag to move it, and drag a selected shape's corner
              to resize it. Changes save to your draft as you go - click Publish to put them on
              the live board.
            </p>
          </div>

          {/* ================= PROPERTIES ================= */}

          <div className="vb-properties">
            {!selected ? (
              <div className="vb-properties-empty">
                <LayoutTemplate size={22} />
                <p>Select an element on the canvas or from the list on the left.</p>
              </div>
            ) : selected.kind === 'candidates' ? (
              <div className="vb-properties-empty">
                <UsersRound size={22} />
                <p>
                  The candidate board is managed from Records and always centers itself
                  automatically.
                </p>
              </div>
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

                    <div className="form-group">
                      <label className="form-label">Layer</label>
                      <div className="vb-segment">
                        {LAYER_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`vb-segment-button is-wide ${
                              selectedShape.layer === option.value ? 'active' : ''
                            }`}
                            onClick={() =>
                              editor.updateShape(selected.id, { layer: option.value })
                            }
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
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
    </>
  );
}
