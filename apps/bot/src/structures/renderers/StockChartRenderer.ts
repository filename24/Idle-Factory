/**
 * 주식 가격 그래프 렌더러 (#18) — 상세 카드("자세히 보기")의 7일 라인차트 PNG.
 *
 * `@napi-rs/canvas` 로 라인·영역·그리드·IPO 기준선·현재가 점을 그리고, **Y축
 * 가격 눈금 / 현재가 / 시간 라벨을 Pretendard 폰트로 렌더**한다(숫자가 보이는
 * 그래프). Components v2 `MediaGallery`(attachment:// 스킴)로 첨부한다.
 *
 * 가격은 1시간마다만 변하므로(`Stock.lastTickAt`), 렌더 결과를
 * `(stockId, lastTickAt)` 키로 인메모리 캐시해 tick 사이 재렌더를 없앤다.
 *
 * 참조: docs/design/08-stock.md §주가 변동, GitHub #18
 */

import { join } from 'node:path'
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'

/** 폰트 파일 위치(앱 루트 기준 — dev/prod 모두 cwd=apps/bot). */
const FONT_DIR = join(process.cwd(), 'assets', 'fonts')

/**
 * Pretendard 폰트를 등록하고 실제 사용할 family 이름을 돌려준다. 등록 실패
 * (파일 없음 등) 시 시스템 sans-serif 로 폴백해 렌더 자체는 깨지지 않게 한다.
 */
function registerFont(file: string, family: string, fallback: string): string {
  try {
    GlobalFonts.registerFromPath(join(FONT_DIR, file), family)
    return GlobalFonts.families.some((f) => f.family === family)
      ? family
      : fallback
  } catch {
    return fallback
  }
}

const FONT_LABEL = registerFont(
  'Pretendard-SemiBold.otf',
  'PretendardSB',
  'sans-serif'
)
const FONT_TEXT = registerFont(
  'Pretendard-Regular.otf',
  'Pretendard',
  FONT_LABEL
)

/** 그래프 캔버스 크기(px). */
const WIDTH = 880
const HEIGHT = 340
/** 플롯 영역 여백(px) — 좌: Y축 라벨, 우: 현재가 라벨, 하: 시간 라벨. */
const M_LEFT = 96
const M_RIGHT = 92
const M_TOP = 20
const M_BOTTOM = 34
/** Y축 그리드 분할 수. */
const GRID_DIVS = 4

/** 상승/하락/보합 추세 색 (Components v2 팔레트 계열). */
const COLOR_UP = '#57f287'
const COLOR_DOWN = '#ed4245'
const COLOR_FLAT = '#5865f2'
/** 배경·그리드·기준선·라벨 색 (Discord 다크 테마). */
const COLOR_BG = '#1e1f22'
const COLOR_GRID = 'rgba(255,255,255,0.07)'
const COLOR_BASELINE = 'rgba(255,255,255,0.30)'
const COLOR_AXIS_TEXT = '#b5bac1'

/** 렌더 캐시 상한(엔트리 수) — 초과 시 가장 오래된 항목부터 제거. */
const CACHE_CAP = 128
/** `(stockId, lastTickAt)` → PNG 버퍼 인메모리 캐시. */
const chartCache = new Map<string, Buffer>()

/**
 * 종목 그래프 첨부 파일명을 만든다 — MediaGallery URL(`attachment://<name>`)과
 * `AttachmentBuilder` 이름이 일치해야 하므로 공용 헬퍼로 노출한다.
 *
 * @param stockId 종목 id (cuid — 파일명 안전 문자)
 * @returns `stock-<id>.png`
 */
export function stockChartFilename(stockId: string): string {
  return `stock-${stockId}.png`
}

/**
 * 7일 가격 라인차트 PNG 버퍼를 만든다(캐시 우선).
 *
 * `(stockId, lastTickAtMs)` 캐시 키로 조회해 있으면 즉시 반환하고, 없으면 렌더
 * 후 캐시에 넣는다. 가격은 append-only tick 이고 `lastTickAt` 이 최신 tick 시각을
 * 추종하므로, 이 키는 시리즈 상태를 유일하게 식별한다.
 *
 * @param input.stockId 종목 id (캐시 키·파일명용)
 * @param input.lastTickAtMs `Stock.lastTickAt` 의 epoch ms (캐시 무효화 기준)
 * @param input.prices 시간 오름차순 가격 목록(오래된→최신)
 * @param input.ipoPrice IPO 상장가 (기준선)
 * @returns PNG 버퍼
 */
export function renderStockChart(input: {
  readonly stockId: string
  readonly lastTickAtMs: number
  readonly prices: readonly bigint[]
  readonly ipoPrice: bigint
}): Buffer {
  const key = `${input.stockId}:${input.lastTickAtMs}`
  const cached = chartCache.get(key)
  if (cached) {
    chartCache.delete(key)
    chartCache.set(key, cached)
    return cached
  }

  const buffer = drawChart(input.prices, input.ipoPrice)
  chartCache.set(key, buffer)
  if (chartCache.size > CACHE_CAP) {
    const oldest = chartCache.keys().next().value
    if (oldest !== undefined) chartCache.delete(oldest)
  }
  return buffer
}

/** 정수를 천 단위 콤마 문자열로. */
function withCommas(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 실제 캔버스 드로잉 — 라인/영역/그리드/기준선/현재가 점 + 숫자 라벨. */
function drawChart(prices: readonly bigint[], ipoPrice: bigint): Buffer {
  const canvas = createCanvas(WIDTH, HEIGHT)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = COLOR_BG
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const values = prices.map((p) => Number(p))
  const ipo = Number(ipoPrice)
  const n = values.length

  // 값 범위 — 가격 + IPO 기준선 포함, 상하 8% 여백.
  let axisMin = Math.min(ipo, ...values)
  let axisMax = Math.max(ipo, ...values)
  if (axisMax === axisMin) {
    axisMin -= 1
    axisMax += 1
  }
  const pad = (axisMax - axisMin) * 0.08
  axisMin -= pad
  axisMax += pad
  const axisSpan = axisMax - axisMin || 1

  const x0 = M_LEFT
  const x1 = WIDTH - M_RIGHT
  const y0 = M_TOP
  const y1 = HEIGHT - M_BOTTOM
  const plotW = x1 - x0
  const plotH = y1 - y0
  const xOf = (i: number) =>
    n <= 1 ? x0 + plotW / 2 : x0 + (i / (n - 1)) * plotW
  const yOf = (v: number) => y0 + (1 - (v - axisMin) / axisSpan) * plotH

  // 수평 그리드 + Y축 가격 라벨.
  ctx.strokeStyle = COLOR_GRID
  ctx.lineWidth = 1
  ctx.fillStyle = COLOR_AXIS_TEXT
  ctx.font = `18px ${FONT_LABEL}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'right'
  for (let g = 0; g <= GRID_DIVS; g++) {
    const y = y0 + (g / GRID_DIVS) * plotH
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()
    const value = axisMax - (g / GRID_DIVS) * axisSpan
    ctx.fillText(withCommas(value), x0 - 10, y)
  }

  // IPO 기준선(점선) + 라벨.
  const ipoY = yOf(ipo)
  ctx.strokeStyle = COLOR_BASELINE
  ctx.setLineDash([6, 6])
  ctx.beginPath()
  ctx.moveTo(x0, ipoY)
  ctx.lineTo(x1, ipoY)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.textAlign = 'left'
  ctx.font = `16px ${FONT_TEXT}`
  ctx.fillStyle = COLOR_AXIS_TEXT
  ctx.fillText('IPO', x0 + 6, ipoY - 12)

  // 추세 색 — 마지막 vs 처음.
  const trendColor =
    n < 2
      ? COLOR_FLAT
      : values[n - 1] > values[0]
        ? COLOR_UP
        : values[n - 1] < values[0]
          ? COLOR_DOWN
          : COLOR_FLAT

  // 영역 채우기(라인 아래 그라디언트).
  const gradient = ctx.createLinearGradient(0, y0, 0, y1)
  gradient.addColorStop(0, `${trendColor}47`)
  gradient.addColorStop(1, `${trendColor}00`)
  ctx.beginPath()
  ctx.moveTo(xOf(0), yOf(values[0]))
  for (let i = 1; i < n; i++) ctx.lineTo(xOf(i), yOf(values[i]))
  ctx.lineTo(xOf(n - 1), y1)
  ctx.lineTo(xOf(0), y1)
  ctx.closePath()
  ctx.fillStyle = gradient
  ctx.fill()

  // 가격 라인.
  ctx.beginPath()
  ctx.moveTo(xOf(0), yOf(values[0]))
  for (let i = 1; i < n; i++) ctx.lineTo(xOf(i), yOf(values[i]))
  ctx.strokeStyle = trendColor
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()

  // 현재가 점 + 우측 라벨.
  const cx = xOf(n - 1)
  const cy = yOf(values[n - 1])
  ctx.beginPath()
  ctx.arc(cx, cy, 6, 0, Math.PI * 2)
  ctx.fillStyle = trendColor
  ctx.fill()

  const label = withCommas(values[n - 1])
  ctx.font = `18px ${FONT_LABEL}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const labelW = ctx.measureText(label).width
  const pillX = Math.min(cx + 10, WIDTH - labelW - 16)
  const pillY = Math.max(y0 + 11, Math.min(cy, y1 - 11))
  ctx.fillStyle = trendColor
  roundRect(ctx, pillX, pillY - 13, labelW + 14, 26, 6)
  ctx.fill()
  ctx.fillStyle = '#111214'
  ctx.fillText(label, pillX + 7, pillY + 1)

  // 시간축 라벨(좌: 7일 전, 우: 현재).
  ctx.font = `16px ${FONT_TEXT}`
  ctx.fillStyle = COLOR_AXIS_TEXT
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillText('7일 전', x0, HEIGHT - 12)
  ctx.textAlign = 'right'
  ctx.fillText('현재', x1, HEIGHT - 12)

  return canvas.toBuffer('image/png')
}

/** 둥근 사각형 경로(현재가 라벨 pill). */
function roundRect(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
