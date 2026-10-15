const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export const formatTime = (sec: number): string => {
  const s = Math.max(0, sec);
  const cs = Math.floor(s * 100 + 1e-6);
  const c = cs % 100;
  const total = Math.floor(cs / 100);
  const ss = total % 60;
  const mm = Math.floor(total / 60) % 60;
  const hh = Math.floor(total / 3600);
  const base = `${pad(mm)}:${pad(ss)}.${pad(c)}`;
  return hh > 0 ? `${hh}:${base}` : base;
};

export const formatClock = (sec: number, fine = false): string => {
  const s = Math.max(0, sec);
  if (fine) {
    const ds = Math.round(s * 10);
    const total = Math.floor(ds / 10);
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}.${ds % 10}`;
  }
  const total = Math.round(s);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};
