import { ChevronDown, Fingerprint, Stamp } from 'lucide-react';
import type { Settings } from './image';

export default function AdvancedSettings({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (value: Settings) => void;
}) {
  const setMark = (value: Partial<Settings['watermark']>) =>
    onChange({ ...settings, watermark: { ...settings.watermark, ...value } });
  return (
    <>
      <details className="advanced-section">
        <summary>
          <Fingerprint size={17} /> Export options <ChevronDown size={15} />
        </summary>
        <div className="advanced-content">
          <label className="field-label" htmlFor="target-size">
            TARGET FILE SIZE (KB)
          </label>
          <input
            className="text-input"
            id="target-size"
            type="number"
            min="0"
            max="10000"
            step="10"
            value={settings.targetKB || ''}
            placeholder="No size target"
            disabled={settings.format === 'png'}
            onChange={(e) =>
              onChange({
                ...settings,
                targetKB: Math.max(0, Math.min(10000, Number(e.target.value))),
              })
            }
          />
          <p className="field-hint">
            {settings.format === 'png'
              ? 'Size targeting is available for JPG and WebP.'
              : 'Lowers quality to aim for this size. If it cannot fit, you will see a warning.'}
          </p>
          <label className="field-label spaced-label" htmlFor="filename-prefix">
            EXPORT NAME
          </label>
          <input
            className="text-input"
            id="filename-prefix"
            maxLength={50}
            placeholder="Keep original filenames"
            value={settings.filenamePrefix}
            onChange={(e) =>
              onChange({ ...settings, filenamePrefix: e.target.value })
            }
          />
          <p className="field-hint">
            {settings.filenamePrefix.trim()
              ? `${settings.filenamePrefix.trim().replace(/[^a-zA-Z0-9_-]/g, '-')}-pixeldesk-1.${settings.format === 'jpeg' ? 'jpg' : settings.format}`
              : 'Each file gets a unique numbered suffix.'}
          </p>
        </div>
      </details>
      <details className="advanced-section">
        <summary>
          <Stamp size={17} /> Watermark <ChevronDown size={15} />
          {settings.watermark.text.trim() && (
            <span className="enabled-tag">ON</span>
          )}
        </summary>
        <div className="advanced-content">
          <label className="field-label" htmlFor="watermark-text">
            WATERMARK TEXT
          </label>
          <input
            className="text-input"
            id="watermark-text"
            maxLength={80}
            placeholder="Your name or brand"
            value={settings.watermark.text}
            onChange={(e) => setMark({ text: e.target.value })}
          />
          <p className="field-hint">
            Applied to every export. Leave empty to disable.
          </p>
          <label
            className="field-label spaced-label"
            htmlFor="watermark-position"
          >
            POSITION
          </label>
          <div className="select-wrap">
            <select
              id="watermark-position"
              value={settings.watermark.position}
              onChange={(e) =>
                setMark({
                  position: e.target.value as Settings['watermark']['position'],
                })
              }
            >
              <option value="bottom-right">Bottom right</option>
              <option value="bottom-left">Bottom left</option>
              <option value="center">Center</option>
              <option value="top-right">Top right</option>
              <option value="top-left">Top left</option>
            </select>
            <ChevronDown size={16} />
          </div>
          <div className="color-field">
            <label htmlFor="watermark-color">Text color</label>
            <input
              type="color"
              id="watermark-color"
              value={settings.watermark.color}
              onChange={(e) => setMark({ color: e.target.value })}
            />
          </div>
          <label className="range-field" htmlFor="watermark-opacity">
            Opacity <span>{settings.watermark.opacity}%</span>
            <input
              id="watermark-opacity"
              type="range"
              min="10"
              max="100"
              value={settings.watermark.opacity}
              onChange={(e) => setMark({ opacity: Number(e.target.value) })}
            />
          </label>
          <label className="range-field" htmlFor="watermark-size">
            Text size <span>{settings.watermark.size}%</span>
            <input
              id="watermark-size"
              type="range"
              min="2"
              max="12"
              value={settings.watermark.size}
              onChange={(e) => setMark({ size: Number(e.target.value) })}
            />
          </label>
          <p className="field-hint">
            Open an image's editor to preview your watermark.
          </p>
        </div>
      </details>
    </>
  );
}
