/**
 * Cloudinary Image Optimization Utilities
 *
 * Transforms Cloudinary URLs to use optimized versions:
 * - Thumbnails: w_300,h_300,c_fill,q_auto,f_auto
 * - Detail views: w_900,q_auto,f_auto
 * - Never loads full-size originals in list views
 */

const CLOUDINARY_REGEX =
  /^https?:\/\/res\.cloudinary\.com\/([^\/]+)\/image\/upload\/?(.*)$/;

type ImageSize = "thumbnail" | "detail" | "original";

const TRANSFORMATIONS: Record<ImageSize, string> = {
  thumbnail: "w_300,h_300,c_fill,q_auto,f_auto",
  detail: "w_900,q_auto,f_auto",
  original: "", // No transformation
};

/**
 * Optimize a Cloudinary image URL with appropriate transformations
 */
export function optimizeCloudinaryUrl(
  url: string | undefined | null,
  size: ImageSize = "thumbnail",
): string | null {
  if (!url) return null;

  // Check if it's a Cloudinary URL
  const match = url.match(CLOUDINARY_REGEX);
  if (!match) {
    // Not a Cloudinary URL, return as-is
    return url;
  }

  const [, cloudName, pathAfterUpload] = match;
  const transformation = TRANSFORMATIONS[size];

  if (!transformation) {
    return url;
  }

  // Insert transformation after /upload/
  // Handle case where there might already be transformations
  const parts = pathAfterUpload.split("/");

  // Check if first part looks like existing transformations (contains ,)
  // If so, replace them; otherwise insert
  if (parts[0] && parts[0].includes(",")) {
    // Replace existing transformations
    parts[0] = transformation;
  } else {
    // Insert new transformations at the beginning
    parts.unshift(transformation);
  }

  return `https://res.cloudinary.com/${cloudName}/image/upload/${parts.join("/")}`;
}

/**
 * Get optimized image URL for list/grid views (thumbnails)
 */
export function getThumbnailUrl(url: string | undefined | null): string | null {
  return optimizeCloudinaryUrl(url, "thumbnail");
}

/**
 * Get optimized image URL for detail/full-screen views
 */
export function getDetailUrl(url: string | undefined | null): string | null {
  return optimizeCloudinaryUrl(url, "detail");
}

/**
 * Get placeholder color based on name initial (for avatar fallbacks)
 */
export function getAvatarColor(name: string = ""): string {
  const colors = [
    "#FF6B6B", // Red
    "#4ECDC4", // Teal
    "#45B7D1", // Blue
    "#96CEB4", // Green
    "#FFEAA7", // Yellow
    "#DDA0DD", // Plum
    "#98D8C8", // Mint
    "#F7DC6F", // Gold
    "#BB8FCE", // Purple
    "#85C1E9", // Sky Blue
  ];

  const charCode = (name.charAt(0) || "A").toUpperCase().charCodeAt(0);
  return colors[charCode % colors.length];
}

/**
 * Get initials from a name for avatar fallback
 */
export function getInitials(name: string = ""): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (parts[0]?.[0] || "?").toUpperCase();
}
