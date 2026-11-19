import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

test('sample images resize, encode, compare, and download as a valid ZIP', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Optimize images' }),
  ).toBeDisabled();
  await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Try sample images' }).click();
  await expect(page.locator('.file-row')).toHaveCount(3);
  await page.getByRole('button', { name: /Optimize images/ }).click();
  await expect(
    page.getByRole('button', { name: /Download all/ }),
  ).toBeEnabled();
  await expect(page.locator('.file-info').first()).toContainText('1600 × 1067');
  await page
    .getByRole('button', { name: 'Compare Alpine-morning.jpg' })
    .click();
  await expect(page.locator('.compare-dialog')).toBeVisible();
  await page
    .getByRole('slider', { name: 'Before and after comparison' })
    .fill('25');
  await page.keyboard.press('Escape');
  await expect(page.locator('.compare-dialog')).not.toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download all/ }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('pixeldesk-images.zip');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  expect(Object.keys(zip.files)).toHaveLength(3);
  for (const entry of Object.values(zip.files)) {
    expect(entry.name).toMatch(/\.webp$/);
    const bytes = await entry.async('nodebuffer');
    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
    expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
  }
  await page.screenshot({ path: 'artifacts/processed.png', fullPage: true });
  await page.getByLabel('OUTPUT FORMAT', { exact: true }).selectOption('png');
  await expect(
    page.getByRole('slider', { name: 'Image quality' }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: /Optimize images/ }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

test('invalid inputs, transparency, duplicate names, and setting persistence', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'invalid.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
  await expect(page.getByRole('alert')).toContainText(
    'use a JPG, PNG, or WebP',
  );
  const png = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 12;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'red';
    context.fillRect(0, 0, 12, 12);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const file = {
    name: 'same.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  };
  await page.locator('input[type=file]').setInputFiles([file, file]);
  await page.getByLabel('OUTPUT FORMAT', { exact: true }).selectOption('jpeg');
  await page.getByRole('button', { name: /Optimize images/ }).click();
  await expect(
    page.getByRole('button', { name: /Download all/ }),
  ).toBeEnabled();
  const result = await page
    .locator('.file-thumbnail')
    .first()
    .evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      const canvas = document.createElement('canvas');
      canvas.width = element.naturalWidth;
      canvas.height = element.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(element, 0, 0);
      return {
        width: canvas.width,
        height: canvas.height,
        pixel: Array.from(context.getImageData(23, 6, 1, 1).data),
      };
    });
  expect(result.width).toBe(24);
  expect(result.height).toBe(12);
  expect(result.pixel.slice(0, 3).every((channel) => channel >= 240)).toBe(
    true,
  );
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download all/ }).click();
  const downloaded = await downloadEvent;
  const stream = await downloaded.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  expect(Object.keys(zip.files)).toEqual([
    'same-pixeldesk-1.jpg',
    'same-pixeldesk-2.jpg',
  ]);
  await page.reload();
  await expect(page.getByLabel('OUTPUT FORMAT', { exact: true })).toHaveValue(
    'jpeg',
  );
  await expect(page.locator('.file-row')).toHaveCount(0);
});

test('mobile layout, help dialog, and clearing images', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Your images. A little lighter.' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('button', { name: 'How it works' }).click();
  await expect(
    page.getByRole('heading', { name: 'From big to just right.' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: "Got it. Let's make something." })
    .click();
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Try sample images' }).click();
  await expect(page.locator('.file-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(page.locator('.file-row')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Choose images' }),
  ).toBeVisible();
});
