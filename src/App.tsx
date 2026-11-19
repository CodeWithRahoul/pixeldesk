import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import {
  ArrowDownToLine,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Download,
  Expand,
  FileImage,
  ImagePlus,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Plus,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import JSZip from 'jszip';
import {
  download,
  formatBytes,
  MAX_FILES,
  processImage,
  readImage,
  sampleImages,
} from './image';
import type { ImageItem, Settings } from './image';

const DEFAULTS: Settings = { format: 'webp', quality: 82, maxWidth: 1600 };
const presets = [
  {
    id: 'web',
    title: 'For the web',
    detail: 'Small & sharp',
    icon: Zap,
    settings: DEFAULTS,
  },
  {
    id: 'social',
    title: 'For social',
    detail: 'Ready to share',
    icon: Layers3,
    settings: { format: 'jpeg', quality: 90, maxWidth: 1080 } as Settings,
  },
  {
    id: 'custom',
    title: 'Custom',
    detail: 'Your rules',
    icon: SlidersHorizontal,
    settings: null,
  },
];

function initialSettings(): Settings {
  try {
    const saved = JSON.parse(
      localStorage.getItem('pixeldesk-settings') || 'null',
    );
    if (
      saved &&
      ['webp', 'jpeg', 'png'].includes(saved.format) &&
      Number.isFinite(saved.quality) &&
      saved.quality >= 10 &&
      saved.quality <= 100 &&
      [0, 800, 1080, 1600, 1920, 2560].includes(saved.maxWidth)
    )
      return saved;
  } catch {
    /* Storage can be unavailable in private or restricted contexts. */
  }
  return DEFAULTS;
}

function App() {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [preset, setPreset] = useState(() => {
    const saved = initialSettings();
    return (
      presets.find(
        (entry) =>
          entry.settings &&
          JSON.stringify(entry.settings) === JSON.stringify(saved),
      )?.id || 'custom'
    );
  });
  const [items, setItems] = useState<ImageItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState(0);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [split, setSplit] = useState(50);
  const [help, setHelp] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentItems = useRef(items);
  const importLock = useRef(false);
  const helpRef = useRef<HTMLDialogElement>(null);
  const compareRef = useRef<HTMLDialogElement>(null);
  currentItems.current = items;

  useEffect(
    () => () => {
      for (const item of currentItems.current) {
        URL.revokeObjectURL(item.url);
        if (item.output) URL.revokeObjectURL(item.output.url);
      }
    },
    [],
  );
  useEffect(() => {
    try {
      localStorage.setItem('pixeldesk-settings', JSON.stringify(settings));
    } catch {
      /* Optional preference storage. */
    }
  }, [settings]);
  useEffect(() => {
    if (help) helpRef.current?.showModal();
    else helpRef.current?.close();
  }, [help]);
  useEffect(() => {
    if (compareId) compareRef.current?.showModal();
    else compareRef.current?.close();
  }, [compareId]);

  const completed = items.filter((item) => item.output);
  const beforeBytes = completed.reduce((sum, item) => sum + item.file.size, 0);
  const afterBytes = completed.reduce(
    (sum, item) => sum + item.output!.blob.size,
    0,
  );
  const saved = beforeBytes - afterBytes;
  const compare = items.find((item) => item.id === compareId);
  const locked = busy || loading || zipping;

  function updateSettings(next: Settings, presetId = 'custom') {
    setSettings(next);
    setPreset(presetId);
    setItems((previous) =>
      previous.map((item) => {
        if (item.output) URL.revokeObjectURL(item.output.url);
        return { ...item, output: undefined, error: undefined };
      }),
    );
    setNotice('');
  }

  async function addFiles(files: File[]) {
    if (importLock.current || busy || zipping) return;
    importLock.current = true;
    setLoading(true);
    setNotice('');
    const available = MAX_FILES - currentItems.current.length;
    const messages: string[] =
      files.length > available
        ? [
            `You can work with ${MAX_FILES} images at a time. Extra files were skipped.`,
          ]
        : [];
    const incoming: ImageItem[] = [];
    for (const file of files.slice(0, available)) {
      try {
        incoming.push(await readImage(file));
      } catch (error) {
        messages.push(
          error instanceof Error ? error.message : 'Could not read this file.',
        );
      }
    }
    setItems((previous) => [...previous, ...incoming]);
    setNotice(messages.join(' '));
    setLoading(false);
    importLock.current = false;
  }

  async function trySamples() {
    if (locked || importLock.current) return;
    setLoading(true);
    try {
      const files = await sampleImages();
      await addFiles(files);
    } catch {
      setNotice(
        'The sample images could not be created. Try adding your own images.',
      );
    } finally {
      setLoading(false);
    }
  }

  function removeItem(id: string) {
    const item = items.find((entry) => entry.id === id);
    if (item) {
      URL.revokeObjectURL(item.url);
      if (item.output) URL.revokeObjectURL(item.output.url);
    }
    setItems((previous) => previous.filter((entry) => entry.id !== id));
  }

  function clearAll() {
    for (const item of items) {
      URL.revokeObjectURL(item.url);
      if (item.output) URL.revokeObjectURL(item.output.url);
    }
    setItems([]);
    setNotice('');
  }

  async function optimize() {
    if (locked || !items.length) return;
    setBusy(true);
    setProgress(0);
    setNotice('');
    let failures = 0;
    for (const [index, item] of items.entries()) {
      try {
        const output = await processImage(item, settings, index);
        if (item.output) URL.revokeObjectURL(item.output.url);
        setItems((previous) =>
          previous.map((entry) =>
            entry.id === item.id
              ? { ...entry, output, error: undefined }
              : entry,
          ),
        );
      } catch (error) {
        failures++;
        setItems((previous) =>
          previous.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  error:
                    error instanceof Error
                      ? error.message
                      : 'Processing failed.',
                }
              : entry,
          ),
        );
      }
      setProgress(index + 1);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    setBusy(false);
    if (failures)
      setNotice(
        `${failures} image${failures > 1 ? 's' : ''} could not be processed. Check the message beside each image.`,
      );
  }

  async function downloadAll() {
    if (!completed.length || locked) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      completed.forEach((item) =>
        zip.file(item.output!.name, item.output!.blob),
      );
      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'STORE',
      });
      const url = URL.createObjectURL(blob);
      download(url, 'pixeldesk-images.zip');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setNotice(
        'The ZIP could not be created. You can still download each image individually.',
      );
    } finally {
      setZipping(false);
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!locked) void addFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="app-shell">
      <header className="header">
        <a className="brand" href="#" aria-label="PixelDesk home">
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          pixel<span className="brand-light">desk</span>
          <span className="beta">BETA</span>
        </a>
        <button
          className="icon-button mobile-menu"
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <Menu size={21} />
        </button>
        <nav
          className={menuOpen ? 'nav is-open' : 'nav'}
          aria-label="Main navigation"
        >
          <a href="#workspace" onClick={() => setMenuOpen(false)}>
            Image studio
          </a>
          <button
            onClick={() => {
              setHelp(true);
              setMenuOpen(false);
            }}
          >
            How it works <CircleHelp size={15} />
          </button>
          <span className="nav-private">
            <LockKeyhole size={14} /> Private by design
          </span>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> BIG IDEAS. SMALLER FILES.
            </div>
            <h1>
              Your images.
              <br />
              <span>A little lighter.</span>
            </h1>
            <p>
              Resize, compress, and convert in a few clicks.
              <br className="desktop-break" /> All in your browser. All yours.
            </p>
            <div className="hero-chips">
              <span>
                <Check size={14} /> No sign-up
              </span>
              <span>
                <Check size={14} /> No uploads
              </span>
              <span>
                <Check size={14} /> Always free
              </span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-orbit" />
            <div className="art-spark spark-one">✳</div>
            <div className="art-spark spark-two">+</div>
            <div className="art-card art-original">
              <div className="art-landscape">
                <div className="sun" />
                <div className="hill hill-back" />
                <div className="hill hill-front" />
              </div>
              <div className="art-caption">
                <span>the big picture.jpg</span>
                <span>4.8 MB</span>
              </div>
            </div>
            <div className="art-card art-result">
              <div className="art-landscape">
                <div className="sun" />
                <div className="hill hill-back" />
                <div className="hill hill-front" />
              </div>
              <div className="art-caption">
                <span>same magic.webp</span>
                <span>412 KB</span>
              </div>
              <span className="art-badge">
                <Sparkles size={13} /> Less is more
              </span>
            </div>
            <div className="art-label">Same feeling. Smaller footprint.</div>
          </div>
        </section>

        <section className="studio" id="workspace" aria-label="Image studio">
          <aside className="settings-panel">
            <div className="panel-title">
              <SlidersHorizontal size={18} />
              <h2>Make it yours</h2>
              <button
                className="reset-button"
                disabled={locked}
                onClick={() => updateSettings(DEFAULTS, 'web')}
              >
                Reset
              </button>
            </div>
            <fieldset disabled={locked}>
              <legend className="sr-only">Processing settings</legend>
              <label className="field-label">START WITH A PRESET</label>
              <div className="presets">
                {presets.map(
                  ({ id, title, detail, icon: Icon, settings: value }) => (
                    <button
                      key={id}
                      className={`preset ${preset === id ? 'active' : ''}`}
                      aria-pressed={preset === id}
                      onClick={() =>
                        value ? updateSettings(value, id) : setPreset(id)
                      }
                    >
                      <Icon size={18} />
                      <span>
                        {title}
                        <small>{detail}</small>
                      </span>
                      {preset === id && (
                        <Check size={15} className="preset-check" />
                      )}
                    </button>
                  ),
                )}
              </div>
              <div className="setting-group">
                <label className="field-label" htmlFor="format">
                  OUTPUT FORMAT
                </label>
                <div className="select-wrap">
                  <select
                    id="format"
                    value={settings.format}
                    onChange={(event) =>
                      updateSettings({
                        ...settings,
                        format: event.target.value as Settings['format'],
                      })
                    }
                  >
                    <option value="webp">WebP — made for the web</option>
                    <option value="jpeg">JPG — works everywhere</option>
                    <option value="png">PNG — lossless & transparent</option>
                  </select>
                  <ChevronDown size={16} />
                </div>
              </div>
              <div className="setting-group">
                <div className="label-row">
                  <label className="field-label" htmlFor="quality">
                    IMAGE QUALITY
                  </label>
                  <span className="quality-value">
                    {settings.format === 'png'
                      ? 'Lossless'
                      : `${settings.quality}%`}
                  </span>
                </div>
                <input
                  id="quality"
                  aria-label="Image quality"
                  type="range"
                  min="10"
                  max="100"
                  value={settings.quality}
                  disabled={settings.format === 'png'}
                  style={
                    {
                      '--range-progress': `${((settings.quality - 10) / 90) * 100}%`,
                    } as React.CSSProperties
                  }
                  onChange={(event) =>
                    updateSettings({
                      ...settings,
                      quality: Number(event.target.value),
                    })
                  }
                />
                <div className="range-labels">
                  <span>Smaller file</span>
                  <span>More detail</span>
                </div>
              </div>
              <div className="setting-group">
                <label className="field-label" htmlFor="width">
                  MAXIMUM WIDTH
                </label>
                <div className="select-wrap">
                  <select
                    id="width"
                    value={settings.maxWidth}
                    onChange={(event) =>
                      updateSettings({
                        ...settings,
                        maxWidth: Number(event.target.value),
                      })
                    }
                  >
                    <option value="0">Keep original size</option>
                    <option value="800">800 px</option>
                    <option value="1080">1080 px</option>
                    <option value="1600">1600 px</option>
                    <option value="1920">1920 px</option>
                    <option value="2560">2560 px</option>
                  </select>
                  <ChevronDown size={16} />
                </div>
                <p className="field-hint">
                  Proportions stay the same. Never upscaled.
                </p>
              </div>
            </fieldset>
            <div className="settings-note">
              <ShieldCheck size={19} />
              <p>
                Your files never leave this device.
                <br />
                <span>Re-encoding removes embedded metadata.</span>
              </p>
            </div>
          </aside>

          <div className="workspace-panel">
            <div className="workspace-heading">
              <div>
                <h2>
                  Your workspace{' '}
                  <span>{items.length.toString().padStart(2, '0')}</span>
                </h2>
                <p>A fresh start for every pixel.</p>
              </div>
              {items.length > 0 && (
                <button
                  className="text-button"
                  disabled={locked}
                  onClick={clearAll}
                >
                  <Trash2 size={14} /> Clear all
                </button>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              tabIndex={-1}
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(event) => {
                void addFiles(Array.from(event.target.files || []));
                event.target.value = '';
              }}
            />
            <div
              className={`dropzone ${items.length ? 'compact' : ''} ${dragging ? 'dragging' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                if (!locked) setDragging(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node))
                  setDragging(false);
              }}
              onDrop={onDrop}
            >
              {items.length === 0 ? (
                <>
                  <div className="upload-illustration">
                    <div className="upload-card back">
                      <FileImage size={32} strokeWidth={1.3} />
                    </div>
                    <div className="upload-card front">
                      <ImagePlus size={33} strokeWidth={1.4} />
                    </div>
                    <span className="upload-plus">
                      <Plus size={16} />
                    </span>
                  </div>
                  <h3>
                    {dragging
                      ? 'Good things land here.'
                      : 'Drop your images here'}
                  </h3>
                  <p>Good things come in smaller files.</p>
                  <button
                    className="button button-light"
                    disabled={locked}
                    onClick={() => inputRef.current?.click()}
                  >
                    {loading ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <Plus size={17} />
                    )}{' '}
                    {loading ? 'Opening images…' : 'Choose images'}
                  </button>
                  <span className="dropzone-meta">
                    JPG, PNG, WebP · Up to 25 MB each · 20 images
                  </span>
                  <div className="sample-option">
                    Just looking around?{' '}
                    <button disabled={locked} onClick={() => void trySamples()}>
                      Try sample images
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <ImagePlus size={22} />
                  <p>
                    {loading ? 'Opening images…' : 'Drop more images or'}{' '}
                    <button
                      disabled={locked || items.length >= MAX_FILES}
                      onClick={() => inputRef.current?.click()}
                    >
                      browse files
                    </button>
                  </p>
                  <span>
                    {items.length}/{MAX_FILES}
                  </span>
                </>
              )}
            </div>

            {notice && (
              <div className="notice" role="alert">
                <CircleHelp size={17} />
                <span>{notice}</span>
                <button
                  className="icon-button"
                  aria-label="Dismiss message"
                  onClick={() => setNotice('')}
                >
                  <X size={15} />
                </button>
              </div>
            )}

            {items.length > 0 && (
              <div className="file-list" aria-label="Image files">
                {items.map((item) => {
                  const delta = item.output
                    ? Math.round(
                        (1 - item.output.blob.size / item.file.size) * 100,
                      )
                    : 0;
                  return (
                    <article className="file-row" key={item.id}>
                      <img
                        className="file-thumbnail"
                        src={item.output?.url || item.url}
                        alt=""
                      />
                      <div className="file-info">
                        <h3 title={item.file.name}>{item.file.name}</h3>
                        <p>
                          {item.output
                            ? `${item.output.width} × ${item.output.height}`
                            : `${item.width} × ${item.height}`}
                          <span>·</span>
                          {item.output ? (
                            <>
                              <s>{formatBytes(item.file.size)}</s>{' '}
                              {formatBytes(item.output.blob.size)}
                            </>
                          ) : (
                            formatBytes(item.file.size)
                          )}
                        </p>
                        {item.error && (
                          <p className="file-error">{item.error}</p>
                        )}
                      </div>
                      {item.output && (
                        <span
                          className={`savings-badge ${delta < 0 ? 'larger' : ''}`}
                        >
                          {delta >= 0 ? `−${delta}%` : `+${Math.abs(delta)}%`}
                        </span>
                      )}
                      <div className="file-actions">
                        {item.output && (
                          <>
                            <button
                              className="icon-button"
                              disabled={locked}
                              aria-label={`Compare ${item.file.name}`}
                              title="Compare original and result"
                              onClick={() => {
                                setSplit(50);
                                setCompareId(item.id);
                              }}
                            >
                              <ScanLine size={17} />
                            </button>
                            <button
                              className="icon-button"
                              disabled={locked}
                              aria-label={`Download ${item.file.name}`}
                              title="Download image"
                              onClick={() =>
                                download(item.output!.url, item.output!.name)
                              }
                            >
                              <ArrowDownToLine size={17} />
                            </button>
                          </>
                        )}
                        <button
                          className="icon-button remove-button"
                          aria-label={`Remove ${item.file.name}`}
                          disabled={locked}
                          onClick={() => removeItem(item.id)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {completed.length > 0 && !busy && (
              <div className="results-summary" role="status">
                <span className="summary-check">
                  <CheckCheck size={20} />
                </span>
                <div>
                  <strong>
                    {saved >= 0
                      ? `${formatBytes(saved)} lighter. Looking good.`
                      : 'Your images are ready.'}
                  </strong>
                  <p>
                    {completed.length} image{completed.length > 1 ? 's' : ''}{' '}
                    processed
                    {saved >= 0 && beforeBytes > 0
                      ? ` · ${Math.round((saved / beforeBytes) * 100)}% smaller overall`
                      : ' · This format produces larger files. Try WebP for smaller output.'}
                  </p>
                </div>
                <Sparkles size={21} />
              </div>
            )}
            <div className="workspace-bottom">
              <span>
                <LockKeyhole size={13} /> Only on your device
              </span>
              {completed.length > 0 &&
              completed.length === items.length &&
              !busy ? (
                <button
                  className="button button-primary"
                  disabled={locked}
                  onClick={() => void downloadAll()}
                >
                  {zipping ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  {zipping ? 'Creating ZIP…' : 'Download all'}
                  <span className="button-tag">ZIP</span>
                </button>
              ) : (
                <button
                  className="button button-primary"
                  disabled={locked || !items.length}
                  onClick={() => void optimize()}
                >
                  {busy ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <Sparkles size={17} />
                  )}
                  {busy
                    ? `Processing ${progress} of ${items.length}…`
                    : 'Optimize images'}
                  {items.length > 0 && !busy && (
                    <span className="button-tag">{items.length}</span>
                  )}
                </button>
              )}
            </div>
            {completed.length > 0 &&
              completed.length < items.length &&
              !busy && (
                <button
                  className="process-again"
                  disabled={locked}
                  onClick={() => void downloadAll()}
                >
                  Download {completed.length} processed image
                  {completed.length > 1 ? 's' : ''} as ZIP
                </button>
              )}
            {busy && (
              <div
                className="batch-progress"
                role="progressbar"
                aria-label="Batch processing progress"
                aria-valuemin={0}
                aria-valuemax={items.length}
                aria-valuenow={progress}
              >
                <span
                  style={{ width: `${(progress / items.length) * 100}%` }}
                />
              </div>
            )}
          </div>
        </section>

        <section className="features" aria-label="Why PixelDesk">
          <div>
            <span className="feature-icon">
              <Zap size={20} />
            </span>
            <div>
              <h3>Less waiting. More creating.</h3>
              <p>Batch processing that gets out of your way.</p>
            </div>
          </div>
          <div>
            <span className="feature-icon">
              <LockKeyhole size={20} />
            </span>
            <div>
              <h3>Your photos stay your photos.</h3>
              <p>No servers, no uploads, no awkward fine print.</p>
            </div>
          </div>
          <div>
            <span className="feature-icon">
              <Expand size={20} />
            </span>
            <div>
              <h3>Small files. Big possibilities.</h3>
              <p>Ready for your website, shop, or next big idea.</p>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <a className="footer-brand" href="#">
          pixeldesk
        </a>
        <p>A small tool for the things you make.</p>
        <span>Made for everyone. Free to use.</span>
      </footer>

      <dialog
        ref={helpRef}
        className="help-dialog"
        onCancel={() => setHelp(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setHelp(false);
        }}
      >
        <div className="dialog-heading">
          <span className="eyebrow">A LIGHTER WORKFLOW</span>
          <button
            className="icon-button"
            aria-label="Close help"
            onClick={() => setHelp(false)}
          >
            <X size={21} />
          </button>
        </div>
        <h2>From big to just right.</h2>
        <div className="help-step">
          <ImagePlus />
          <div>
            <h3>Bring your images</h3>
            <p>
              Drop up to 20 JPG, PNG, or WebP files into the workspace. Each
              file can be up to 25 MB and 40 megapixels.
            </p>
          </div>
        </div>
        <div className="help-step">
          <SlidersHorizontal />
          <div>
            <h3>Find your sweet spot</h3>
            <p>
              Choose a preset or adjust format, quality, and maximum width. We
              keep proportions and never enlarge your images.
            </p>
          </div>
        </div>
        <div className="help-step">
          <Download />
          <div>
            <h3>Give them a new home</h3>
            <p>
              Optimize, compare the result, and download individually or as a
              ZIP. Processing happens entirely in your browser.
            </p>
          </div>
        </div>
        <div className="help-note">
          A few things to know: PNG is lossless, so its quality slider is
          disabled. JPG fills transparent areas with white. Re-encoding removes
          embedded metadata and may change color appearance. Some images may
          become larger; savings depend on the source and settings. Animated
          WebP exports as a still image.
        </div>
        <button
          className="button button-primary"
          onClick={() => setHelp(false)}
        >
          Got it. Let's make something.
        </button>
      </dialog>

      <dialog
        ref={compareRef}
        className="compare-dialog"
        onCancel={() => setCompareId(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setCompareId(null);
        }}
      >
        {compare?.output && (
          <>
            <div className="dialog-heading">
              <div>
                <span className="eyebrow">THE SAME, BUT LIGHTER</span>
                <h2>{compare.file.name}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close comparison"
                onClick={() => setCompareId(null)}
              >
                <X size={21} />
              </button>
            </div>
            <div
              className="compare-stage"
              style={{ aspectRatio: `${compare.width} / ${compare.height}` }}
            >
              <img src={compare.output.url} alt="Processed image" />
              <div
                className="compare-before"
                style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
              >
                <img src={compare.url} alt="Original image" />
              </div>
              <div className="compare-divider" style={{ left: `${split}%` }}>
                <span>
                  <ScanLine size={20} />
                </span>
              </div>
              <span className="compare-label original-label">Original</span>
              <span className="compare-label result-label">Result</span>
            </div>
            <label className="comparison-control">
              Slide to compare
              <input
                type="range"
                aria-label="Before and after comparison"
                min="0"
                max="100"
                value={split}
                onChange={(event) => setSplit(Number(event.target.value))}
              />
            </label>
            <div className="compare-meta">
              <span>
                Original <strong>{formatBytes(compare.file.size)}</strong>
              </span>
              <span>
                Result <strong>{formatBytes(compare.output.blob.size)}</strong>
              </span>
              <button
                className="button button-primary"
                onClick={() =>
                  download(compare.output!.url, compare.output!.name)
                }
              >
                <Download size={16} /> Download image
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}

export default App;
