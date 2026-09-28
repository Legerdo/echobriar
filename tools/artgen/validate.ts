/**
 * 코드 아트 검증기.
 * - 프레임 크기, 필수 애니메이션, 투명 배경, 발 앵커 안정성, 팔레트 사용, 약점 좌표, 빈 프레임
 * - 생성된 매니페스트/파일과 원본 레지스트리의 일치
 * 실패 항목이 하나라도 있으면 종료 코드 1.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from '../../src/art/registry';
import { PALETTE, INDEX_RAMP } from '../../src/art/core/palette';
import type { Manifest, SheetSpec } from '../../src/art/core/sheet';
import type { PixelBuffer } from '../../src/art/core/buffer';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public', 'generated');

const errors: string[] = [];
const warns: string[] = [];
const err = (m: string) => errors.push(m);

/** 발 앵커 검사 대상 (지면에 서 있는 캐릭터) */
const GROUNDED = new Set(['player', 'field', 'enemy', 'boss']);
/** 떠 있는 적 (발 앵커 대신 부유 높이만 확인) */
const FLOATING = new Set(['glassflame', 'orb', 'chorister']);
/** 바닥에 깔리는 소품 (타일처럼 전면 불투명 허용) */
const FLOOR_PROPS = new Set(['bridge']);
/** 색상 상한은 기본 모습(idle)의 핵심 색 기준, 시트 전체는 이펙트 강조색 여유분 허용 */
const FX_COLOR_ALLOWANCE = 16;
/** 발광·마법 강조용 램프 (핵심 색 계산에서 제외) */
const FX_RAMPS = new Set<string>(['echo', 'ember', 'storm', 'glass', 'gold', 'white']);

function lowestOpaqueRow(f: PixelBuffer): number {
  for (let y = f.h - 1; y >= 0; y--) for (let x = 0; x < f.w; x++) if (f.data[y * f.w + x]) return y;
  return -1;
}

function checkSheet(s: SheetSpec): void {
  const names = new Set(s.anims.map((a) => a.name));
  for (const r of s.required ?? []) if (!names.has(r)) err(`${s.id}: 필수 애니메이션 '${r}' 누락`);
  const colors = new Set<number>();
  for (const a of s.anims) {
    if (a.frames.length === 0) err(`${s.id}.${a.name}: 프레임 없음`);
    if (a.durations.length !== a.frames.length) err(`${s.id}.${a.name}: 프레임 시간 수 불일치`);
    if (a.meta.length !== a.frames.length) err(`${s.id}.${a.name}: 메타 수 불일치`);
    let lows: number[] = [];
    a.frames.forEach((f, i) => {
      const where = `${s.id}.${a.name}[${i}]`;
      if (f.w !== s.frameW || f.h !== s.frameH) err(`${where}: 크기 ${f.w}x${f.h} ≠ ${s.frameW}x${s.frameH}`);
      const n = f.countOpaque();
      const minPx = s.kind === 'fx' ? 1 : 12;
      const isDeathTail = a.name === 'death' && i >= a.frames.length - 2;
      if (n < minPx && !isDeathTail) err(`${where}: 비정상적으로 빈 프레임 (${n}px)`);
      if (n === f.w * f.h && s.kind !== 'icon' && s.kind !== 'portrait' && !FLOOR_PROPS.has(s.id)) err(`${where}: 투명 배경 없음`);
      if (GROUNDED.has(s.kind)) {
        const corners = [f.get(0, 0), f.get(f.w - 1, 0), f.get(0, f.h - 1), f.get(f.w - 1, f.h - 1)];
        if (corners.some((c) => c !== 0)) err(`${where}: 프레임 모서리가 불투명 (잘림 의심)`);
      }
      for (let k = 0; k < f.data.length; k++) {
        const c = f.data[k];
        if (c === 0) continue;
        if (c >= PALETTE.length || !INDEX_RAMP[c]) { err(`${where}: 팔레트 밖 색 인덱스 ${c}`); break; }
        colors.add(c);
      }
      const m = a.meta[i];
      for (const w of m?.weak ?? []) {
        if (w.x - w.r < 0 || w.y - w.r < 0 || w.x + w.r >= s.frameW || w.y + w.r >= s.frameH) err(`${where}: 약점 '${w.id}'가 프레임 밖`);
        if (w.hit < w.r) err(`${where}: 약점 '${w.id}' 판정 반경이 시각 반경보다 작음`);
        // 시각적 약점 덩어리가 실제로 그려져 있는지 (판정 위치와 보이는 위치 일치)
        if (f.get(w.x, w.y) === 0 && a.name !== 'death') err(`${where}: 약점 '${w.id}' 중심 픽셀이 비어 있음`);
      }
      for (const [k, p] of Object.entries(m?.attach ?? {})) {
        if (p[0] < -8 || p[1] < -8 || p[0] > s.frameW + 8 || p[1] > s.frameH + 8) warns.push(`${where}: 부착점 '${k}' 범위 밖`);
      }
      lows.push(lowestOpaqueRow(f));
    });
    // 발 앵커 안정성: 지면 캐릭터의 최하단 불투명 행이 앵커 행 근처에 고정
    if (GROUNDED.has(s.kind) && !a.airborne && !FLOATING.has(s.id.replace(/_.*$/, '')) && !FLOATING.has(s.id)) {
      const ay = s.anchor[1];
      lows.forEach((y, i) => {
        if (y < 0) return;
        if (a.name === 'death' || a.name === 'defeat') return; // 쓰러짐은 지면 위라면 허용
        if (y > ay || y < ay - 3) err(`${s.id}.${a.name}[${i}]: 발 위치 흔들림 (최하단 y=${y}, 앵커 y=${ay})`);
      });
    }
  }
  if (s.maxColors) {
    const idle = s.anims.find((a) => a.name.startsWith('idle')) ?? s.anims[0];
    const core = new Set<number>();
    for (const f of idle.frames) for (const c of f.data) if (c && !FX_RAMPS.has(INDEX_RAMP[c]?.ramp)) core.add(c);
    if (core.size > s.maxColors) err(`${s.id}: 기본 모습 핵심 색 ${core.size} > 상한 ${s.maxColors}`);
    if (colors.size > s.maxColors + FX_COLOR_ALLOWANCE) err(`${s.id}: 시트 전체 색 ${colors.size} > 상한 ${s.maxColors + FX_COLOR_ALLOWANCE}`);
  }
  if (s.anchor[0] < 0 || s.anchor[0] >= s.frameW || s.anchor[1] < 0 || s.anchor[1] >= s.frameH) err(`${s.id}: 앵커가 프레임 밖`);
}

function main(): void {
  const t0 = Date.now();
  const { sheets, images } = buildAll();
  const ids = new Set<string>();
  for (const s of sheets) {
    if (ids.has(s.id)) err(`중복 시트 id: ${s.id}`);
    ids.add(s.id);
    checkSheet(s);
  }
  for (const im of images) {
    if (ids.has(im.id)) err(`중복 이미지 id: ${im.id}`);
    ids.add(im.id);
    for (let k = 0; k < im.image.data.length; k++) if (im.image.data[k] >= PALETTE.length) { err(`${im.id}: 팔레트 밖 색`); break; }
    if (im.kind === 'bg' && (im.image.w !== 480 || im.image.h !== 270)) err(`${im.id}: 배경 크기 ${im.image.w}x${im.image.h} ≠ 480x270`);
  }
  // 매니페스트 일치
  const mf = join(OUT, 'manifest.json');
  if (!existsSync(mf)) err('manifest.json 없음 — npm run art:gen 먼저 실행');
  else {
    const m = JSON.parse(readFileSync(mf, 'utf8')) as Manifest;
    for (const s of sheets) {
      const ms = m.sheets[s.id];
      if (!ms) { err(`매니페스트에 시트 '${s.id}' 없음`); continue; }
      if (ms.frameW !== s.frameW || ms.frameH !== s.frameH) err(`${s.id}: 매니페스트 프레임 크기 불일치`);
      if (!existsSync(join(OUT, ms.file))) err(`${s.id}: 파일 없음 ${ms.file}`);
      for (const a of s.anims) if (!ms.anims[a.name]) err(`${s.id}: 매니페스트 애니메이션 '${a.name}' 누락`);
    }
    for (const id of Object.keys(m.sheets)) if (!sheets.find((s) => s.id === id)) err(`매니페스트에 알 수 없는 시트 '${id}'`);
    for (const im of images) {
      const mi = m.images[im.id];
      if (!mi) err(`매니페스트에 이미지 '${im.id}' 없음`);
      else if (!existsSync(join(OUT, mi.file))) err(`${im.id}: 파일 없음`);
    }
  }
  for (const w of warns.slice(0, 20)) console.warn('[경고]', w);
  if (errors.length) {
    for (const e of errors.slice(0, 80)) console.error('[오류]', e);
    console.error(`[validate] 실패: 오류 ${errors.length}개 (${Date.now() - t0}ms)`);
    process.exit(1);
  }
  console.log(`[validate] 통과: 시트 ${sheets.length}개, 이미지 ${images.length}개 검사 (${Date.now() - t0}ms)`);
}

main();
