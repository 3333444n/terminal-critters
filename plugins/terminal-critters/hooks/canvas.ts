// A tiny pixel canvas that packs into a Raster's `cells`.
//
// Each terminal cell holds two pixels stacked vertically, drawn with the
// half-block glyphs, so a band of R rows is a canvas of 2R pixel rows.
// Text can be stamped on top of the pixels, one character per cell.

/** The terminal's own default color, used for every empty pixel. */
export const DEFAULT = 0x01000000

/** A pixel color, 0xRRGGBB, or EMPTY for "nothing here". */
export const EMPTY = -1

const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄
const SPACE = 0x20

type Glyph = { code: number; fg: number; bg: number }

export class Canvas {
  readonly cols: number
  readonly rows: number
  readonly w: number
  readonly h: number
  private readonly px: Int32Array
  private readonly glyphs: (Glyph | undefined)[]

  constructor(cols: number, rows: number) {
    this.cols = cols
    this.rows = rows
    this.w = cols
    this.h = rows * 2
    this.px = new Int32Array(this.w * this.h).fill(EMPTY)
    this.glyphs = new Array(cols * rows)
  }

  /** One pixel; anything off the canvas is clipped. */
  set(x: number, y: number, color: number): void {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    this.px[y * this.w + x] = color
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return EMPTY
    return this.px[y * this.w + x] ?? EMPTY
  }

  rect(x: number, y: number, w: number, h: number, color: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color)
  }

  disc(cx: number, cy: number, r: number, color: number): void {
    for (let j = -r; j <= r; j++)
      for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r * 0.6) this.set(cx + i, cy + j, color)
  }

  /**
   * Draws a sprite: rows of characters, each looked up in `palette`.
   * A character missing from the palette (like '.') is transparent.
   */
  sprite(rows: readonly string[], x: number, y: number, palette: Record<string, number>, flip = false): void {
    x = Math.round(x)
    y = Math.round(y)
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j] ?? ''
      for (let i = 0; i < row.length; i++) {
        const color = palette[row[i] ?? '.']
        if (color === undefined) continue
        this.set(flip ? x + row.length - 1 - i : x + i, y + j, color)
      }
    }
  }

  /**
   * Stamps text on whole cells (column, row in cells, not pixels).
   * With no `bg`, each character keeps the pixel color beneath it.
   */
  text(col: number, row: number, str: string, fg: number, bg?: number): void {
    col = Math.round(col)
    row = Math.round(row)
    if (row < 0 || row >= this.rows) return
    let i = 0
    for (const ch of str) {
      const c = col + i++
      if (c < 0 || c >= this.cols) continue
      const code = ch.codePointAt(0) ?? SPACE
      // A Raster takes printable width-1 BMP characters only.
      const safe = code >= 0x20 && code <= 0xffff ? code : SPACE
      this.glyphs[row * this.cols + c] = { code: safe, fg, bg: bg ?? this.cellBg(c, row) }
    }
  }

  /** Removes any text over a pixel rectangle, so a sprite drawn there shows. */
  clearText(x: number, y: number, w: number, h: number): void {
    const fromRow = Math.max(0, Math.floor(y / 2))
    const toRow = Math.min(this.rows - 1, Math.floor((y + h - 1) / 2))
    for (let row = fromRow; row <= toRow; row++)
      for (let col = Math.max(0, Math.round(x)); col < Math.min(this.cols, Math.round(x) + w); col++)
        this.glyphs[row * this.cols + col] = undefined
  }

  /** The color text on this cell should sit on when it has no bg of its own. */
  private cellBg(col: number, row: number): number {
    const top = this.get(col, row * 2)
    const bottom = this.get(col, row * 2 + 1)
    const pick = bottom !== EMPTY ? bottom : top
    return pick === EMPTY ? DEFAULT : pick
  }

  /** The cells as a Raster takes them: base64 of [code, fg, bg] u32 triplets. */
  pack(): string {
    const words = new Uint32Array(this.cols * this.rows * 3)
    let k = 0
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const glyph = this.glyphs[row * this.cols + col]
        if (glyph) {
          words[k++] = glyph.code
          words[k++] = glyph.fg
          words[k++] = glyph.bg
          continue
        }
        const top = this.px[row * 2 * this.w + col] ?? EMPTY
        const bottom = this.px[(row * 2 + 1) * this.w + col] ?? EMPTY
        if (top === EMPTY && bottom === EMPTY) {
          words[k++] = SPACE
          words[k++] = DEFAULT
          words[k++] = DEFAULT
        } else if (top === EMPTY) {
          words[k++] = LOWER
          words[k++] = bottom
          words[k++] = DEFAULT
        } else {
          words[k++] = UPPER
          words[k++] = top
          words[k++] = bottom === EMPTY ? DEFAULT : bottom
        }
      }
    }
    return toBase64(new Uint8Array(words.buffer))
  }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64
  if (typeof native === 'function') return native.call(bytes)
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i]! << 16
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + '=='
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + '='
  }
  return out
}

/** A stable pseudo-random number in [0, 1) for an integer seed. */
export function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

/** Mixes two colors, t = 0 is a, t = 1 is b. */
export function mix(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 255
  const lerp = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) & 255
  return (lerp(16) << 16) | (lerp(8) << 8) | lerp(0)
}
