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

// ── PDF text extraction via pdfjs-dist ────────────────────────────────────────
async function extractTextFromPdf(buffer: Buffer): Promise<{ text: string; pages: number }> {
  installDOMMatrixPolyfill()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js') as any
  pdfjsLib.GlobalWorkerOptions.workerSrc = ''

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  })
  const pdfDoc = await loadingTask.promise
  const numPages: number = pdfDoc.numPages

  let allText = ''

  for (let p = 1; p <= numPages; p++) {
    const page = await pdfDoc.getPage(p)
    const content = await page.getTextContent()

    // Group text items into lines using Y-proximity clustering (tolerance = 4pt)
    const lineGroups: Array<{ y: number; items: Array<{ x: number; str: string }> }> = []
    for (const item of content.items) {
      if (!('str' in item) || !(item as { str: string }).str.trim()) continue
      const y = (item as { transform: number[] }).transform[5]
      const x = (item as { transform: number[] }).transform[4]
      const str = (item as { str: string }).str
      const existing = lineGroups.find((g) => Math.abs(g.y - y) < 4)
      if (existing) {
        existing.items.push({ x, str })
      } else {
        lineGroups.push({ y, items: [{ x, str }] })
      }
    }

    // Sort lines top → bottom (descending Y in PDF coordinate space)
    const sortedLines = lineGroups
      .sort((a, b) => b.y - a.y)
      .map((g) => g.items.sort((a, b) => a.x - b.x).map((i) => i.str).join(''))

    allText += sortedLines.join('\n') + '\n\n'
  }

  return { text: allText.trim(), pages: numPages }
}

// ── Text → HTML heuristic ─────────────────────────────────────────────────────
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function pdfTextToHtml(raw: string): string {
  const lines = raw.split('\n').map((l) => l.trim())
  const html: string[] = []
  let i = 0

  while (i < lines.length) {
    if (!lines[i]) { i++; continue }

    const block: string[] = []
    while (i < lines.length && lines[i]) { block.push(lines[i]); i++ }
    if (!block.length) continue

    if (block.length === 1) {
      const line = block[0]
      const isAllCaps =
        line === line.toUpperCase() &&
        line.length > 3 && line.length < 120 &&
        /[A-ZÀÁÂÃÉÊÍÓÔÕÚ]/.test(line)
      const isShortTitle =
        line.length < 70 &&
        !line.endsWith('.') && !line.endsWith(',') && !line.endsWith(';') &&
        !/^\d/.test(line)

      if (isAllCaps) html.push(`<h2>${esc(line)}</h2>`)
      else if (isShortTitle) html.push(`<h3>${esc(line)}</h3>`)
      else html.push(`<p>${esc(line)}</p>`)
    } else {
      const listRe = /^[-•*●–]\s+|^\d+[.)]\s+/
      const listCount = block.filter((l) => listRe.test(l)).length
      if (listCount >= Math.ceil(block.length * 0.6)) {
        const isOrdered = block.some((l) => /^\d+[.)]\s+/.test(l))
        const tag = isOrdered ? 'ol' : 'ul'
        const items = block.map((l) => `<li>${esc(l.replace(listRe, ''))}</li>`).join('')
        html.push(`<${tag}>${items}</${tag}>`)
      } else {
        html.push(`<p>${block.map(esc).join(' ')}</p>`)
      }
    }
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
    const { text, pages } = await extractTextFromPdf(buffer)

    if (!text) {
      return NextResponse.json(
        { error: 'Este PDF não contém texto extraível (pode ser um PDF de imagem/escaneado).' },
        { status: 422 }
      )
    }

    const html = pdfTextToHtml(text)
    const title = file.name.replace(/\.pdf$/i, '')

    return NextResponse.json({ html, title, pages })
  } catch (err: unknown) {
    console.error('[parse-pdf]', err)
    const message = err instanceof Error ? err.message : 'Falha ao processar o PDF'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
