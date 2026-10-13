const NETWORK_ERROR_PATTERN = new RegExp(
  [
    "network request failed",
    "network error",
    "failed to fetch",
    "fetch failed",
    "unknownhostexception",
    "unable to resolve host",
    "no address associated with hostname",
    "name or service not known",
    "temporary failure in name resolution",
    "eai_again",
    "enotfound",
    "econn(?:refused|reset|timedout)",
    "network is unreachable",
    "connection (?:refused|reset|timed out)",
    "socket hang up",
  ].join("|"),
  "i",
);

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause;
    const causeMessage =
      cause instanceof Error ? cause.message : String(cause ?? "");
    return `${error.name} ${error.message} ${causeMessage}`;
  }
  if (typeof error === "object" && error !== null) {
    const value = error as {
      name?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    return `${String(value.name ?? "")} ${String(value.message ?? "")} ${String(value.cause ?? "")}`;
  }
  return String(error ?? "");
}

export function isRetryableNetworkError(error: unknown): boolean {
  const text = getErrorText(error);
  return (
    (error instanceof Error && error.name === "AbortError") ||
    /timed?\s*out|timeout/i.test(text) ||
    NETWORK_ERROR_PATTERN.test(text)
  );
}

/**
 * Message for a completed HTTP error response. Server 5xx bodies often carry
 * raw internals (Prisma errors, proxy HTML), so those never reach the user.
 */
export function getFriendlyHttpMessage(
  status: number,
  serverMessage: string | null,
): string {
  if (status === 502 || status === 503 || status === 504) {
    return "The FCP server isn't responding right now. Please try again in a few minutes.";
  }
  if (status >= 500) {
    return "Something went wrong on the FCP server. Please try again. If it keeps happening, contact support.";
  }
  if (status === 413) {
    return "That file is too large to upload.";
  }
  if (serverMessage && !/^\s*</.test(serverMessage)) return serverMessage;
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That item could not be found. It may have been removed.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  return `Request failed (${status}). Please try again.`;
}

export function getFriendlyNetworkError(error: unknown): Error | null {
  if (!isRetryableNetworkError(error)) return null;

  const text = getErrorText(error);
  if (/timed?\s*out|timeout|aborterror/i.test(text)) {
    return new Error(
      "The connection timed out. Check your connection and try again.",
    );
  }

  return new Error(
    "Couldn't connect to FCP. Check your internet connection and try again. If it keeps happening, contact support.",
  );
}
