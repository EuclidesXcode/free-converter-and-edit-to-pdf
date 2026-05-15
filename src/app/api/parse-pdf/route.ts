import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── DOMMatrix polyfill (required by pdfjs in Node.js 18) ──────────────────────
function installDOMMatrixPolyfill() {
  if (typeof globalThis.DOMMatrix !== 'undefined') return

  class DOMMatrixPolyfill {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    m11 = 1; m12 = 0; m13 = 0; m14 = 0
    m21 = 0; m22 = 1; m23 = 0; m24 = 0
    m31 = 0; m32 = 0; m33 = 1; m34 = 0
    m41 = 0; m42 = 0; m43 = 0; m44 = 1
    is2D = true; isIdentity = true

    constructor(init?: string | number[]) {
      if (Array.isArray(init) && init.length >= 6) {
        this.a = init[0]; this.b = init[1]; this.c = init[2]
        this.d = init[3]; this.e = init[4]; this.f = init[5]
        this.m11 = this.a; this.m12 = this.b
        this.m21 = this.c; this.m22 = this.d
        this.m41 = this.e; this.m42 = this.f
      }
    }

    static fromMatrix(o: DOMMatrixPolyfill) {
      return new DOMMatrixPolyfill([o.a, o.b, o.c, o.d, o.e, o.f])
    }

    multiply(o: DOMMatrixPolyfill): DOMMatrixPolyfill {
      return new DOMMatrixPolyfill([
        this.a * o.a + this.c * o.b,
        this.b * o.a + this.d * o.b,
        this.a * o.c + this.c * o.d,
        this.b * o.c + this.d * o.d,
        this.a * o.e + this.c * o.f + this.e,
        this.b * o.e + this.d * o.f + this.f,
      ])
    }

    inverse(): DOMMatrixPolyfill {
      const det = this.a * this.d - this.b * this.c
      if (!det) return new DOMMatrixPolyfill()
      return new DOMMatrixPolyfill([
        this.d / det, -this.b / det, -this.c / det, this.a / det,
        (this.c * this.f - this.d * this.e) / det,
        (this.b * this.e - this.a * this.f) / det,
      ])
    }

    translate(x = 0, y = 0): DOMMatrixPolyfill {
      return new DOMMatrixPolyfill([
        this.a, this.b, this.c, this.d,
        this.a * x + this.c * y + this.e,
        this.b * x + this.d * y + this.f,
      ])
    }

    scale(sx = 1, sy?: number): DOMMatrixPolyfill {
      const sY = sy ?? sx
      return new DOMMatrixPolyfill([
        this.a * sx, this.b * sx, this.c * sY, this.d * sY, this.e, this.f,
      ])
    }

    transformPoint(p: { x: number; y: number }) {
      return {
        x: this.a * p.x + this.c * p.y + this.e,
        y: this.b * p.x + this.d * p.y + this.f,
        z: 0, w: 1,
      }
    }

    toFloat32Array() { return new Float32Array([this.a, this.b, this.c, this.d, this.e, this.f]) }
    toFloat64Array() { return new Float64Array([this.a, this.b, this.c, this.d, this.e, this.f]) }
  }

  ;(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrixPolyfill
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface TextItem { x: number; y: number; str: string; width: number }
interface TextLine { y: number; items: TextItem[] }

// ── PDF structured extraction ─────────────────────────────────────────────────
async function extractPages(buffer: Buffer): Promise<{ pages: TextLine[][]; numPages: number }> {
  installDOMMatrixPolyfill()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js') as any
  pdfjsLib.GlobalWorkerOptions.workerSrc = ''

  const pdfDoc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  }).promise

  const numPages: number = pdfDoc.numPages
  const pages: TextLine[][] = []

  for (let p = 1; p <= numPages; p++) {
    const page = await pdfDoc.getPage(p)
    const content = await page.getTextContent()

    // Group items into lines by Y-proximity (4pt tolerance)
    const groups: Array<{ y: number; items: TextItem[] }> = []
    for (const raw of content.items) {
      if (!('str' in raw)) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = raw as any
      const str: string = item.str ?? ''
      if (!str.trim()) continue
      const y: number = item.transform[5]
      const x: number = item.transform[4]
      const width: number = item.width ?? 0

      const existing = groups.find((g) => Math.abs(g.y - y) < 4)
      if (existing) {
        existing.items.push({ x, y, str, width })
      } else {
        groups.push({ y, items: [{ x, y, str, width }] })
      }
    }

    // Sort top → bottom, items left → right within each line
    const lines: TextLine[] = groups
      .sort((a, b) => b.y - a.y)
      .map((g) => ({ y: g.y, items: g.items.sort((a, b) => a.x - b.x) }))

    pages.push(lines)
  }

  return { pages, numPages }
}

// ── Column detection helpers ──────────────────────────────────────────────────

/**
 * Given a set of lines, return the X-start positions of detected columns.
 * Returns [] if no consistent column structure is found.
 */
function detectColumnBoundaries(lines: TextLine[]): number[] {
  if (lines.length < 2) return []

  // Collect all X positions (rounded to nearest 5pt to reduce noise)
  const xCounts = new Map<number, number>()
  for (const line of lines) {
    for (const item of line.items) {
      const rounded = Math.round(item.x / 5) * 5
      xCounts.set(rounded, (xCounts.get(rounded) ?? 0) + 1)
    }
  }

  // Keep X positions that appear in at least 20% of lines (frequent column starts)
  const minFreq = Math.max(2, Math.floor(lines.length * 0.2))
  const frequentX = Array.from(xCounts.entries())
    .filter(([, count]) => count >= minFreq)
    .map(([x]) => x)
    .sort((a, b) => a - b)

  if (frequentX.length < 2) return []

  // Merge X values that are within 15pt of each other into one boundary
  const boundaries: number[] = [frequentX[0]]
  for (let i = 1; i < frequentX.length; i++) {
    if (frequentX[i] - boundaries[boundaries.length - 1] > 15) {
      boundaries.push(frequentX[i])
    }
  }

  return boundaries.length >= 2 ? boundaries : []
}

/** Assign a text item to a column index based on its X position. */
function assignColumn(x: number, boundaries: number[]): number {
  let col = 0
  for (let i = 1; i < boundaries.length; i++) {
    if (x >= boundaries[i] - 8) col = i
  }
  return col
}

/**
 * A line is "multi-column" if its items span more than 25% of the page width
 * and there is at least a 20pt gap between consecutive items.
 */
function isMultiColumn(line: TextLine, pageW = 500): boolean {
  if (line.items.length < 2) return false
  const span = line.items[line.items.length - 1].x - line.items[0].x
  if (span < pageW * 0.25) return false
  // At least one pair of adjacent items has a gap > 20pt
  for (let i = 1; i < line.items.length; i++) {
    const gap = line.items[i].x - (line.items[i - 1].x + line.items[i - 1].width)
    if (gap > 20) return true
  }
  return false
}

// ── HTML builder ──────────────────────────────────────────────────────────────
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function lineToText(line: TextLine): string {
  // Join items; add a space when there is a meaningful gap between them
  let result = ''
  for (let i = 0; i < line.items.length; i++) {
    const item = line.items[i]
    if (i === 0) {
      result += item.str
    } else {
      const prev = line.items[i - 1]
      const gap = item.x - (prev.x + prev.width)
      result += (gap > 4 ? ' ' : '') + item.str
    }
  }
  return result.trim()
}

function classifyLine(text: string): 'h2' | 'h3' | 'p' {
  const isAllCaps =
    text === text.toUpperCase() &&
    text.length > 3 && text.length < 120 &&
    /[A-ZÀÁÂÃÉÊÍÓÔÕÚ]/.test(text)
  const isShortTitle =
    text.length < 80 &&
    !text.endsWith('.') && !text.endsWith(',') && !text.endsWith(';') &&
    !/^\d/.test(text)

  if (isAllCaps) return 'h2'
  if (isShortTitle) return 'h3'
  return 'p'
}

function buildHtml(pages: TextLine[][]): string {
  const html: string[] = []
  const PAGE_W = 500 // approximate usable width in pts for A4

  for (const lines of pages) {
    if (!lines.length) continue

    // ── Segment the page into table runs vs text runs ──────────────────────
    // A "table candidate" line must be multi-column AND appear in a run of ≥3
    const isTable: boolean[] = lines.map((l) => isMultiColumn(l, PAGE_W))

    // Smooth: require a run of ≥3 consecutive multi-column lines to count as table
    const inTable: boolean[] = [...isTable]
    for (let i = 0; i < inTable.length; i++) {
      if (inTable[i]) {
        // Extend a window: check neighbours
        const windowStart = Math.max(0, i - 2)
        const windowEnd = Math.min(inTable.length - 1, i + 2)
        let runCount = 0
        for (let k = windowStart; k <= windowEnd; k++) if (isTable[k]) runCount++
        if (runCount < 3) inTable[i] = false
      }
    }

    let i = 0
    while (i < lines.length) {
      if (inTable[i]) {
        // Collect the full table run
        const tableLines: TextLine[] = []
        while (i < lines.length && inTable[i]) {
          tableLines.push(lines[i])
          i++
        }

        const cols = detectColumnBoundaries(tableLines)
        if (cols.length >= 2) {
          html.push('<table>')
          for (const tl of tableLines) {
            const cells: string[] = new Array(cols.length).fill('')
            for (const item of tl.items) {
              const col = assignColumn(item.x, cols)
              cells[col] += (cells[col] ? ' ' : '') + item.str
            }
            // Detect header row heuristic: first row or text is ALL CAPS / bold-like
            const isHeader = tableLines.indexOf(tl) === 0 ||
              cells.every((c) => c === c.toUpperCase() && c.trim().length > 0)
            const td = isHeader ? 'th' : 'td'
            html.push('<tr>' + cells.map((c) => `<${td}>${esc(c.trim())}</${td}>`).join('') + '</tr>')
          }
          html.push('</table>')
        } else {
          // Column detection failed — fall back to joined text
          for (const tl of tableLines) {
            const text = lineToText(tl)
            if (text) html.push(`<p>${esc(text)}</p>`)
          }
        }
      } else {
        // Single text line
        const text = lineToText(lines[i])
        if (text) {
          const tag = classifyLine(text)
          html.push(`<${tag}>${esc(text)}</${tag}>`)
        }
        i++
      }
    }

    // Page break between pages (hr)
    html.push('<hr>')
  }

  // Remove trailing <hr>
  if (html[html.length - 1] === '<hr>') html.pop()

  return html.join('\n')
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (ext !== 'pdf') {
      return NextResponse.json({ error: 'Envie um arquivo .pdf' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { pages, numPages } = await extractPages(buffer)

    const totalLines = pages.reduce((s, p) => s + p.length, 0)
    if (totalLines === 0) {
      return NextResponse.json(
        { error: 'Este PDF não contém texto extraível (pode ser um PDF de imagem/escaneado).' },
        { status: 422 }
      )
    }

    const html = buildHtml(pages)
    const title = file.name.replace(/\.pdf$/i, '')

    return NextResponse.json({ html, title, pages: numPages })
  } catch (err: unknown) {
    console.error('[parse-pdf]', err)
    const message = err instanceof Error ? err.message : 'Falha ao processar o PDF'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
