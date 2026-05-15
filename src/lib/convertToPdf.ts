import PDFDocument from 'pdfkit'
import { load as cheerioLoad, type CheerioAPI, type Cheerio } from 'cheerio'
import type { AnyNode, Element as DomElement } from 'domhandler'

// ── Image dimension parser ────────────────────────────────────────────────────
// Returns pixel width/height and embedded DPI so we can replicate the original size.
function parseImageSize(buf: Buffer, mime: string): { w: number; h: number; dpi: number } | null {
  try {
    if (mime.includes('png')) {
      // PNG: signature 8 bytes, then IHDR chunk. Width @ byte 16, Height @ byte 20.
      if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null
      const w = buf.readUInt32BE(16)
      const h = buf.readUInt32BE(20)
      // Scan for pHYs chunk (pixels per unit) to get DPI
      let dpi = 96
      let off = 8
      while (off + 12 < buf.length) {
        const cLen = buf.readUInt32BE(off)
        const cType = buf.subarray(off + 4, off + 8).toString('ascii')
        if (cType === 'pHYs' && cLen >= 9) {
          const ppuX = buf.readUInt32BE(off + 8)
          const unit = buf[off + 16] // 1 = metre
          if (unit === 1 && ppuX > 0) dpi = Math.round(ppuX / 39.3701)
        }
        if (cType === 'IDAT') break
        off += 12 + cLen
      }
      return { w, h, dpi }
    }
    if (mime.includes('jpeg') || mime.includes('jpg')) {
      // JPEG: scan for JFIF/EXIF APP0 (density) and SOF0/1/2 (dimensions).
      if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null
      let dpi = 96
      let w = 0; let h = 0
      let off = 2
      while (off + 4 < buf.length) {
        if (buf[off] !== 0xFF) break
        const marker = buf[off + 1]
        const segLen = buf.readUInt16BE(off + 2)
        // JFIF APP0 – density
        if (marker === 0xE0 && segLen >= 14) {
          const unit = buf[off + 11]
          const xd = buf.readUInt16BE(off + 12)
          if (unit === 1 && xd > 0) dpi = xd
          else if (unit === 2 && xd > 0) dpi = Math.round(xd * 2.54)
        }
        // SOF markers – width & height
        if (marker >= 0xC0 && marker <= 0xC3 && segLen >= 9) {
          h = buf.readUInt16BE(off + 5)
          w = buf.readUInt16BE(off + 7)
        }
        off += 2 + segLen
      }
      if (w > 0 && h > 0) return { w, h, dpi }
    }
  } catch { /* ignore malformed headers */ }
  return null
}

// ── DOCX ──────────────────────────────────────────────────────────────────────
export async function docxToPdf(buffer: Buffer): Promise<Buffer> {
  const mammoth = await import('mammoth')
  const { value: html } = await mammoth.convertToHtml({ buffer }, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    convertImage: (mammoth as any).images.imgElement(async (image: any) => {
      const buf: Buffer = await image.read()
      return { src: `data:${image.contentType};base64,${buf.toString('base64')}` }
    }),
  })
  return htmlToPdf(html)
}

// ── XLSX / XLS / CSV ──────────────────────────────────────────────────────────
export async function xlsxToPdf(buffer: Buffer, filename: string): Promise<Buffer> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#1565C0')
      .text(filename.replace(/\.[^.]+$/, ''), { align: 'center' })
    doc.moveDown()

    workbook.SheetNames.forEach((sheetName, idx) => {
      if (idx > 0) doc.addPage()
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#333').text(`Sheet: ${sheetName}`)
      doc.moveDown(0.5)

      const sheet = workbook.Sheets[sheetName]
      const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][]
      if (rows.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor('#666').text('(empty sheet)')
        return
      }

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
      const headers = rows[0].map(String)
      const colCount = Math.min(headers.length, 10)
      const colWidth = pageWidth / colCount
      const startX = doc.page.margins.left
      const PH = 4
      const PV = 5
      const MIN_ROW_H = 18

      function calcH(cells: string[], sz: number, font: string): number {
        doc.font(font).fontSize(sz)
        const heights = cells.slice(0, colCount).map(c =>
          c ? doc.heightOfString(String(c), { width: colWidth - PH * 2 }) : 0
        )
        return Math.max(MIN_ROW_H, Math.max(...heights) + PV * 2)
      }

      // Header row
      const headerH = calcH(headers, 9, 'Helvetica-Bold')
      if (doc.y + headerH > doc.page.height - doc.page.margins.bottom) doc.addPage()
      const headerY = doc.y
      doc.rect(startX, headerY, pageWidth, headerH).fill('#1565C0')
      headers.slice(0, colCount).forEach((h, i) => {
        doc.fillColor('white').fontSize(9).font('Helvetica-Bold')
          .text(h || '', startX + i * colWidth + PH, headerY + PV, {
            width: colWidth - PH * 2, lineBreak: true, height: headerH - PV * 2,
          })
      })
      doc.y = headerY + headerH

      rows.slice(1).forEach((row, rIdx) => {
        const rh = calcH(row.map(String), 8.5, 'Helvetica')
        if (doc.y + rh > doc.page.height - doc.page.margins.bottom) doc.addPage()
        const bg = rIdx % 2 === 0 ? '#F8FAFC' : '#FFFFFF'
        const rowY = doc.y
        doc.rect(startX, rowY, pageWidth, rh).fill(bg).strokeColor('#E0E6EF').stroke()
        row.slice(0, colCount).forEach((cell, i) => {
          doc.fillColor('#333').fontSize(8.5).font('Helvetica')
            .text(String(cell ?? ''), startX + i * colWidth + PH, rowY + PV, {
              width: colWidth - PH * 2, lineBreak: true, height: rh - PV * 2,
            })
        })
        doc.y = rowY + rh
      })
    })

    doc.end()
  })
}

// ── TXT ───────────────────────────────────────────────────────────────────────
export function txtToPdf(text: string, filename: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 60, size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1565C0').text(filename.replace(/\.[^.]+$/, ''))
    doc.moveDown()
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#E0E0E0').stroke()
    doc.moveDown()
    doc.fontSize(11).font('Helvetica').fillColor('#222').text(text, { lineGap: 4 })
    doc.end()
  })
}

// ── Markdown ──────────────────────────────────────────────────────────────────
export async function markdownToPdf(text: string, filename: string): Promise<Buffer> {
  const { marked } = await import('marked')
  const html = await marked(text)
  return htmlToPdf(html, filename.replace(/\.[^.]+$/, ''))
}

// ── HTML → PDF (shared) ───────────────────────────────────────────────────────
export function htmlToPdf(html: string, title?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 60, size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    if (title) {
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#1565C0').text(title, { align: 'center' })
      doc.moveDown()
    }

    const $ = cheerioLoad(html)
    renderChildren(doc, $, $('body').children().toArray(), 0)
    doc.end()
  })
}

// ── Recursive element renderer ────────────────────────────────────────────────
function renderChildren(
  doc: PDFKit.PDFDocument,
  $: CheerioAPI,
  elements: AnyNode[],
  depth: number
) {
  for (const el of elements) {
    if (el.type === 'text') {
      const text = (el as { data?: string }).data?.trim()
      if (text) doc.font('Helvetica').fontSize(11).fillColor('#222').text(text, { lineGap: 3 })
      continue
    }
    if (el.type !== 'tag') continue

    const domEl = el as DomElement
    const tag = domEl.name.toLowerCase()
    const $el = $(el) as Cheerio<AnyNode>
    const rawText = $el.text().trim()

    switch (tag) {
      case 'h1':
        doc.moveDown(0.3)
        doc.font('Helvetica-Bold').fontSize(22).fillColor('#1A1A2E').text(rawText)
        doc.moveDown(0.4)
        break
      case 'h2':
        doc.moveDown(0.3)
        doc.font('Helvetica-Bold').fontSize(18).fillColor('#1A1A2E').text(rawText)
        doc.moveDown(0.3)
        break
      case 'h3':
        doc.moveDown(0.2)
        doc.font('Helvetica-Bold').fontSize(15).fillColor('#1A1A2E').text(rawText)
        doc.moveDown(0.2)
        break
      case 'h4':
      case 'h5':
      case 'h6':
        doc.moveDown(0.2)
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#333').text(rawText)
        doc.moveDown(0.2)
        break
      case 'p':
        if (rawText) {
          renderInline(doc, $, $el.contents().toArray())
          doc.moveDown(0.6)
        }
        break
      case 'br':
        doc.moveDown(0.3)
        break
      case 'hr':
        doc.moveDown(0.5)
        doc
          .moveTo(doc.page.margins.left, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y)
          .strokeColor('#CCCCCC')
          .lineWidth(1)
          .stroke()
        doc.moveDown(0.5)
        break
      case 'ul':
      case 'ol': {
        $el.children('li').each((_i: number, li: AnyNode) => {
          const idx = _i
          const bullet = tag === 'ol' ? `${idx + 1}.` : '•'
          const liText = $(li).text().trim()
          if (liText) {
            doc
              .font('Helvetica')
              .fontSize(11)
              .fillColor('#222')
              .text(`${bullet}  ${liText}`, { indent: 20 + depth * 14, lineGap: 2 })
          }
        })
        doc.moveDown(0.4)
        break
      }
      case 'table':
        renderTable(doc, $, $el as Cheerio<DomElement>)
        doc.moveDown(0.6)
        break
      case 'blockquote':
        doc
          .font('Helvetica-Oblique')
          .fontSize(11)
          .fillColor('#444')
          .text(rawText, { indent: 14, lineGap: 3 })
        doc.moveDown(0.5)
        break
      case 'pre':
      case 'code':
        if (rawText) {
          doc.font('Courier').fontSize(9.5).fillColor('#222').text(rawText, { lineGap: 2 })
          doc.moveDown(0.4)
        }
        break
      case 'img': {
        const src = (domEl.attribs as Record<string, string>)?.src ?? ''
        if (!src.startsWith('data:')) break
        // pdfkit supports JPEG and PNG natively; skip SVG/WebP/GIF
        const match = src.match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i)
        if (!match) break
        const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right
        try {
          const imgBuf = Buffer.from(match[2], 'base64')
          const dims = parseImageSize(imgBuf, match[1].toLowerCase())

          // Convert pixel size to PDF points using the image's own DPI metadata.
          // If metadata is absent, fall back to 96 dpi (Word/screen default).
          let renderW: number
          if (dims && dims.w > 0 && dims.h > 0) {
            const ptW = (dims.w / dims.dpi) * 72
            // Never exceed the usable page width; keep aspect ratio.
            renderW = Math.min(ptW, usableW)
          } else {
            // No dimension metadata — use at most 60% of page width as a safe default.
            renderW = usableW * 0.6
          }

          // Ensure there's at least renderH worth of space; add page if needed.
          const aspect = dims ? dims.h / dims.w : 0.75
          const renderH = renderW * aspect
          if (doc.y + renderH > doc.page.height - doc.page.margins.bottom) doc.addPage()

          const yBefore = doc.y
          doc.image(imgBuf, doc.page.margins.left, doc.y, { width: renderW })
          // Guard: if pdfkit didn't advance doc.y, do it manually.
          if (doc.y <= yBefore) doc.y = yBefore + renderH
          doc.moveDown(0.5)
        } catch { /* skip unrenderable image */ }
        break
      }
      case 'figure':
        renderChildren(doc, $, $el.contents().toArray(), depth)
        doc.moveDown(0.3)
        break
      default:
        renderChildren(doc, $, $el.contents().toArray(), depth)
    }
  }
}

function renderInline(doc: PDFKit.PDFDocument, $: CheerioAPI, nodes: AnyNode[]) {
  const segments: Array<{ text: string; bold: boolean; italic: boolean }> = []

  function collect(nodeList: AnyNode[], bold: boolean, italic: boolean) {
    for (const node of nodeList) {
      if (node.type === 'text') {
        const t = (node as { data?: string }).data ?? ''
        if (t) segments.push({ text: t, bold, italic })
      } else if (node.type === 'tag') {
        const name = (node as DomElement).name.toLowerCase()
        collect(
          $(node).contents().toArray(),
          bold || name === 'strong' || name === 'b',
          italic || name === 'em' || name === 'i'
        )
      }
    }
  }
  collect(nodes, false, false)

  if (!segments.length) return

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const continued = i < segments.length - 1
    const font = seg.bold
      ? seg.italic ? 'Helvetica-BoldOblique' : 'Helvetica-Bold'
      : seg.italic ? 'Helvetica-Oblique' : 'Helvetica'
    doc.font(font).fontSize(11).fillColor('#222').text(seg.text, { continued, lineGap: 3 })
  }
}

function renderTable(doc: PDFKit.PDFDocument, $: CheerioAPI, $table: Cheerio<DomElement>) {
  const rows: string[][] = []
  $table.find('tr').each((_: number, tr: AnyNode) => {
    const cells: string[] = []
    $(tr).find('td, th').each((__: number, cell: AnyNode) => { cells.push($(cell).text().trim()) })
    if (cells.length) rows.push(cells)
  })
  if (!rows.length) return

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const colCount = Math.min(rows[0].length, 8)
  const colWidth = pageWidth / colCount
  const startX = doc.page.margins.left
  const PH = 4
  const PV = 5
  const MIN_ROW_H = 18

  function calcH(cells: string[], sz: number, font: string): number {
    doc.font(font).fontSize(sz)
    const heights = cells.slice(0, colCount).map(c =>
      c ? doc.heightOfString(c, { width: colWidth - PH * 2 }) : 0
    )
    return Math.max(MIN_ROW_H, Math.max(...heights) + PV * 2)
  }

  // Header row
  const headerH = calcH(rows[0], 9, 'Helvetica-Bold')
  if (doc.y + headerH > doc.page.height - doc.page.margins.bottom) doc.addPage()
  const tableHeaderY = doc.y
  doc.rect(startX, tableHeaderY, pageWidth, headerH).fill('#1565C0')
  rows[0].slice(0, colCount).forEach((cell, i) => {
    doc.fillColor('white').fontSize(9).font('Helvetica-Bold')
      .text(cell, startX + i * colWidth + PH, tableHeaderY + PV, {
        width: colWidth - PH * 2, lineBreak: true, height: headerH - PV * 2,
      })
  })
  doc.y = tableHeaderY + headerH

  rows.slice(1).forEach((row, rIdx) => {
    const rh = calcH(row, 8.5, 'Helvetica')
    if (doc.y + rh > doc.page.height - doc.page.margins.bottom) doc.addPage()
    const rowY = doc.y
    doc.rect(startX, rowY, pageWidth, rh)
      .fill(rIdx % 2 === 0 ? '#F5F7FA' : '#FFFFFF').strokeColor('#E0E6EF').stroke()
    row.slice(0, colCount).forEach((cell, i) => {
      doc.fillColor('#333').fontSize(8.5).font('Helvetica')
        .text(cell, startX + i * colWidth + PH, rowY + PV, {
          width: colWidth - PH * 2, lineBreak: true, height: rh - PV * 2,
        })
    })
    doc.y = rowY + rh
  })
}
