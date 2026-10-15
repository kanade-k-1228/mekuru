export const observeSize = (el: Element, onSize: (size: { width: number; height: number }) => void): (() => void) => {
  const ro = new ResizeObserver(([e]) => onSize({ width: e.contentRect.width, height: e.contentRect.height }));
  ro.observe(el);
  return () => ro.disconnect();
};
