import { Platform } from "react-native";

/**
 * Dynamically load ImageManipulator to handle missing native module.
 * Use `any` here because TypeScript types may not exist in this project.
 */
let ImageManipulator: any | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ImageManipulator = require("expo-image-manipulator");
} catch {
  console.warn(
    "ImageManipulator native module not available - compression disabled",
  );
}

export type CompressedImage = {
  uri: string;
  width: number;
  height: number;
  base64?: string;
};

export type CompressOptions = {
  /** Maximum width in pixels (default: 1600) */
  maxWidth?: number;
  /** Maximum height in pixels (default: 1600) */
  maxHeight?: number;
  /** JPEG quality 0-1 (default: 0.7) */
  quality?: number;
  /** Include base64 data (default: false) */
  includeBase64?: boolean;
};

/**
 * Compress and resize an image before upload
 *
 * Default settings:
 * - Max width: 1600px
 * - Quality: 0.7 (70%)
 * - Format: JPEG
 *
 * This significantly reduces upload size while maintaining reasonable quality
 * for site photos and documentation purposes.
 */
export async function compressImage(
  uri: string,
  options: CompressOptions = {},
): Promise<CompressedImage> {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.7,
    includeBase64 = false,
  } = options;

  // Skip compression on web (not supported) or if native module unavailable
  if (Platform.OS === "web" || !ImageManipulator) {
    return {
      uri,
      width: 0,
      height: 0,
    };
  }

  try {
    // First, get the original image dimensions
    const originalInfo = await ImageManipulator.manipulateAsync(uri, [], {
      format: ImageManipulator.SaveFormat.JPEG,
    });

    const originalWidth = originalInfo.width;
    const originalHeight = originalInfo.height;

    // Calculate resize dimensions while maintaining aspect ratio
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actions: any[] = [];

    if (originalWidth > maxWidth || originalHeight > maxHeight) {
      const widthRatio = maxWidth / originalWidth;
      const heightRatio = maxHeight / originalHeight;
      const scale = Math.min(widthRatio, heightRatio);

      const newWidth = Math.round(originalWidth * scale);
      const newHeight = Math.round(originalHeight * scale);

      actions.push({
        resize: {
          width: newWidth,
          height: newHeight,
        },
      });
    }

    // Apply compression
    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: includeBase64,
    });

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      base64: result.base64,
    };
  } catch (error) {
    console.warn("Image compression failed, using original:", error);
    // Return original on failure
    return {
      uri,
      width: 0,
      height: 0,
    };
  }
}

/**
 * Compress multiple images in sequence
 */
export async function compressImages(
  uris: string[],
  options: CompressOptions = {},
): Promise<CompressedImage[]> {
  const results: CompressedImage[] = [];

  for (const uri of uris) {
    const compressed = await compressImage(uri, options);
    results.push(compressed);
  }

  return results;
}

/**
 * Estimate compressed file size (rough approximation)
 * Useful for progress indicators
 */
export function estimateCompressedSize(
  originalSizeBytes: number,
  quality: number = 0.7,
): number {
  // JPEG compression typically achieves 10:1 to 20:1 ratio
  // This is a rough estimate based on quality setting
  const compressionFactor = 0.1 + quality * 0.3; // 0.1 at q=0, 0.4 at q=1
  return Math.round(originalSizeBytes * compressionFactor);
}
