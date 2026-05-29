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
        this.a * o.a + this.c * o.b, this.b * o.a + this.d * o.b,
        this.a * o.c + this.c * o.d, this.b * o.c + this.d * o.d,
        this.a * o.e + this.c * o.f + this.e, this.b * o.e + this.d * o.f + this.f,
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
        this.a * x + this.c * y + this.e, this.b * x + this.d * y + this.f,
      ])
    }

    scale(sx = 1, sy?: number): DOMMatrixPolyfill {
      const sY = sy ?? sx
      return new DOMMatrixPolyfill([this.a * sx, this.b * sx, this.c * sY, this.d * sY, this.e, this.f])
    }

    transformPoint(p: { x: number; y: number }) {
      return { x: this.a * p.x + this.c * p.y + this.e, y: this.b * p.x + this.d * p.y + this.f, z: 0, w: 1 }
    }

    toFloat32Array() { return new Float32Array([this.a, this.b, this.c, this.d, this.e, this.f]) }
    toFloat64Array() { return new Float64Array([this.a, this.b, this.c, this.d, this.e, this.f]) }
  }

  ;(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrixPolyfill
}

// ── Minimal PNG encoder (no native deps) ──────────────────────────────────────
// pdf.js gives raw RGBA/RGB pixel buffers; we wrap them into a PNG so the
// browser editor and the pdfkit renderer (which speaks PNG) can show them.
import { deflateSync } from 'zlib'

function crc32(buf: Buffer): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1))
  }
  return ~c >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

/** Encode an RGBA pixel buffer (width*height*4) as a PNG Buffer. */
function encodePng(rgba: Uint8Array, width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  // Prepend a filter byte (0 = none) to each scanline
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1)
  }
  const idat = deflateSync(raw)
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface TextItem { x: number; y: number; str: string; width: number }
interface ImageItem { y: number; dataUrl: string; w: number; h: number }
interface RawPage { items: TextItem[]; images: ImageItem[]; pageW: number; pageH: number }

// ── PDF raw item extraction ───────────────────────────────────────────────────
async function extractPages(buffer: Buffer): Promise<{ pages: RawPage[]; numPages: number }> {
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
  const pages: RawPage[] = []

  for (let p = 1; p <= numPages; p++) {
    const page = await pdfDoc.getPage(p)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view: number[] = (page as any).view ?? [0, 0, 595, 842]
    const pageW = view[2] - view[0]
    const pageH = view[3] - view[1]
    const content = await page.getTextContent()

    const items: TextItem[] = []
    for (const raw of content.items) {
      if (!('str' in raw)) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = raw as any
      const str: string = (item.str ?? '').replace(/\s+/g, ' ')
      if (!str.trim()) continue
      items.push({ x: item.transform[4], y: item.transform[5], str, width: item.width ?? 0 })
    }

    const images = await extractImages(page, pdfjsLib)
    pages.push({ items, images, pageW, pageH })
  }

  return { pages, numPages }
}

// ── Image extraction ───────────────────────────────────────────────────────────
/**
 * Walk the page's operator list, find image-paint operators, resolve each image
 * object and convert its raw pixel data to a PNG data URL. The current
 * transformation matrix tells us where (vertically) the image sits, so we can
 * interleave it with the text in the right order.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extractImages(page: any, pdfjsLib: any): Promise<ImageItem[]> {
  const OPS = pdfjsLib.OPS
  const out: ImageItem[] = []

  let opList
  try {
    opList = await page.getOperatorList()
  } catch {
    return out
  }

  // Track the current transformation matrix through save/restore/transform.
  let ctm: number[] = [1, 0, 0, 1, 0, 0]
  const stack: number[][] = []
  const mul = (a: number[], b: number[]): number[] => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ]

  const resolveImage = (name: string) => {
    // Page-level XObjects live in page.objs; inline/shared in commonObjs.
    try { if (page.objs.has(name)) return page.objs.get(name) } catch { /* */ }
    try { if (page.commonObjs.has(name)) return page.commonObjs.get(name) } catch { /* */ }
    return null
  }

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i]
    const args = opList.argsArray[i]

    if (fn === OPS.save) { stack.push(ctm.slice()); continue }
    if (fn === OPS.restore) { ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]; continue }
    if (fn === OPS.transform) { ctm = mul(ctm, args as number[]); continue }

    if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
      const name = args[0] as string
      const img = resolveImage(name)
      if (!img || !img.width || !img.height) continue
      const png = imgObjToPng(img)
      if (!png) continue
      // ctm[5] is the y-translation in PDF space (origin bottom-left); convert
      // to a top-origin sort key so it interleaves with text item Y values.
      out.push({ y: ctm[5], dataUrl: png, w: img.width, h: img.height })
    }
  }

  return out
}

/** Convert a pdf.js image object into a PNG data URL, or null if unsupported. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function imgObjToPng(img: any): string | null {
  try {
    const { width, height, data, kind } = img
    if (!data) return null
    const total = width * height
    const rgba = new Uint8Array(total * 4)

    // pdf.js ImageKind: 1 = GRAYSCALE_1BPP, 2 = RGB_24BPP, 3 = RGBA_32BPP
    if (kind === 3 || data.length >= total * 4) {
      rgba.set(data.subarray(0, total * 4))
    } else if (kind === 2 || data.length >= total * 3) {
      for (let i = 0; i < total; i++) {
        rgba[i * 4] = data[i * 3]
        rgba[i * 4 + 1] = data[i * 3 + 1]
        rgba[i * 4 + 2] = data[i * 3 + 2]
        rgba[i * 4 + 3] = 255
      }
    } else if (data.length >= total) {
      // Grayscale 1 byte/pixel
      for (let i = 0; i < total; i++) {
        const v = data[i]
        rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255
      }
    } else {
      return null
    }

    return `data:image/png;base64,${encodePng(rgba, width, height).toString('base64')}`
  } catch {
    return null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function classifyText(text: string): 'h2' | 'h3' | 'p' {
  const isAllCaps =
    text === text.toUpperCase() && text.length > 3 && text.length < 120 &&
    /[A-ZÀÁÂÃÉÊÍÓÔÕÚ]/.test(text)
  const isShortTitle =
    text.length < 80 && !text.endsWith('.') && !text.endsWith(',') &&
    !text.endsWith(';') && !/^\d/.test(text)
  if (isAllCaps) return 'h2'
  if (isShortTitle) return 'h3'
  return 'p'
}

// ── Column-first table detection ──────────────────────────────────────────────

/**
 * Find X positions that act as column starts.
 * Uses frequency clustering on all items in the page.
 * Requires ≥ 3 columns spanning ≥ 40% of page width.
 */
function findColumns(items: TextItem[], pageW: number): number[] {
  // Count how many items start (or nearly start) at each X rounded to 8pt grid
  const freq = new Map<number, number>()
  for (const item of items) {
    const x = Math.round(item.x / 8) * 8
    freq.set(x, (freq.get(x) ?? 0) + 1)
  }

  // Keep only X positions that appear at least max(3, 6% of items) times
  const minF = Math.max(3, Math.floor(items.length * 0.06))
  const candidates = Array.from(freq.entries())
    .filter(([, c]) => c >= minF)
    .map(([x]) => x)
    .sort((a, b) => a - b)

  if (candidates.length < 3) return []

  // Merge X values within 22pt into one column boundary
  const cols: number[] = [candidates[0]]
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i] - cols[cols.length - 1] > 22) cols.push(candidates[i])
  }

  // Must span at least 40% of page width and have ≥ 3 columns
  if (cols.length < 3) return []
  if (cols[cols.length - 1] - cols[0] < pageW * 0.4) return []

  return cols
}

/** Assign X to nearest column index. */
function colFor(x: number, cols: number[]): number {
  let best = 0
  for (let i = 1; i < cols.length; i++) {
    if (x >= cols[i] - 10) best = i
  }
  return best
}

/**
 * Given items assigned to each column, find Y row anchors using the column
 * whose items have the most regular Y spacing.
 */
function findRowAnchors(byCol: Map<number, TextItem[]>): number[] {
  let bestAnchors: number[] = []
  let bestScore = 0

  for (const colItems of Array.from(byCol.values())) {
    if (colItems.length < 2) continue
    const ys = colItems.map(i => i.y).sort((a, b) => b - a) // top→bottom

    const diffs = ys.slice(1).map((y, i) => ys[i] - y)
    const avg = diffs.reduce((s, d) => s + d, 0) / diffs.length
    if (avg <= 0) continue
    const stddev = Math.sqrt(diffs.reduce((s, d) => s + (d - avg) ** 2, 0) / diffs.length)
    const score = colItems.length / (1 + stddev / avg)

    if (score > bestScore) {
      bestScore = score
      bestAnchors = ys
    }
  }

  return bestAnchors
}

// ── Page → HTML ───────────────────────────────────────────────────────────────

function pageToHtml(items: TextItem[], images: ImageItem[], pageW: number): string {
  if (!items.length && !images.length) return ''

  // Build the text body first, then splice images in by vertical position.
  const body = items.length ? textBodyToHtml(items, pageW) : ''
  if (!images.length) return body

  const imgTags = images.map(im => {
    // Cap displayed width so huge images don't blow past the editor/page.
    const maxW = Math.min(im.w, 760)
    return `<p><img src="${im.dataUrl}" width="${maxW}" /></p>`
  })

  // If we have a positionable text layout, interleave images by Y; otherwise
  // just put them on top (most logos/headers sit above the text anyway).
  const topY = items.length ? Math.max(...items.map(i => i.y)) : 0
  const above: string[] = []
  const below: string[] = []
  for (let i = 0; i < images.length; i++) {
    (images[i].y >= topY ? above : below).push(imgTags[i])
  }
  return [...above, body, ...below].filter(Boolean).join('\n')
}

function textBodyToHtml(items: TextItem[], pageW: number): string {
  const cols = findColumns(items, pageW)

  if (cols.length >= 3) {
    // ── Column-first table extraction ─────────────────────────────────────
    const byCol = new Map<number, TextItem[]>()
    for (let c = 0; c < cols.length; c++) byCol.set(c, [])

    const tableItems: TextItem[] = []
    const textItems: TextItem[] = []

    for (const item of items) {
      const c = colFor(item.x, cols)
      // Accept item into table if its X is within 30pt of its column's expected start
      const colX = cols[c]
      const nextColX = c + 1 < cols.length ? cols[c + 1] : colX + pageW
      if (item.x >= colX - 12 && item.x < nextColX) {
        byCol.get(c)!.push(item)
        tableItems.push(item)
      } else {
        textItems.push(item)
      }
    }

    const anchors = findRowAnchors(byCol)
    const html: string[] = []

    // Render non-table text that sits ABOVE the table (header info)
    const tableTopY = tableItems.length ? Math.max(...tableItems.map(i => i.y)) : Infinity
    const headerItems = textItems.filter(i => i.y >= tableTopY - 20)
    const footerItems = textItems.filter(i => i.y < tableTopY - 20)

    if (headerItems.length) html.push(groupToText(headerItems))

    if (anchors.length >= 2) {
      // Calculate row pitch for tolerance
      const diffs = anchors.slice(1).map((y, i) => anchors[i] - y)
      const pitch = diffs.reduce((s, d) => s + d, 0) / diffs.length
      const tol = Math.max(pitch * 0.65, 6)

      // Build table rows: each anchor Y → one row
      const rowData: Array<{ anchorY: number; cells: Map<number, string[]> }> =
        anchors.map(ay => ({ anchorY: ay, cells: new Map() }))

      for (const item of tableItems) {
        let bestIdx = 0
        let bestDist = Math.abs(item.y - anchors[0])
        for (let k = 1; k < anchors.length; k++) {
          const d = Math.abs(item.y - anchors[k])
          if (d < bestDist) { bestDist = d; bestIdx = k }
        }
        if (bestDist > tol) continue  // too far from any anchor → skip
        const c = colFor(item.x, cols)
        const rd = rowData[bestIdx]
        if (!rd.cells.has(c)) rd.cells.set(c, [])
        rd.cells.get(c)!.push(item.str)
      }

      html.push('<table>')
      let firstRow = true
      for (const rd of rowData) {
        const cells: string[] = Array.from({ length: cols.length }, (_, c) =>
          (rd.cells.get(c) ?? []).join(' ').trim()
        )
        if (cells.every(c => !c)) continue

        const isHeader = firstRow &&
          cells.filter(c => c).some(c => c.toUpperCase() === c && /[A-Z]/.test(c))
        const td = isHeader ? 'th' : 'td'
        html.push('<tr>' + cells.map(c => `<${td}>${esc(c)}</${td}>`).join('') + '</tr>')
        firstRow = false
      }
      html.push('</table>')
    } else {
      // Not enough row anchors → fall through to text rendering
      return groupToText(items)
    }

    if (footerItems.length) html.push(groupToText(footerItems))

    return html.join('\n')
  }

  // ── Fallback: Y-grouping → text/heading paragraphs ────────────────────────
  return groupToText(items)
}

/** Y-group items into lines and convert to heading/paragraph HTML. */
function groupToText(items: TextItem[]): string {
  const groups: Array<{ y: number; items: TextItem[] }> = []
  for (const item of items) {
    const g = groups.find(g => Math.abs(g.y - item.y) < 4)
    if (g) g.items.push(item)
    else groups.push({ y: item.y, items: [item] })
  }

  const lines = groups
    .sort((a, b) => b.y - a.y)
    .map(g => g.items.sort((a, b) => a.x - b.x))

  const html: string[] = []
  for (const lineItems of lines) {
    // Join items with space proportional to gap
    let text = ''
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i]
      if (i === 0) { text += item.str; continue }
      const gap = item.x - (lineItems[i - 1].x + lineItems[i - 1].width)
      text += (gap > 4 ? ' ' : '') + item.str
    }
    text = text.trim()
    if (!text) continue
    const tag = classifyText(text)
    html.push(`<${tag}>${esc(text)}</${tag}>`)
  }
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

    if (!pages.some(p => p.items.length || p.images.length)) {
      return NextResponse.json(
        { error: 'Este PDF não contém texto extraível (pode ser um PDF de imagem/escaneado).' },
        { status: 422 }
      )
    }

    const htmlParts: string[] = []
    for (const { items, images, pageW } of pages) {
      const part = pageToHtml(items, images, pageW)
      if (part) htmlParts.push(part)
    }

    const html = htmlParts.join('\n<hr>\n')
    const title = file.name.replace(/\.pdf$/i, '')

    return NextResponse.json({ html, title, pages: numPages })
  } catch (err: unknown) {
    console.error('[parse-pdf]', err)
    const message = err instanceof Error ? err.message : 'Falha ao processar o PDF'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
