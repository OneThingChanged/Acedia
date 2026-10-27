import { OFFICE_COLORS, OFFICE_ROLE_COLORS, officeAvatar, officeState, type OfficeSeat } from './pixelOffice';

// Pixel Agents assets, pinned and licensed in public/pixel-agents/NOTICE.txt.
// Native 16x32 character frames: down/up/right rows; type=3,4; read=5,6.
const furniture = (item: string, file = item) => `furniture/${item}/${file}.png`;
export const OFFICE_ASSETS = {
  desk: furniture('DESK', 'DESK_FRONT'), chair: furniture('CUSHIONED_CHAIR', 'CUSHIONED_CHAIR_BACK'),
  pc0: furniture('PC', 'PC_FRONT_OFF'), pc1: furniture('PC', 'PC_FRONT_ON_1'),
  pc2: furniture('PC', 'PC_FRONT_ON_2'), pc3: furniture('PC', 'PC_FRONT_ON_3'),
  shelf: furniture('BOOKSHELF'), board: furniture('WHITEBOARD'), plant: furniture('PLANT'),
  sofa: furniture('SOFA', 'SOFA_FRONT'), clock: furniture('CLOCK'), floor: 'floors/floor_0.png',
  ...Object.fromEntries(Array.from({ length: 6 }, (_, n) => [`char${n}`, `characters/char_${n}.png`])),
};
export type OfficeImages = Map<string, HTMLImageElement>;
let assetPromise: Promise<OfficeImages> | undefined;
export function loadOfficeAssets(): Promise<OfficeImages> {
  // One image/decode per asset across both placements and every state update.
  return assetPromise ??= Promise.all(Object.entries(OFFICE_ASSETS).map(([key, relative]) => new Promise<[string, HTMLImageElement | null]>(resolve => {
    const image = new Image();
    image.onload = () => resolve([key, image]); image.onerror = () => resolve([key, null]);
    image.src = `${import.meta.env.BASE_URL || './'}pixel-agents/${relative}`;
  }))).then(values => new Map(values.filter((value): value is [string, HTMLImageElement] => value[1] !== null)));
}

function sprite(ctx: CanvasRenderingContext2D, images: OfficeImages, key: string, x: number, y: number, scale = 2) {
  const image = images.get(key);
  if (image) ctx.drawImage(image, Math.round(x), Math.round(y), image.width * scale, image.height * scale);
}
export function officeBackground(width: number, height: number, seats: OfficeSeat[], images: OfficeImages): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!; ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#77573f'; ctx.fillRect(0, 0, width, height);
  const tile = images.get('floor');
  if (tile) {
    ctx.globalAlpha = .17;
    for (let y = 48; y < height; y += 32) for (let x = 0; x < width; x += 32) ctx.drawImage(tile, x, y, 32, 32);
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = '#614632'; ctx.lineWidth = 1;
  for (let y = 48; y < height; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  ctx.fillStyle = '#253b49'; ctx.fillRect(0, 0, width, 47);
  ctx.fillStyle = '#1b2e3c';
  for (let x = 0; x < width; x += 32) ctx.fillRect(x, 0, 2, 47);
  ctx.fillStyle = '#b08b60'; ctx.fillRect(0, 47, width, 5);
  sprite(ctx, images, 'shelf', 16, 7, 1.5); sprite(ctx, images, 'board', width / 2 - 32, 2, 1.5);
  sprite(ctx, images, 'clock', width - 38, 7, 1.5); sprite(ctx, images, 'plant', 5, height - 44, 1.5);
  sprite(ctx, images, 'sofa', width - 92, height - 37, 1.5);
  // Organization links represent real parentId, not creation provenance.
  const byId = new Map(seats.map(seat => [seat.agent.id, seat]));
  ctx.lineWidth = 2; ctx.setLineDash([3, 5]);
  for (const seat of seats) {
    if (seat.role === 'lead' || seat.role === 'manager') {
      ctx.globalAlpha = 1;
      ctx.fillStyle = OFFICE_ROLE_COLORS[seat.role] + '33'; ctx.fillRect(seat.x + 5, seat.y + 13, 114, 90);
      ctx.fillStyle = OFFICE_ROLE_COLORS[seat.role]; ctx.fillRect(seat.x + 5, seat.y + 13, 114, 2);
    }
    const parent = seat.parentId ? byId.get(seat.parentId) : null;
    if (!parent) continue;
    ctx.strokeStyle = ['#bfe0ce', '#e0c19f', '#bed0eb'][officeAvatar(seat.team) % 3]; ctx.globalAlpha = .35;
    ctx.beginPath(); ctx.moveTo(parent.x + 62, parent.y + 91); ctx.lineTo(parent.x + 62, seat.y - 9);
    ctx.lineTo(seat.x + 62, seat.y - 9); ctx.lineTo(seat.x + 62, seat.y + 42); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  for (const seat of seats) {
    ctx.fillStyle = '#0003'; ctx.fillRect(seat.x + 13, seat.y + 80, 99, 14);
    sprite(ctx, images, 'chair', seat.x + 46, seat.y + 68);
    sprite(ctx, images, 'desk', seat.x + 14, seat.y + 18);
  }
  return canvas;
}

export function drawOffice(ctx: CanvasRenderingContext2D, background: HTMLCanvasElement, images: OfficeImages, seats: OfficeSeat[], elapsed: number, reducedMotion: boolean, now = Date.now()) {
  ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, background.width, background.height); ctx.drawImage(background, 0, 0);
  for (const seat of seats) {
    const state = officeState(seat.agent, now), avatar = officeAvatar(seat.agent.id);
    const inactive = ['sleeping', 'stopped', 'disconnected'].includes(state);
    const frame = reducedMotion ? 0 : Math.floor(elapsed / 400 + avatar);
    sprite(ctx, images, inactive ? 'pc0' : `pc${frame % 3 + 1}`, seat.x + 46, seat.y - 2);
    const image = images.get(`char${avatar}`);
    let sx = 0, sy = 32, x = seat.x + 46, y = seat.y + 40;
    if (state === 'working') sx = 16 * (3 + frame % 2);
    else if (state === 'reading') sx = 16 * (5 + frame % 2);
    else if (state === 'idle' || state === 'done') {
      // Cosmetic movement only. It never changes host state or sends input.
      const walk = reducedMotion ? 0 : (elapsed / 1000 + avatar * 3) % 24;
      if (walk > 8 && walk < 20) {
        const step = Math.min(1, (walk - 8) / 2, (20 - walk) / 2);
        x -= 33 * step; y += 9 * step; sy = 64;
        sx = walk < 10 || walk > 18 ? 16 * (frame % 3) : 16;
      }
    } else if (state === 'waiting' || state === 'blocked') sy = 0;
    ctx.globalAlpha = inactive ? .38 : 1;
    if (image) ctx.drawImage(image, sx, sy, 16, 32, Math.round(x), Math.round(y), 32, 64);
    else { ctx.fillStyle = OFFICE_COLORS[state]; ctx.fillRect(x + 6, y + 20, 20, 34); }
    ctx.globalAlpha = 1;
    if (['waiting', 'blocked', 'sleeping', 'done'].includes(state)) {
      ctx.fillStyle = '#132330'; ctx.fillRect(seat.x + 81, seat.y + 21, 26, 21);
      ctx.fillStyle = OFFICE_COLORS[state]; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
      ctx.fillText(state === 'sleeping' ? 'zZ' : state === 'done' ? '✓' : state === 'blocked' ? '!' : '?', seat.x + 94, seat.y + 37);
    }
  }
}
