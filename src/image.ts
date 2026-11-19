export type Format = 'webp' | 'jpeg' | 'png';
export type Settings = {
  format: Format;
  quality: number;
  maxWidth: number;
  targetKB: number;
  filenamePrefix: string;
  watermark: {
    text: string;
    color: string;
    opacity: number;
    size: number;
    position:
      'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right';
  };
};
export type CropRatio = 'original' | '1:1' | '4:5' | '16:9' | '3:2';
export type Edits = {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  cropRatio: CropRatio;
  focusX: number;
  focusY: number;
};
export const DEFAULT_EDITS: Edits = {
  rotation: 0,
  flipH: false,
  flipV: false,
  cropRatio: 'original',
  focusX: 50,
  focusY: 50,
};
export type Output = {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  name: string;
  warning?: string;
  quality: number;
};
export type ImageItem = {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
  edits: Edits;
  exportIndex: number;
  output?: Output;
  error?: string;
};

export const MAX_FILES = 20;
export const MAX_BYTES = 25 * 1024 * 1024;
const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function dimensions(width: number, height: number, maxWidth: number) {
  const ratio = maxWidth > 0 ? Math.min(1, maxWidth / width) : 1;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

export async function readImage(file: File): Promise<ImageItem> {
  if (!SUPPORTED.has(file.type))
    throw new Error(`${file.name}: use a JPG, PNG, or WebP image.`);
  if (file.size > MAX_BYTES)
    throw new Error(`${file.name}: the maximum file size is 25 MB.`);
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    if (image.naturalWidth * image.naturalHeight > 40_000_000)
      throw new Error('Images must be under 40 megapixels.');
    return {
      id: crypto.randomUUID(),
      file,
      url,
      width: image.naturalWidth,
      height: image.naturalHeight,
      edits: { ...DEFAULT_EDITS },
      exportIndex: 0,
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new Error(
      `${file.name}: ${error instanceof Error && error.message.includes('megapixels') ? error.message : 'this image could not be opened.'}`,
    );
  }
}

export async function processImage(
  item: ImageItem,
  settings: Settings,
  index: number,
): Promise<Output> {
  const image = await loadImage(item.url);
  const size = geometry(item.width, item.height, item.edits, settings.maxWidth);
  if (size.width > 16384 || size.height > 16384)
    throw new Error('Choose a smaller maximum width for this image.');
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const mime = `image/${settings.format}`;
  try {
    drawImage(canvas, image, item.edits, settings);
    const encode = (quality: number) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(
                  new Error('Could not encode this image. Try a smaller size.'),
                ),
          mime,
          quality / 100,
        );
      });
    let quality = settings.quality;
    let blob = await encode(quality);
    if (blob.type !== mime)
      throw new Error(
        `Your browser cannot export ${settings.format.toUpperCase()}. Try PNG or JPG.`,
      );
    const target = settings.format !== 'png' ? settings.targetKB * 1024 : 0;
    let warning: string | undefined;
    if (target > 0 && blob.size > target) {
      let low = 10;
      let high = quality;
      blob = await encode(low);
      quality = low;
      if (blob.size > target) {
        warning = `Above ${settings.targetKB} KB target at minimum quality. Try a smaller width.`;
      } else {
        for (let attempt = 0; attempt < 7 && high - low > 1; attempt++) {
          const candidateQuality = Math.floor((low + high) / 2);
          const candidate = await encode(candidateQuality);
          if (candidate.size <= target) {
            blob = candidate;
            quality = candidateQuality;
            low = candidateQuality;
          } else high = candidateQuality;
        }
      }
    }
    const base =
      (settings.filenamePrefix.trim() || item.file.name.replace(/\.[^.]+$/, ''))
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .slice(0, 100) || 'image';
    return {
      blob,
      url: URL.createObjectURL(blob),
      width: size.width,
      height: size.height,
      warning,
      quality,
      name: `${base}-pixeldesk-${index + 1}.${settings.format === 'jpeg' ? 'jpg' : settings.format}`,
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function geometry(
  width: number,
  height: number,
  edits: Edits,
  maxWidth: number,
) {
  const rotated = edits.rotation === 90 || edits.rotation === 270;
  const orientedWidth = rotated ? height : width;
  const orientedHeight = rotated ? width : height;
  const [rw, rh] =
    edits.cropRatio === 'original'
      ? [orientedWidth, orientedHeight]
      : edits.cropRatio.split(':').map(Number);
  const ratio = rw / rh;
  const cropWidth = Math.min(orientedWidth, orientedHeight * ratio);
  const cropHeight = Math.min(orientedHeight, orientedWidth / ratio);
  return {
    ...dimensions(cropWidth, cropHeight, maxWidth),
    orientedWidth,
    orientedHeight,
    cropWidth,
    cropHeight,
    sourceX: ((orientedWidth - cropWidth) * edits.focusX) / 100,
    sourceY: ((orientedHeight - cropHeight) * edits.focusY) / 100,
  };
}

export function hasEdits(edits: Edits) {
  return (
    edits.rotation !== 0 ||
    edits.flipH ||
    edits.flipV ||
    edits.cropRatio !== 'original'
  );
}

export function drawImage(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  edits: Edits,
  settings: Settings,
) {
  const context = canvas.getContext('2d');
  if (!context)
    throw new Error('Image processing is not supported in this browser.');
  const g = geometry(
    image.naturalWidth,
    image.naturalHeight,
    edits,
    settings.maxWidth,
  );
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (settings.format === 'jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.save();
  context.imageSmoothingQuality = 'high';
  // Map the oriented crop into the output canvas, then rotate the original into it.
  // Keeping this in one transform avoids allocating an intermediate full-size image.
  context.scale(canvas.width / g.cropWidth, canvas.height / g.cropHeight);
  context.translate(-g.sourceX, -g.sourceY);
  context.translate(g.orientedWidth / 2, g.orientedHeight / 2);
  context.scale(edits.flipH ? -1 : 1, edits.flipV ? -1 : 1);
  context.rotate((edits.rotation * Math.PI) / 180);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
  const mark = settings.watermark;
  if (!mark.text.trim()) return;
  context.save();
  const shortEdge = Math.min(canvas.width, canvas.height);
  let fontSize = (shortEdge * mark.size) / 100;
  context.font = `600 ${fontSize}px sans-serif`;
  const measuredWidth = context.measureText(mark.text).width;
  if (measuredWidth > canvas.width * 0.84)
    fontSize *= (canvas.width * 0.84) / measuredWidth;
  context.font = `600 ${fontSize}px sans-serif`;
  context.globalAlpha = mark.opacity / 100;
  context.fillStyle = mark.color;
  context.shadowColor = '#00000080';
  context.shadowBlur = shortEdge * 0.005;
  const padding = shortEdge * 0.04;
  const centered = mark.position === 'center';
  context.textAlign = centered
    ? 'center'
    : mark.position.endsWith('right')
      ? 'right'
      : 'left';
  context.textBaseline = centered
    ? 'middle'
    : mark.position.startsWith('top')
      ? 'top'
      : 'bottom';
  context.fillText(
    mark.text,
    centered
      ? canvas.width / 2
      : context.textAlign === 'right'
        ? canvas.width - padding
        : padding,
    centered
      ? canvas.height / 2
      : context.textBaseline === 'top'
        ? padding
        : canvas.height - padding,
  );
  context.restore();
}

export function download(url: string, name: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export async function sampleImages(): Promise<File[]> {
  const palettes = [
    {
      sky: '#b9c9ce',
      haze: '#eee2c1',
      sun: '#ffeebc',
      hills: ['#82958c', '#526e69', '#294d48'],
      name: 'Alpine-morning',
    },
    {
      sky: '#d9b3a0',
      haze: '#f5d9a9',
      sun: '#ffedb7',
      hills: ['#c18e75', '#9c6257', '#563d49'],
      name: 'Desert-dusk',
    },
    {
      sky: '#a4b7d7',
      haze: '#dcc9e6',
      sun: '#f8e5d5',
      hills: ['#9896ba', '#686c9a', '#36466b'],
      name: 'Blue-hour',
    },
  ];
  return Promise.all(
    palettes.map(async (palette, index) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1800;
      canvas.height = 1200;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, 0, 1200);
      gradient.addColorStop(0, palette.sky);
      gradient.addColorStop(0.8, palette.haze);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1800, 1200);
      ctx.fillStyle = palette.sun;
      ctx.beginPath();
      ctx.arc(1260 - index * 300, 350, 95, 0, Math.PI * 2);
      ctx.fill();
      palette.hills.forEach((color, layer) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, 1200);
        for (let x = 0; x <= 1800; x += 10) {
          const y =
            690 +
            layer * 150 +
            Math.sin(x / (230 + layer * 80) + layer * 2 + index) * 130 +
            Math.cos(x / 100 + index) * (30 - layer * 8);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(1800, 1200);
        ctx.closePath();
        ctx.fill();
      });
      // A deterministic fine texture gives the demo a realistic compression workload.
      const pixels = ctx.getImageData(0, 0, 1800, 1200);
      let seed = 41 + index;
      for (let i = 0; i < pixels.data.length; i += 4) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const noise = ((seed >>> 24) / 255 - 0.5) * 14;
        for (let c = 0; c < 3; c++) pixels.data[i + c] += noise;
      }
      ctx.putImageData(pixels, 0, 0);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((value) => resolve(value!), 'image/jpeg', 0.97),
      );
      canvas.width = canvas.height = 0;
      return new File([blob], `${palette.name}.jpg`, { type: 'image/jpeg' });
    }),
  );
}
