import { PixelBuffer } from './buffer';
import { darker, rampDarkest, stepOf, rampOf, R } from './palette';

const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * 선택적 외곽선: 투명 픽셀이 불투명 픽셀과 맞닿으면 그 재질 램프의 가장 어두운 색을 둔다.
 * 광원(왼쪽 위)을 향한 가장자리는 한 단계 밝은 외곽선을 사용해 기계적인 검은 테두리를 피한다.
 */
export function selectiveOutline(buf: PixelBuffer, opts: { soften?: boolean; ignore?: (c: number) => boolean } = {}): void {
  const soften = opts.soften ?? true;
  const out = buf.clone();
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      if (buf.get(x, y) !== 0) continue;
      // 우선순위: 오른쪽/아래 이웃(= 이 픽셀이 형태의 왼쪽/위 가장자리)
      const right = buf.get(x + 1, y), below = buf.get(x, y + 1), left = buf.get(x - 1, y), above = buf.get(x, y - 1);
      let src = 0;
      let litSide = false;
      if (right) { src = right; litSide = true; }
      else if (below) { src = below; litSide = true; }
      else if (left) src = left;
      else if (above) src = above;
      if (!src) continue;
      if (opts.ignore && opts.ignore(src)) continue;
      let c = rampDarkest(src);
      if (soften && litSide && (right && below)) {
        // 왼쪽 위 모서리는 한 단계 밝게
        c = R[rampOf(src)][Math.min(1, R[rampOf(src)].length - 1)];
      }
      out.set(x, y, c);
    }
  }
  buf.data.set(out.data);
}

/** 고립된 단일 픽셀(주변 4방향이 모두 같은 다른 색)을 정리한다 — 픽셀 잡음 금지 규칙 */
export function cleanupOrphans(buf: PixelBuffer, protect?: (c: number) => boolean): void {
  const out = buf.clone();
  for (let y = 1; y < buf.h - 1; y++) {
    for (let x = 1; x < buf.w - 1; x++) {
      const c = buf.get(x, y);
      if (!c) continue;
      if (protect && protect(c)) continue;
      const a = buf.get(x + 1, y), b = buf.get(x - 1, y), d = buf.get(x, y + 1), e = buf.get(x, y - 1);
      if (a && a === b && a === d && a === e && a !== c && rampOf(a) === rampOf(c)) out.set(x, y, a);
    }
  }
  buf.data.set(out.data);
}

/**
 * 부분(part)을 기반 버퍼 위에 합성한다.
 * edge: 앞쪽 부분이 이미 그려진 불투명 영역 위에 놓일 때, 경계 픽셀을 한 단계 어둡게 해 약한 내부선을 만든다.
 * cast: 광원 반대(오른쪽 아래)로 기반 픽셀에 1px 그림자를 드리운다.
 */
export function composite(base: PixelBuffer, part: PixelBuffer, opts: { edge?: boolean; cast?: boolean; edgeSides?: 'all' | 'lower' } = {}): void {
  const edge = opts.edge ?? true;
  const res = base.clone();
  for (let y = 0; y < part.h; y++) {
    for (let x = 0; x < part.w; x++) {
      const c = part.get(x, y);
      if (!c) continue;
      let col = c;
      if (edge) {
        for (const [dx, dy] of N4) {
          if (opts.edgeSides === 'lower' && dy < 0) continue;
          const nx = x + dx, ny = y + dy;
          if (part.get(nx, ny) === 0 && base.get(nx, ny) !== 0) {
            col = darker(c, 1);
            break;
          }
        }
      }
      res.set(x, y, col);
    }
  }
  if (opts.cast) {
    for (let y = 0; y < part.h; y++)
      for (let x = 0; x < part.w; x++) {
        if (!part.get(x, y)) continue;
        for (const [dx, dy] of [[1, 1], [0, 1]] as [number, number][]) {
          const nx = x + dx, ny = y + dy;
          if (!part.get(nx, ny) && base.get(nx, ny) && res.get(nx, ny) === base.get(nx, ny)) {
            const b = base.get(nx, ny);
            if (stepOf(b) > 1) res.set(nx, ny, darker(b, 1));
          }
        }
      }
  }
  base.data.set(res.data);
}

/** 버퍼 내 특정 색을 다른 색으로 치환 */
export function remap(buf: PixelBuffer, map: Map<number, number>): void {
  for (let i = 0; i < buf.data.length; i++) {
    const m = map.get(buf.data[i]);
    if (m !== undefined) buf.data[i] = m;
  }
}

/** 전체를 n단계 어둡게 (뒤쪽 레이어 깊이감) */
export function darkenAll(buf: PixelBuffer, n = 1): void {
  for (let i = 0; i < buf.data.length; i++) if (buf.data[i]) buf.data[i] = darker(buf.data[i], n);
}

/** 실루엣 마스크 */
export function silhouette(buf: PixelBuffer, c: number): PixelBuffer {
  const out = new PixelBuffer(buf.w, buf.h);
  for (let i = 0; i < buf.data.length; i++) if (buf.data[i]) out.data[i] = c;
  return out;
}
