/**
 * Image Generator — Architecture Finale
 *
 * Produces image assets (thumbnails, charts, screenshots).
 * Uses Sharp for image processing when available.
 * Path: lib/engine/runtime/assets/generators/image.ts
 */

import { saveAssetFile } from "../file-storage";
import type { AssetFileInfo } from "../types";

interface GenerateImageInput {
  tenantId: string;
  runId: string;
  fileName: string;
  data: Buffer;
  format?: "png" | "jpeg" | "webp";
  width?: number;
  height?: number;
  quality?: number;
}

interface GenerateImageResult {
  file: AssetFileInfo;
}

/**
 * Save an image buffer as an asset file.
 * If Sharp is available, optionally resize/reformat.
 */
export async function generateImageArtifact(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  const format = input.format ?? "png";
  const mimeType = `image/${format}`;
  const fileName = input.fileName.endsWith(`.${format}`)
    ? input.fileName
    : `${input.fileName}.${format}`;

  let outputBuffer = input.data;

  if (input.width || input.height || input.quality) {
    outputBuffer = await processWithSharp(input.data, {
      width: input.width,
      height: input.height,
      format,
      quality: input.quality ?? 80,
    });
  }

  const file = saveAssetFile({
    tenantId: input.tenantId,
    runId: input.runId,
    assetId: `img_${Date.now()}`,
    fileName,
    mimeType,
    content: outputBuffer,
  });

  return { file };
}

async function processWithSharp(
  data: Buffer,
  options: { width?: number; height?: number; format: string; quality: number },
): Promise<Buffer> {
  try {
    // Dynamic import — Sharp is an optional peer dependency
    const sharp = (await import("sharp")).default;
    let pipeline = sharp(data);

    if (options.width || options.height) {
      pipeline = pipeline.resize(options.width, options.height, { fit: "inside" });
    }

    switch (options.format) {
      case "jpeg":
        pipeline = pipeline.jpeg({ quality: options.quality });
        break;
      case "webp":
        pipeline = pipeline.webp({ quality: options.quality });
        break;
      case "png":
      default:
        pipeline = pipeline.png();
        break;
    }

    return await pipeline.toBuffer();
  } catch {
    console.warn("[ImageGenerator] Sharp not available, returning raw buffer");
    return data;
  }
}

/**
 * Generate a simple placeholder image (solid color).
 * Useful for testing without Sharp.
 */
export async function generatePlaceholderImage(
  input: Omit<GenerateImageInput, "data"> & { color?: string },
): Promise<GenerateImageResult> {
  const width = input.width ?? 200;
  const height = input.height ?? 200;

  try {
    const sharp = (await import("sharp")).default;
    const color = input.color ?? "#1a1a2e";
    const buffer = await sharp({
      create: { width, height, channels: 4, background: color },
    }).png().toBuffer();

    return generateImageArtifact({ ...input, data: buffer });
  } catch {
    const headerSize = 54;
    const pixelDataSize = width * height * 3;
    const buffer = Buffer.alloc(headerSize + pixelDataSize, 0);
    return generateImageArtifact({ ...input, data: buffer, format: "png" });
  }
}
