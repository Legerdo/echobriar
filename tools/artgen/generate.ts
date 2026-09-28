/**
 * 코드 기반 아트 생성기.
 * src/art 의 팔레트·포즈·픽셀 규칙 데이터를 읽어 스프라이트시트/이미지/매니페스트를 만든다.
 * 산출물(public/generated)은 캐시이며 직접 수정하지 않는다.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './png';
import { buildAll } from '../../src/art/registry';
import type { Manifest, ManifestAnim, ManifestSheet, SheetSpec } from '../../src/art/core/sheet';
import { PixelBuffer } from '../../src/art/core/buffer';
import { renderContactSheet, renderKeyPoses } from './contact';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'generated');
const CONTACT = join(ROOT, 'tools', 'artgen', 'out', 'contact');

function packSheet(spec: SheetSpec): { image: PixelBuffer; manifest: ManifestSheet } {
  const all: PixelBuffer[] = [];
  const anims: Record<string, ManifestAnim> = {};
  for (const a of spec.anims) {
    const idx: number[] = [];
    for (const f of a.frames) {
      idx.push(all.length);
      all.push(f);
    }
    anims[a.name] = {
      frames: idx,
      durations: a.durations,
      loop: a.loop,
      tags: a.meta.map((m) => m.tag ?? null),
      attach: a.meta.map((m) => m.attach ?? null),
      weak: a.meta.map((m) => m.weak ?? null),
      airborne: !!a.airborne,
    };
  }
  const maxCols = Math.max(1, Math.floor(2048 / spec.frameW));
  const cols = Math.min(maxCols, Math.max(1, Math.ceil(Math.sqrt(all.length * (spec.frameH / spec.frameW)))));
  const rows = Math.ceil(all.length / cols);
  const image = new PixelBuffer(cols * spec.frameW, rows * spec.frameH);
  const frames = all.map((f, i) => {
    const x = (i % cols) * spec.frameW, y = Math.floor(i / cols) * spec.frameH;
    if (f.w !== spec.frameW || f.h !== spec.frameH) throw new Error(`${spec.id}: 프레임 크기 불일치 ${f.w}x${f.h}`);
    image.blit(f, x, y);
    return { x, y };
  });
  return {
    image,
    manifest: {
      id: spec.id,
      kind: spec.kind,
      file: `sprites/${spec.id}.png`,
      frameW: spec.frameW,
      frameH: spec.frameH,
      anchor: spec.anchor,
      frames,
      anims,
    },
  };
}

function main(): void {
  const t0 = Date.now();
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'sprites'), { recursive: true });
  mkdirSync(join(OUT, 'images'), { recursive: true });
  mkdirSync(CONTACT, { recursive: true });

  const { sheets, images } = buildAll();
  const manifest: Manifest = { version: 1, generatedAt: new Date().toISOString(), sheets: {}, images: {} };

  for (const s of sheets) {
    const { image, manifest: m } = packSheet(s);
    writeFileSync(join(OUT, m.file), encodePNG(image.w, image.h, image.toRGBA()));
    manifest.sheets[s.id] = m;
    if (s.kind === 'player' || s.kind === 'enemy' || s.kind === 'boss' || s.kind === 'field' || s.kind === 'fx' || s.kind === 'npc') {
      const c = renderContactSheet(s);
      writeFileSync(join(CONTACT, `${s.id}.png`), encodePNG(c.w, c.h, c.rgba));
      if (s.kind !== 'fx') {
        const k = renderKeyPoses(s, s.frameW >= 120 ? 2 : s.frameW >= 64 ? 3 : 5);
        writeFileSync(join(CONTACT, `${s.id}_keys.png`), encodePNG(k.w, k.h, k.rgba));
      }
    }
  }
  for (const im of images) {
    const file = `images/${im.id}.png`;
    writeFileSync(join(OUT, file), encodePNG(im.image.w, im.image.h, im.image.toRGBA()));
    manifest.images[im.id] = { id: im.id, kind: im.kind, file, w: im.image.w, h: im.image.h, meta: im.meta };
  }
  // 실루엣 비교 시트
  const players = sheets.filter((s) => s.kind === 'player');
  if (players.length) {
    const c = renderContactSheet(players, { silhouette: true });
    writeFileSync(join(CONTACT, `_silhouettes.png`), encodePNG(c.w, c.h, c.rgba));
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest));
  // 검증기용 원본 인덱스 데이터 요약
  console.log(`[artgen] 시트 ${sheets.length}개, 이미지 ${images.length}개 생성 (${Date.now() - t0}ms)`);
}

main();
