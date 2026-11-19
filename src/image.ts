export type Format = 'webp' | 'jpeg' | 'png';
export type Settings = { format: Format; quality: number; maxWidth: number };
export type Output = {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  name: string;
};
export type ImageItem = {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
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
  const size = dimensions(item.width, item.height, settings.maxWidth);
  if (size.width > 16384 || size.height > 16384)
    throw new Error('Choose a smaller maximum width for this image.');
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context)
    throw new Error('Image processing is not supported in this browser.');
  if (settings.format === 'jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, size.width, size.height);
  const mime = `image/${settings.format}`;
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(
                new Error('Could not encode this image. Try a smaller size.'),
              ),
        mime,
        settings.quality / 100,
      );
    });
    if (blob.type !== mime)
      throw new Error(
        `Your browser cannot export ${settings.format.toUpperCase()}. Try PNG or JPG.`,
      );
    const base =
      item.file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .slice(0, 100) || 'image';
    return {
      blob,
      url: URL.createObjectURL(blob),
      ...size,
      name: `${base}-pixeldesk-${index + 1}.${settings.format === 'jpeg' ? 'jpg' : settings.format}`,
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
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
