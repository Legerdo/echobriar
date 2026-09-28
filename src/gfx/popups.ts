/**
 * 떠오르는 전투 문구 배치 (순수 로직).
 * 모든 문구는 같은 속도로 RISE px만큼 올라간 뒤 멈춘다. 새 문구를 놓을 때
 * 가로로 겹치는 기존 문구 각각에 대해 다음 둘 중 하나를 만족시키면, 사라질 때까지 겹치지 않는다.
 *  - 위에 놓기:   y + h ≤ 기존 문구의 현재 y
 *  - 아래에 놓기: y ≥ 기존 문구의 시작 y + 높이   (새 문구가 더 많이 오르므로 시작 위치 기준)
 */
export const POPUP_RISE = 10;
export const POPUP_RISE_MS = 320;

export interface PopupBox {
  x: number;
  /** 시작 y (글자 윗변) */
  y: number;
  w: number;
  h: number;
  t0: number;
  life: number;
}

export function popupYAt(p: PopupBox, now: number): number {
  return p.y - Math.min(1, Math.max(0, now - p.t0) / POPUP_RISE_MS) * POPUP_RISE;
}

/** 움직이지 않는 가림 영역 (배너 등). x는 가운데 */
export interface StaticBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 새 문구의 시작 y. 원하는 y0에서 시작해 겹치면 위로 올린다.
 * 고정 영역과는 떠오른 뒤까지 고려해 겹치지 않는다. 자리가 minY보다 위로 밀리면 null.
 */
export function placePopup(list: readonly PopupBox[], x: number, w: number, h: number, y0: number, now: number, statics: readonly StaticBox[] = [], minY = -Infinity, pad = 2): number | null {
  const near = (bx: number, bw: number) => Math.abs(bx - x) < (bw + w) / 2 + pad;
  const live = list.filter((p) => now - p.t0 < p.life && near(p.x, p.w));
  const fixed = statics.filter((s) => near(s.x, s.w));
  let y = y0;
  for (let guard = 0; guard < 64; guard++) {
    let moved = false;
    for (const p of live) {
      const cur = popupYAt(p, now);
      const above = y + h <= cur;
      const below = y >= p.y + p.h;
      if (!above && !below) { y = cur - h; moved = true; }
    }
    for (const s of fixed) {
      // 아래에 있으면 떠오른 뒤(y - RISE)에도 영역 밑이어야 하고, 위라면 처음부터 영역 위
      const above = y + h <= s.y;
      const below = y - POPUP_RISE >= s.y + s.h;
      if (!above && !below) { y = s.y - h; moved = true; }
    }
    if (!moved) break;
  }
  return y - POPUP_RISE < minY ? null : y;
}
