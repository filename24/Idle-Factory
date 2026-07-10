/**
 * 주식 가격 그래프 렌더러 (#18) — 상세 카드("자세히 보기")의 7일 라인차트 PNG.
 *
 * `@napi-rs/canvas` 로 서버에서 라인/영역/그리드/IPO 기준선을 그린 PNG 버퍼를
 * 만들어 Components v2 `MediaGallery`(attachment:// 스킴)로 첨부한다. **이미지엔
 * 텍스트를 넣지 않는다** — 폰트 의존성을 피하고, 수치(현재가·7일 고저)는 카드
 * 텍스트가 담당한다. 그래프는 추세 모양만 시각화한다.
 *
 * 가격은 1시간마다만 변하므로(`Stock.lastTickAt`), 렌더 결과를
 * `(stockId, lastTickAt)` 키로 인메모리 캐시해 tick 사이 재렌더를 없앤다.
 *
 * 참조: docs/design/08-stock.md §주가 변동, GitHub #18
 */

import { createCanvas } from '@napi-rs/canvas'

/** 그래프 캔버스 크기(px). */
const WIDTH = 880
const HEIGHT = 300
/** 플롯 영역 여백(px). */
const PAD = 18

/** 상승/하락/보합 추세 색 (Components v2 팔레트와 동일 계열). */
const COLOR_UP = '#57f287'
const COLOR_DOWN = '#ed4245'
const COLOR_FLAT = '#5865f2'
/** 배경·그리드·IPO 기준선 색 (Discord 다크 테마). */
const COLOR_BG = '#1e1f22'
const COLOR_GRID = 'rgba(255,255,255,0.06)'
const COLOR_BASELINE = 'rgba(255,255,255,0.28)'

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
    // LRU: 최근 사용으로 갱신.
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

/** 실제 캔버스 드로잉 — 라인/영역/그리드/IPO 기준선/현재가 점 (텍스트 없음). */
function drawChart(prices: readonly bigint[], ipoPrice: bigint): Buffer {
  const canvas = createCanvas(WIDTH, HEIGHT)
  const ctx = canvas.getContext('2d')

  // 배경.
  ctx.fillStyle = COLOR_BG
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const values = prices.map((p) => Number(p))
  const ipo = Number(ipoPrice)
  const n = values.length

  // 값 범위 — 가격 + IPO 기준선 포함, 상하 8% 여백.
  let min = Math.min(ipo, ...values)
  let max = Math.max(ipo, ...values)
  if (max === min) {
    min -= 1
    max += 1
  }
  const margin = (max - min) * 0.08
  min -= margin
  max += margin
  const span = max - min || 1

  const plotW = WIDTH - PAD * 2
  const plotH = HEIGHT - PAD * 2
  const xOf = (i: number) =>
    n <= 1 ? PAD + plotW / 2 : PAD + (i / (n - 1)) * plotW
  const yOf = (v: number) => PAD + (1 - (v - min) / span) * plotH

  // 수평 그리드 4줄.
  ctx.strokeStyle = COLOR_GRID
  ctx.lineWidth = 1
  for (let g = 0; g <= 4; g++) {
    const y = PAD + (g / 4) * plotH
    ctx.beginPath()
    ctx.moveTo(PAD, y)
    ctx.lineTo(WIDTH - PAD, y)
    ctx.stroke()
  }

  // IPO 기준선(점선).
  ctx.strokeStyle = COLOR_BASELINE
  ctx.setLineDash([6, 6])
  ctx.beginPath()
  ctx.moveTo(PAD, yOf(ipo))
  ctx.lineTo(WIDTH - PAD, yOf(ipo))
  ctx.stroke()
  ctx.setLineDash([])

  // 추세 색 — 마지막 >= 처음이면 상승.
  const trendColor =
    n < 2
      ? COLOR_FLAT
      : values[n - 1] > values[0]
        ? COLOR_UP
        : values[n - 1] < values[0]
          ? COLOR_DOWN
          : COLOR_FLAT

  // 영역 채우기(라인 아래 그라디언트).
  const gradient = ctx.createLinearGradient(0, PAD, 0, HEIGHT - PAD)
  gradient.addColorStop(0, `${trendColor}47`) // ~0.28 alpha
  gradient.addColorStop(1, `${trendColor}00`)
  ctx.beginPath()
  ctx.moveTo(xOf(0), yOf(values[0]))
  for (let i = 1; i < n; i++) ctx.lineTo(xOf(i), yOf(values[i]))
  ctx.lineTo(xOf(n - 1), HEIGHT - PAD)
  ctx.lineTo(xOf(0), HEIGHT - PAD)
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

  // 현재가 점(마지막).
  const cx = xOf(n - 1)
  const cy = yOf(values[n - 1])
  ctx.beginPath()
  ctx.arc(cx, cy, 6, 0, Math.PI * 2)
  ctx.fillStyle = trendColor
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, 9, 0, Math.PI * 2)
  ctx.strokeStyle = `${trendColor}66`
  ctx.lineWidth = 3
  ctx.stroke()

  return canvas.toBuffer('image/png')
}
