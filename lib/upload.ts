import { Platform } from "react-native";

export type UploadProgressHandler = (percent: number) => void;

export async function uploadWithProgress(
  url: string,
  file: { uri: string; name: string; type: string },
  formFields: Record<string, string | undefined> = {},
  headers: Record<string, string> = {},
  onProgress?: UploadProgressHandler,
): Promise<any> {
  // Use XMLHttpRequest for progress on mobile
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

      for (const k of Object.keys(headers)) {
        xhr.setRequestHeader(k, headers[k]);
      }

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && onProgress) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          onProgress(pct);
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
          } else {
            const msg = xhr.responseText || `HTTP ${xhr.status}`;
            reject(new Error(msg));
          }
        }
      };

      xhr.onerror = (ev) => {
        reject(new Error("Network request failed"));
      };

      // Send
      xhr.send(fd);
    } catch (e) {
      reject(e);
    }
  });
}
