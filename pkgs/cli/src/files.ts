import { resolve, sep } from "node:path";
export const sendFile = async (req: Request, path: string): Promise<Response> => {
  const file = Bun.file(path);
  if (!(await file.exists())) return new Response(null, { status: 404 });
  const size = file.size;
  const headers = { "content-type": file.type, "accept-ranges": "bytes", "cache-control": "no-cache" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = Math.max(0, range[1] ? Number(range[1]) : size - Number(range[2]));
    const end = Math.min(size - 1, range[1] && range[2] ? Number(range[2]) : size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(req.method === "HEAD" ? null : file.slice(start, end + 1), {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }
  return new Response(req.method === "HEAD" ? null : file, { headers: { ...headers, "content-length": String(size) } });
};

export const inside = (dir: string, rel: string): string | undefined => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return undefined;
  }
  const path = resolve(dir, `.${sep}${decoded}`);
  return path === dir || path.startsWith(dir + sep) ? path : undefined;
};
