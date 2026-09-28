import type { SheetSpec } from '../../src/art/core/sheet';
import { PALETTE } from '../../src/art/core/palette';

/**
 * 개발용 접촉 시트(contact sheet): 애니메이션별 한 줄, 정수 배율 확대.
 * 발 기준선(초록 점선), 약점(빨간 원), 태그(contact 프레임은 주황 테두리)를 표시한다.
 */
/** 핵심 포즈 비교용 접촉 시트: idle / 준비 / 접촉 / 패링 / 반격 / 피격 / 붕괴 / 승리·패배 */
export function renderKeyPoses(spec: SheetSpec, scale = 4): { w: number; h: number; rgba: Uint8Array } {
  const pick: [string, (a: SheetSpec['anims'][number]) => number][] = [
    ['idle', () => 0],
    ['attack', (a) => Math.max(0, a.meta.findIndex((m) => m.tag === 'anticipation' || m.tag === 'hold'))],
    ['attack', (a) => Math.max(0, a.meta.findIndex((m) => m.tag === 'contact'))],
    ['parry', (a) => Math.max(0, a.meta.findIndex((m) => m.tag === 'contact'))],
    ['counter', (a) => Math.max(0, a.meta.findIndex((m) => m.tag === 'contact'))],
    ['hurt', () => 0],
    ['stagger', () => 0],
    ['break', () => 0],
    ['victory', (a) => Math.min(a.frames.length - 1, 2)],
    ['defeat', (a) => a.frames.length - 1],
    ['death', (a) => Math.floor(a.frames.length / 2)],
  ];
  const frames = pick
    .map(([n, f]) => {
      const a = spec.anims.find((x) => x.name === n);
      return a ? a.frames[f(a)] : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const pad = 4;
  const W = frames.length * (spec.frameW * scale + pad) + pad;
  const H = spec.frameH * scale + pad * 2;
  const out = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { out[i * 4] = 52; out[i * 4 + 1] = 60; out[i * 4 + 2] = 58; out[i * 4 + 3] = 255; }
  frames.forEach((f, fi) => {
    const ox = pad + fi * (spec.frameW * scale + pad);
    for (let y = 0; y < spec.frameH * scale; y++)
      for (let x = 0; x < spec.frameW * scale; x++) {
        const c = f.get(Math.floor(x / scale), Math.floor(y / scale));
        const i = ((pad + y) * W + ox + x) * 4;
        if (c) { const p = PALETTE[c]; out[i] = p[0]; out[i + 1] = p[1]; out[i + 2] = p[2]; }
        else { out[i] = 70; out[i + 1] = 84; out[i + 2] = 78; }
        out[i + 3] = 255;
      }
  });
  return { w: W, h: H, rgba: out };
}

export function renderContactSheet(
  input: SheetSpec | SheetSpec[],
  opts: { silhouette?: boolean; scale?: number } = {},
): { w: number; h: number; rgba: Uint8Array } {
  const sheets = Array.isArray(input) ? input : [input];
  const scale = opts.scale ?? (sheets[0].frameW >= 96 ? 2 : 3);
  const pad = 2;
  type Row = { spec: SheetSpec; anim: SheetSpec['anims'][number] };
  const rows: Row[] = [];
  for (const s of sheets) {
    const anims = opts.silhouette ? s.anims.filter((a) => ['idle', 'attack', 'parry', 'counter', 'jump', 'hurt'].includes(a.name)) : s.anims;
    for (const a of anims) rows.push({ spec: s, anim: a });
  }
  const fw = Math.max(...sheets.map((s) => s.frameW));
  const fh = Math.max(...sheets.map((s) => s.frameH));
  const maxFrames = Math.max(...rows.map((r) => r.anim.frames.length));
  const W = (fw * scale + pad) * maxFrames + pad;
  const H = (fh * scale + pad) * rows.length + pad;
  const out = new Uint8Array(W * H * 4);
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
  };
  for (let i = 0; i < W * H; i++) { out[i * 4] = 40; out[i * 4 + 1] = 36; out[i * 4 + 2] = 44; out[i * 4 + 3] = 255; }

  rows.forEach((row, ri) => {
    const { spec, anim } = row;
    anim.frames.forEach((f, fi) => {
      const ox = pad + fi * (fw * scale + pad);
      const oy = pad + ri * (fh * scale + pad);
      const contact = anim.meta[fi]?.tag === 'contact';
      for (let y = 0; y < spec.frameH * scale; y++)
        for (let x = 0; x < spec.frameW * scale; x++) {
          const px = Math.floor(x / scale), py = Math.floor(y / scale);
          const c = f.get(px, py);
          if (c) {
            if (opts.silhouette) put(ox + x, oy + y, 20, 18, 26);
            else {
              const p = PALETTE[c];
              put(ox + x, oy + y, p[0], p[1], p[2]);
            }
          } else {
            const checker = ((px >> 2) + (py >> 2)) & 1;
            const v = opts.silhouette ? 214 : checker ? 92 : 104;
            put(ox + x, oy + y, v, v, v + (opts.silhouette ? 0 : 6));
          }
        }
      // 발 기준선
      const ay = spec.anchor[1];
      for (let x = 0; x < spec.frameW * scale; x += 3) put(ox + x, oy + ay * scale + scale - 1, 60, 200, 90);
      const ax = spec.anchor[0];
      for (let y = 0; y < spec.frameH * scale; y += 6) put(ox + ax * scale, oy + y, 60, 200, 90);
      // contact 프레임 테두리
      if (contact) {
        for (let x = 0; x < spec.frameW * scale; x++) { put(ox + x, oy, 255, 150, 40); put(ox + x, oy + spec.frameH * scale - 1, 255, 150, 40); }
        for (let y = 0; y < spec.frameH * scale; y++) { put(ox, oy + y, 255, 150, 40); put(ox + spec.frameW * scale - 1, oy + y, 255, 150, 40); }
      }
      // 약점
      const weak = anim.meta[fi]?.weak;
      if (weak && !opts.silhouette)
        for (const w of weak) {
          for (let a = 0; a < 64; a++) {
            const t = (a / 64) * Math.PI * 2;
            put(Math.round(ox + (w.x + 0.5 + Math.cos(t) * w.hit) * scale), Math.round(oy + (w.y + 0.5 + Math.sin(t) * w.hit) * scale), 255, 40, 60);
          }
        }
    });
  });
  return { w: W, h: H, rgba: out };
}
