import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  LoaderCircle,
  RotateCcw,
  RotateCw,
  X,
} from 'lucide-react';
import { DEFAULT_EDITS, drawImage, geometry, loadImage } from './image';
import type { CropRatio, Edits, ImageItem, Settings } from './image';

export default function EditorDialog({
  item,
  settings,
  onSave,
  onClose,
}: {
  item: ImageItem;
  settings: Settings;
  onSave: (edits: Edits) => void;
  onClose: () => void;
}) {
  const [edits, setEdits] = useState<Edits>({ ...item.edits });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const decoded = useRef<HTMLImageElement | null>(null);
  const size = geometry(item.width, item.height, edits, settings.maxWidth);

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    let cancelled = false;
    loadImage(item.url)
      .then((image) => {
        if (!cancelled) {
          decoded.current = image;
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError('This image could not be previewed.');
      });
    return () => {
      cancelled = true;
    };
  }, [item.url]);
  useEffect(() => {
    if (!ready || !decoded.current || !canvas.current) return;
    const element = canvas.current;
    const scale = Math.min(1, 900 / size.width, 650 / size.height);
    element.width = Math.max(1, Math.round(size.width * scale));
    element.height = Math.max(1, Math.round(size.height * scale));
    try {
      drawImage(element, decoded.current, edits, settings);
      setError('');
    } catch {
      setError('Preview is unavailable in this browser.');
    }
  }, [ready, edits, settings, size.width, size.height]);

  const patch = (value: Partial<Edits>) =>
    setEdits((previous) => ({ ...previous, ...value }));
  return (
    <dialog
      ref={dialog}
      className="editor-dialog"
      aria-labelledby="editor-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">A FRESH PERSPECTIVE</span>
          <h2 id="editor-title">Edit {item.file.name}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close editor"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      <div className="editor-stage">
        {!ready && !error && <LoaderCircle className="spin" />}
        <canvas ref={canvas} aria-label="Live edit preview" role="img" />
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="editor-toolbar">
        <span>
          <Crop size={16} /> Frame & orientation
        </span>
        <div>
          <button
            className="icon-button"
            aria-label="Rotate left"
            onClick={() =>
              patch({
                rotation: ((edits.rotation + 270) % 360) as Edits['rotation'],
              })
            }
          >
            <RotateCcw size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Rotate right"
            onClick={() =>
              patch({
                rotation: ((edits.rotation + 90) % 360) as Edits['rotation'],
              })
            }
          >
            <RotateCw size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Flip horizontal"
            aria-pressed={edits.flipH}
            onClick={() => patch({ flipH: !edits.flipH })}
          >
            <FlipHorizontal2 size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Flip vertical"
            aria-pressed={edits.flipV}
            onClick={() => patch({ flipV: !edits.flipV })}
          >
            <FlipVertical2 size={19} />
          </button>
        </div>
      </div>
      <div className="crop-options" role="group" aria-label="Crop aspect ratio">
        {(['original', '1:1', '4:5', '16:9', '3:2'] as CropRatio[]).map(
          (ratio) => (
            <button
              key={ratio}
              aria-pressed={edits.cropRatio === ratio}
              onClick={() =>
                patch({ cropRatio: ratio, focusX: 50, focusY: 50 })
              }
            >
              {ratio === 'original' ? 'Original' : ratio}
            </button>
          ),
        )}
      </div>
      {edits.cropRatio !== 'original' && (
        <div className="crop-focus">
          <label className="range-field" htmlFor="crop-horizontal">
            Horizontal crop position <span>{edits.focusX}%</span>
            <input
              id="crop-horizontal"
              type="range"
              min="0"
              max="100"
              disabled={Math.abs(size.orientedWidth - size.cropWidth) < 1}
              value={edits.focusX}
              onChange={(e) => patch({ focusX: Number(e.target.value) })}
            />
          </label>
          <label className="range-field" htmlFor="crop-vertical">
            Vertical crop position <span>{edits.focusY}%</span>
            <input
              id="crop-vertical"
              type="range"
              min="0"
              max="100"
              disabled={Math.abs(size.orientedHeight - size.cropHeight) < 1}
              value={edits.focusY}
              onChange={(e) => patch({ focusY: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
      <div className="editor-bottom">
        <div>
          <strong>
            {size.width} × {size.height} px
          </strong>
          <p>Preview includes your watermark. Originals stay intact.</p>
        </div>
        <button
          className="text-button"
          onClick={() => setEdits({ ...DEFAULT_EDITS })}
        >
          Reset edits
        </button>
        <button
          className="button button-primary"
          disabled={!ready || !!error}
          onClick={() => onSave(edits)}
        >
          <Check size={16} /> Apply edits
        </button>
      </div>
    </dialog>
  );
}
