import type { Settings } from './image';

export const DEFAULTS: Settings = {
  format: 'webp',
  quality: 82,
  maxWidth: 1600,
  targetKB: 0,
  filenamePrefix: '',
  watermark: {
    text: '',
    color: '#ffffff',
    opacity: 65,
    size: 5,
    position: 'bottom-right',
  },
};

export function normalizeSettings(value: unknown): Settings {
  const saved =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const mark =
    saved.watermark && typeof saved.watermark === 'object'
      ? (saved.watermark as Record<string, unknown>)
      : {};
  const number = (
    input: unknown,
    fallback: number,
    min: number,
    max: number,
  ) =>
    typeof input === 'number' && Number.isFinite(input)
      ? Math.min(max, Math.max(min, Math.round(input)))
      : fallback;
  return {
    format:
      saved.format === 'jpeg' || saved.format === 'png' ? saved.format : 'webp',
    quality: number(saved.quality, DEFAULTS.quality, 10, 100),
    maxWidth: number(saved.maxWidth, DEFAULTS.maxWidth, 0, 8192),
    targetKB: number(saved.targetKB, 0, 0, 10000),
    filenamePrefix:
      typeof saved.filenamePrefix === 'string'
        ? saved.filenamePrefix.slice(0, 50)
        : '',
    watermark: {
      text: typeof mark.text === 'string' ? mark.text.slice(0, 80) : '',
      color:
        typeof mark.color === 'string' && /^#[0-9a-f]{6}$/i.test(mark.color)
          ? mark.color
          : '#ffffff',
      opacity: number(mark.opacity, 65, 10, 100),
      size: number(mark.size, 5, 2, 12),
      position: [
        'top-left',
        'top-right',
        'center',
        'bottom-left',
        'bottom-right',
      ].includes(String(mark.position))
        ? (mark.position as Settings['watermark']['position'])
        : 'bottom-right',
    },
  };
}

export function initialSettings(): Settings {
  try {
    return normalizeSettings(
      JSON.parse(localStorage.getItem('pixeldesk-settings') || 'null'),
    );
  } catch {
    return normalizeSettings(null);
  }
}
