/** Observe position as well as size: split reordering can move an unchanged rect. */
export function watchElementBounds(element: Element, changed: () => void) {
  let frame = 0, previous = "", stopped = false;
  const check = () => {
    if (stopped) return;
    const r = element.getBoundingClientRect();
    const next = [r.left, r.top, r.width, r.height].map(Math.round).join(":");
    if (next !== previous) { previous = next; changed(); }
    frame = requestAnimationFrame(check);
  };
  frame = requestAnimationFrame(check);
  return () => { stopped = true; cancelAnimationFrame(frame); };
}
