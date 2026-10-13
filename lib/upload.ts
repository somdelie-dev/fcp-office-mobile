import {
  getFriendlyHttpMessage,
  getFriendlyNetworkError,
  isRetryableNetworkError,
} from "./apiErrors";

export type UploadProgressHandler = (percent: number) => void;

const UPLOAD_TIMEOUT_MS = 60000;
const MAX_ATTEMPTS = 3;

function singleAttemptUpload(
  url: string,
  file: { uri: string; name: string; type: string },
  formFields: Record<string, string | undefined>,
  headers: Record<string, string>,
  onProgress?: UploadProgressHandler,
): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      const fd: any = new FormData();
      // React Native expects the file object to have uri/name/type
      fd.append("file", {
        uri: file.uri,
        name: file.name,
        type: file.type,
      } as any);
      for (const k of Object.keys(formFields)) {
        const v = formFields[k];
        if (v !== undefined && v !== null) fd.append(k, v);
      }

      xhr.open("POST", url);
      xhr.timeout = UPLOAD_TIMEOUT_MS;

      for (const k of Object.keys(headers)) {
        xhr.setRequestHeader(k, headers[k]);
      }

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && ev.total > 0 && onProgress) {
          // Android can report `total` as the file size while `loaded` counts
          // the whole multipart body, which pushed the UI past 100%.
          const pct = Math.round((ev.loaded / ev.total) * 100);
          onProgress(Math.min(100, Math.max(0, pct)));
        }
      };

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = xhr.responseText
                ? JSON.parse(xhr.responseText)
                : null;
              resolve(json);
            } catch (e) {
              resolve(xhr.responseText);
            }
          } else if (xhr.status === 0) {
            // Connection dropped before any response; onerror/ontimeout
            // report it, so don't reject twice with a misleading status.
            return;
          } else {
            let serverMessage: string | null = null;
            try {
              const body = JSON.parse(xhr.responseText);
              serverMessage = body?.error || body?.message || null;
            } catch {
              serverMessage = null;
            }
            if (xhr.status >= 500) {
              console.warn(`[upload] ${xhr.status}:`, xhr.responseText?.slice(0, 300));
            }
            const err: any = new Error(
              getFriendlyHttpMessage(xhr.status, serverMessage),
            );
            err.status = xhr.status;
            reject(err);
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error("Network request failed"));
      };

      xhr.ontimeout = () => {
        reject(new Error("Request timed out."));
      };

      // Send
      xhr.send(fd);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Returns true if this error is a transient network failure worth retrying
 * (timeout or connectivity drop), as opposed to a completed HTTP error response.
 */
export async function uploadWithProgress(
  url: string,
  file: { uri: string; name: string; type: string },
  formFields: Record<string, string | undefined> = {},
  headers: Record<string, string> = {},
  onProgress?: UploadProgressHandler,
): Promise<any> {
  let attempt = 0;
  let lastError: any = null;

  while (++attempt <= MAX_ATTEMPTS) {
    try {
      if (onProgress) onProgress(0);
      return await singleAttemptUpload(
        url,
        file,
        formFields,
        headers,
        onProgress,
      );
    } catch (e: any) {
      lastError = e;

      if (attempt < MAX_ATTEMPTS && isRetryableNetworkError(e)) {
        // Exponential backoff: 500ms, 1000ms, 2000ms
        const backoff = 500 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      throw getFriendlyNetworkError(e) ?? e;
    }
  }

  throw lastError ?? new Error("Upload failed");
}
