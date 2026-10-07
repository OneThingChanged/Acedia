export function zoomImageView(view, factor, anchor = { x: 0, y: 0 }) {
  const scale = Math.max(0.05, Math.min(16, view.scale * factor));
  const ratio = scale / view.scale;
  return { scale, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio };
}

export function createImageZoom(viewport, image, controls) {
  const out = controls.querySelector('[data-image-zoom="out"]');
  const fit = controls.querySelector('[data-image-zoom="fit"]');
  const zoomIn = controls.querySelector('[data-image-zoom="in"]');
  const pointers = new Map();
  let view = { scale: 1, x: 0, y: 0 }, loaded = false;
  function render() {
    if (!loaded) return;
    image.style.width = `${image.naturalWidth * view.scale}px`;
    image.style.height = `${image.naturalHeight * view.scale}px`;
    image.style.transform = `translate(-50%, -50%) translate(${view.x}px, ${view.y}px)`;
    fit.textContent = `${Math.round(view.scale * 100)}%`;
    out.disabled = view.scale <= 0.05;
    zoomIn.disabled = view.scale >= 16;
    viewport.dataset.imageScale = String(view.scale);
    viewport.dataset.imagePanX = String(view.x);
    viewport.dataset.imagePanY = String(view.y);
  }
  function reset() {
    if (!loaded || viewport.hidden) return;
    const scale = Math.min(1, Math.max(0.05, Math.min((viewport.clientWidth - 24) / image.naturalWidth, (viewport.clientHeight - 24) / image.naturalHeight)));
    view = { scale, x: 0, y: 0 }; render();
  }
  function zoom(factor, anchor) { if (loaded) { view = zoomImageView(view, factor, anchor); render(); } }
  function point(event) { const rect = viewport.getBoundingClientRect(); return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }; }
  image.addEventListener('load', () => {
    if (viewport.hidden || !image.naturalWidth) return;
    loaded = true; controls.hidden = false; fit.disabled = false; reset();
  });
  out.addEventListener('click', () => zoom(1 / 1.25));
  zoomIn.addEventListener('click', () => zoom(1.25));
  fit.addEventListener('click', reset);
  viewport.addEventListener('dblclick', reset);
  viewport.addEventListener('wheel', event => { if (!loaded) return; event.preventDefault(); zoom(Math.exp(Math.max(-1, Math.min(1, -event.deltaY * 0.002))), point(event)); }, { passive: false });
  viewport.addEventListener('pointerdown', event => {
    if (!loaded || event.button !== 0) return;
    event.preventDefault(); viewport.setPointerCapture(event.pointerId); pointers.set(event.pointerId, point(event));
  });
  viewport.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const before = [...pointers.values()];
    const previous = pointers.get(event.pointerId);
    const next = point(event); pointers.set(event.pointerId, next);
    if (pointers.size === 1) { view.x += next.x - previous.x; view.y += next.y - previous.y; }
    else {
      const after = [...pointers.values()];
      const midpoint = points => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
      const distance = points => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const oldCenter = midpoint(before), newCenter = midpoint(after);
      if (distance(before) > 0) view = zoomImageView(view, distance(after) / distance(before), oldCenter);
      view.x += newCenter.x - oldCenter.x; view.y += newCenter.y - oldCenter.y;
    }
    render();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(name, event => pointers.delete(event.pointerId));
  window.addEventListener('keydown', event => {
    if (controls.hidden || !loaded || !['+', '=', '-', '0'].includes(event.key)) return;
    event.preventDefault(); if (event.key === '0') reset(); else zoom(event.key === '-' ? 1 / 1.25 : 1.25);
  });
  new ResizeObserver(() => { if (loaded && pointers.size === 0) reset(); }).observe(viewport);
  return { clear() {
    loaded = false; pointers.clear(); controls.hidden = true;
    for (const button of [out, fit, zoomIn]) button.disabled = true;
    image.removeAttribute('style');
    delete viewport.dataset.imageScale; delete viewport.dataset.imagePanX; delete viewport.dataset.imagePanY;
  } };
}
