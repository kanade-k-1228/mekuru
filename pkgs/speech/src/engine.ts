export const httpClient =
  (url: string, name: string, help: string) =>
  async (path: string, init?: RequestInit): Promise<Response> => {
    const res = await fetch(url + path, { ...init, signal: AbortSignal.timeout(300_000) }).catch((e: unknown) => {
      const reason = e instanceof Error ? e.message : String(e);
      throw new Error(`${name} is not reachable at ${url} (${reason}).\n${help}`);
    });
    if (!res.ok) throw new Error(`${name} ${path.split("?")[0]}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res;
  };

export const limit = (concurrency: number) => {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("concurrency must be a positive integer");
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (running < concurrency) running++;
    else await new Promise<void>((go) => waiting.push(go));
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  };
};
