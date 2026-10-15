import { open as openFile, readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import type { Privacy, VideoResource } from "./settings.js";

const CHUNK = 8 * 1024 * 1024;
const RETRIES = 5;

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};
const typeOf = (path: string): string => TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";

const API = "https://www.googleapis.com";

const failure = async (what: string, res: Response): Promise<Error> => {
  const text = await res.text();
  let message = text.trim().slice(0, 500);
  try {
    const { error } = JSON.parse(text) as { error?: { message?: string; errors?: { reason?: string }[] } };
    if (error?.message) message = error.message;
    if (error?.errors?.[0]?.reason) message += ` (${error.errors[0].reason})`;
  } catch {}
  return new Error(`${what} failed: HTTP ${res.status}: ${message}`);
};

export interface UploadOptions {
  progress?: (sent: number, total: number) => void;
}

export interface Uploaded {
  id: string;
  status?: { privacyStatus?: Privacy };
}

export const uploadVideo = async (file: string, video: VideoResource, token: string, options: UploadOptions = {}): Promise<Uploaded> => {
  const { progress } = options;
  const total = (await stat(file)).size;
  if (total === 0) throw new Error(`${file} is empty`);
  const type = typeOf(file);
  const start = await fetch(`${API}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(total),
      "X-Upload-Content-Type": type,
    },
    body: JSON.stringify(video),
  });
  if (!start.ok) throw await failure("the upload", start);
  const session = start.headers.get("location");
  if (!session) throw new Error("the upload failed: YouTube gave no upload URL");

  const put = (range: string, body?: Buffer): Promise<Response> =>
    fetch(session, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": type, "Content-Range": range },
      body: body ?? Buffer.alloc(0),
    });
  const handle = await openFile(file, "r");
  try {
    let offset = 0;
    let retries = 0;
    let query = false;
    for (;;) {
      let res: Response | undefined;
      try {
        if (query) res = await put(`bytes */${total}`);
        else {
          const size = Math.min(CHUNK, total - offset);
          const body = Buffer.alloc(size);
          await handle.read(body, 0, size, offset);
          res = await put(`bytes ${offset}-${offset + size - 1}/${total}`, body);
        }
      } catch {}
      if (res?.status === 200 || res?.status === 201) {
        progress?.(total, total);
        return (await res.json()) as Uploaded;
      }
      if (res?.status === 308) {
        const last = res.headers.get("range")?.match(/-(\d+)$/)?.[1];
        const arrived = last === undefined ? 0 : Number(last) + 1;
        if (arrived > offset) retries = 0;
        offset = arrived;
        query = false;
        progress?.(offset, total);
        continue;
      }
      if (res && res.status < 500) throw await failure("the upload", res);
      if (++retries > RETRIES) throw res ? await failure("the upload", res) : new Error("the upload failed: the connection to YouTube failed");
      await new Promise((go) => setTimeout(go, 1000 * 2 ** (retries - 1)));
      query = true;
    }
  } finally {
    await handle.close();
  }
};

export const setThumbnail = async (id: string, file: string, token: string): Promise<void> => {
  const res = await fetch(`${API}/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(id)}&uploadType=media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": typeOf(file) },
    body: await readFile(file),
  });
  if (!res.ok) throw await failure("the thumbnail", res);
};
