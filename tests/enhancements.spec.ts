import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import JSZip from 'jszip';

async function makeImage(page: Page, name = 'quadrants.png', noise = false) {
  const encoded = await page.evaluate((noisy) => {
    const canvas = document.createElement('canvas');
    canvas.width = noisy ? 512 : 64;
    canvas.height = noisy ? 256 : 32;
    const ctx = canvas.getContext('2d')!;
    if (noisy) {
      const pixels = ctx.createImageData(canvas.width, canvas.height);
      let seed = 82;
      for (let i = 0; i < pixels.data.length; i += 4) {
        for (let j = 0; j < 3; j++) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          pixels.data[i + j] = seed >>> 24;
        }
        pixels.data[i + 3] = 255;
      }
      ctx.putImageData(pixels, 0, 0);
    } else {
      for (const [color, x, y] of [
        ['#ff0000', 0, 0],
        ['#00ff00', 32, 0],
        ['#0000ff', 0, 16],
        ['#ffff00', 32, 16],
      ] as const) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 32, 16);
      }
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, noise);
  return {
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  };
}

async function inspectOutput(page: Page, row = 0) {
  return page
    .locator('.file-thumbnail')
    .nth(row)
    .evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      const pixel = (x: number, y: number) =>
        Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3);
      const blob = await (await fetch(image.src)).blob();
      return {
        width: canvas.width,
        height: canvas.height,
        bytes: blob.size,
        corners: [
          pixel(2, 2),
          pixel(canvas.width - 3, 2),
          pixel(2, canvas.height - 3),
          pixel(canvas.width - 3, canvas.height - 3),
        ],
      };
    });
}

test('rotation, flipping, and positioned crops produce the expected pixels without changing other images', async ({
  page,
}) => {
  await page.goto('/');
  const original = await makeImage(page);
  await page
    .locator('input[type=file]')
    .setInputFiles([original, { ...original, name: 'untouched.png' }]);
  await page.getByLabel('OUTPUT FORMAT', { exact: true }).selectOption('png');
  await page.getByLabel('MAXIMUM WIDTH', { exact: true }).selectOption('0');
  await page
    .getByRole('button', { name: 'Edit quadrants.png', exact: true })
    .click();
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await page
    .getByRole('button', { name: 'Flip horizontal', exact: true })
    .click();
  await page.getByRole('button', { name: 'Apply edits', exact: true }).click();
  await page.getByRole('button', { name: /Optimize images/ }).click();
  await expect(
    page.getByRole('button', { name: /Download all/ }),
  ).toBeEnabled();
  const output = await inspectOutput(page);
  expect([output.width, output.height]).toEqual([32, 64]);
  expect(output.corners).toEqual([
    [255, 0, 0],
    [0, 0, 255],
    [0, 255, 0],
    [255, 255, 0],
  ]);
  expect((await inspectOutput(page, 1)).width).toBe(64);
  await page
    .getByRole('button', { name: 'Edit quadrants.png', exact: true })
    .click();
  await page.getByRole('button', { name: 'Reset edits', exact: true }).click();
  await page.getByRole('button', { name: '1:1', exact: true }).click();
  await page
    .getByRole('slider', { name: /Horizontal crop position/ })
    .fill('100');
  await page.getByRole('button', { name: 'Apply edits', exact: true }).click();
  await page.getByRole('button', { name: /Optimize images/ }).click();
  await expect(
    page.getByRole('button', { name: /Download all/ }),
  ).toBeEnabled();
  const cropped = await inspectOutput(page);
  expect([cropped.width, cropped.height]).toEqual([32, 32]);
  expect(cropped.corners).toEqual([
    [0, 255, 0],
    [0, 255, 0],
    [255, 255, 0],
    [255, 255, 0],
  ]);
});

test('watermark appears in preview and export; custom names are used in downloads', async ({
  page,
}) => {
  await page.goto('/');
  const white = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 500;
    canvas.height = 250;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 500, 250);
    return canvas.toDataURL().split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'white.png',
    mimeType: 'image/png',
    buffer: Buffer.from(white, 'base64'),
  });
  await page.getByLabel('OUTPUT FORMAT', { exact: true }).selectOption('png');
  await page.locator('summary').filter({ hasText: 'Watermark' }).click();
  await page.getByLabel('WATERMARK TEXT', { exact: true }).fill('PixelDesk');
  await page.getByLabel('POSITION', { exact: true }).selectOption('center');
  await page.getByLabel('Text color', { exact: true }).fill('#000000');
  await page.getByRole('slider', { name: /Opacity/ }).fill('100');
  await page.getByRole('slider', { name: /Text size/ }).fill('12');
  await page.locator('summary').filter({ hasText: 'Export options' }).click();
  await page.getByLabel('EXPORT NAME', { exact: true }).fill('Portfolio photo');
  await page
    .getByRole('button', { name: 'Edit white.png', exact: true })
    .click();
  const countDark = async (locator: ReturnType<Page['locator']>) =>
    locator.evaluate(async (element: HTMLCanvasElement | HTMLImageElement) => {
      if (element instanceof HTMLImageElement) await element.decode();
      const canvas = document.createElement('canvas');
      canvas.width =
        element instanceof HTMLImageElement
          ? element.naturalWidth
          : element.width;
      canvas.height =
        element instanceof HTMLImageElement
          ? element.naturalHeight
          : element.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(element, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let dark = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i] < 100 && pixels[i + 3] > 0) dark++;
      return dark;
    });
  await expect(page.getByRole('button', { name: 'Apply edits' })).toBeEnabled();
  expect(await countDark(page.locator('.editor-stage canvas'))).toBeGreaterThan(
    100,
  );
  await page
    .locator('.editor-dialog')
    .screenshot({ path: 'artifacts/editor.png' });
  await page.getByRole('button', { name: 'Apply edits' }).click();
  await page.getByRole('button', { name: /Optimize images/ }).click();
  await expect(
    page.getByRole('button', { name: /Download all/ }),
  ).toBeEnabled();
  expect(await countDark(page.locator('.file-thumbnail'))).toBeGreaterThan(100);
  const downloadPromise = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download white.png', exact: true })
    .click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    'Portfolio-photo-pixeldesk-1.png',
  );
  await page.screenshot({
    path: 'artifacts/enhanced-workspace.png',
    fullPage: true,
  });
  await page.reload();
  await page.locator('summary').filter({ hasText: 'Watermark' }).click();
  await expect(page.getByLabel('WATERMARK TEXT', { exact: true })).toHaveValue(
    'PixelDesk',
  );
});

test('custom width and size targeting work and unattainable targets report a warning', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .setInputFiles(await makeImage(page, 'noise.png', true));
  await page
    .getByLabel('MAXIMUM WIDTH', { exact: true })
    .selectOption('custom');
  await page.getByLabel('WIDTH IN PIXELS', { exact: true }).fill('333');
  await page.locator('summary').filter({ hasText: 'Export options' }).click();
  await page.getByLabel('TARGET FILE SIZE (KB)', { exact: true }).fill('32');
  await page.getByRole('button', { name: /Optimize images/ }).click();
  await expect(
    page.getByRole('button', { name: /Download all/ }),
  ).toBeEnabled();
  const output = await inspectOutput(page);
  expect(output.width).toBe(333);
  expect(output.bytes).toBeLessThanOrEqual(32 * 1024);
  await expect(page.locator('.file-warning')).toHaveCount(0);
  await page.getByLabel('TARGET FILE SIZE (KB)', { exact: true }).fill('1');
  await page.getByRole('button', { name: /Optimize images/ }).click();
  await expect(
    page.getByRole('button', { name: /Download all/ }),
  ).toBeEnabled();
  await expect(page.locator('.file-warning')).toContainText(
    'Above 1 KB target',
  );
  await page.reload();
  await expect(page.getByLabel('WIDTH IN PIXELS', { exact: true })).toHaveValue(
    '333',
  );
});

test('batch stop keeps completed images and resume processes only pending images', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      toBlob.call(
        this,
        (blob) => setTimeout(() => callback(blob), 400),
        type,
        quality,
      );
    };
  });
  await page.goto('/');
  const source = await makeImage(page);
  await page
    .locator('input[type=file]')
    .setInputFiles([
      source,
      { ...source, name: 'second.png' },
      { ...source, name: 'third.png' },
    ]);
  await page.getByRole('button', { name: /Optimize images/ }).click();
  await page.getByRole('button', { name: 'Stop batch', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Batch stopped');
  await expect(page.locator('.savings-badge')).toHaveCount(1);
  const firstResult = await page
    .locator('.file-thumbnail')
    .first()
    .getAttribute('src');
  await page.getByRole('button', { name: /Optimize images/ }).click();
  await expect(
    page.getByRole('button', { name: /Download all/ }),
  ).toBeEnabled();
  await expect(page.locator('.savings-badge')).toHaveCount(3);
  expect(
    await page.locator('.file-thumbnail').first().getAttribute('src'),
  ).toBe(firstResult);
});

test('search and sorting do not change processing order or clear unrelated files', async ({
  page,
}) => {
  await page.goto('/');
  const source = await makeImage(page);
  await page.locator('input[type=file]').setInputFiles([
    { ...source, name: 'zebra.png' },
    { ...source, name: 'apple.png' },
  ]);
  await page.getByLabel('Sort images').selectOption('name');
  await expect(page.locator('.file-info h3').first()).toHaveText('apple.png');
  await page.getByRole('searchbox', { name: 'Search images' }).fill('zebra');
  await expect(page.locator('.file-row')).toHaveCount(1);
  await page.getByRole('button', { name: /Optimize images/ }).click();
  await expect(
    page.getByRole('button', { name: /Download all/ }),
  ).toBeEnabled();
  await page.getByRole('searchbox', { name: 'Search images' }).fill('missing');
  await expect(page.locator('.no-results')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search images' }).fill('');
  await expect(page.locator('.file-row')).toHaveCount(2);
  await expect(page.locator('.savings-badge')).toHaveCount(2);
  await page.screenshot({
    path: 'artifacts/enhanced-workspace.png',
    fullPage: true,
  });
});

test('removing and adding identically named files keeps ZIP filenames unique', async ({
  page,
}) => {
  await page.goto('/');
  const file = await makeImage(page, 'same.png');
  await page.locator('input[type=file]').setInputFiles([file, file]);
  await page.getByRole('button', { name: /Optimize images/ }).click();
  await expect(
    page.getByRole('button', { name: /Download all/ }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Remove same.png', exact: true })
    .first()
    .click();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: /Optimize images/ }).click();
  await expect(
    page.getByRole('button', { name: /Download all/ }),
  ).toBeEnabled();
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download all/ }).click();
  const stream = await (await pendingDownload).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  expect(Object.keys(zip.files)).toEqual([
    'same-pixeldesk-2.webp',
    'same-pixeldesk-3.webp',
  ]);
});

test('mobile editor and expanded settings fit the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .setInputFiles(await makeImage(page, 'mobile.png', true));
  await page.locator('summary').filter({ hasText: 'Watermark' }).click();
  await page.getByLabel('WATERMARK TEXT', { exact: true }).fill('My portfolio');
  await page
    .getByRole('button', { name: 'Edit mobile.png', exact: true })
    .click();
  await page.getByRole('button', { name: '4:5', exact: true }).click();
  await expect(page.locator('.editor-dialog')).toBeVisible();
  expect(
    await page
      .locator('.editor-dialog')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page
    .locator('.editor-dialog')
    .screenshot({ path: 'artifacts/mobile-editor.png' });
  await page.getByRole('button', { name: 'Apply edits', exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('legacy preferences migrate safely and invalid persisted settings cannot break the app', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'pixeldesk-settings',
      JSON.stringify({ format: 'jpeg', quality: 90, maxWidth: 1080 }),
    ),
  );
  await page.goto('/');
  await expect(page.getByLabel('OUTPUT FORMAT', { exact: true })).toHaveValue(
    'jpeg',
  );
  await page.locator('summary').filter({ hasText: 'Watermark' }).click();
  await expect(page.getByLabel('WATERMARK TEXT', { exact: true })).toHaveValue(
    '',
  );
  await page.evaluate(() =>
    localStorage.setItem(
      'pixeldesk-settings',
      JSON.stringify({
        format: 'evil',
        quality: -100,
        maxWidth: 999999,
        watermark: { text: {}, color: 'bad' },
      }),
    ),
  );
  // Navigate within the same document so the legacy init script is not run again.
  const settings = await page.evaluate(async () => {
    const module = await import('/src/settings.ts');
    return module.initialSettings();
  });
  expect(settings.format).toBe('webp');
  expect(settings.quality).toBe(10);
  expect(settings.maxWidth).toBe(8192);
  expect(settings.watermark.text).toBe('');
});
