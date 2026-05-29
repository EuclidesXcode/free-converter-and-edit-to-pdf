import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { TextAnnotation } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean, 16)
  return {
    r: ((bigint >> 16) & 255) / 255,
    g: ((bigint >> 8) & 255) / 255,
    b: (bigint & 255) / 255,
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const pdfFile = formData.get('pdf') as File | null
    const annotationsRaw = formData.get('annotations') as string | null

    if (!pdfFile) return NextResponse.json({ error: 'Nenhum PDF enviado' }, { status: 400 })

    const annotations: TextAnnotation[] = annotationsRaw ? JSON.parse(annotationsRaw) : []

    const arrayBuffer = await pdfFile.arrayBuffer()
    const pdfDoc = await PDFDocument.load(arrayBuffer)
    const pages = pdfDoc.getPages()

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

    for (const ann of annotations) {
      if (!ann.text?.trim()) continue
      const page = pages[ann.pageIndex]
      if (!page) continue

      const { width, height } = page.getSize()
      const fontSize = Math.max(6, Math.min(ann.fontSize ?? 14, 144))

      // The front-end reports the TOP-LEFT of the text box as a fraction of the
      // rendered page (top = baseline + ~0.8·ascent, matching the capture in
      // EditSection). PDF space has a bottom-left origin and drawText anchors at
      // the baseline, so drop one ascent (0.8·fontSize) below the box top.
      const x = ann.xFraction * width
      const topY = height - ann.yFraction * height
      const baselineY = topY - fontSize * 0.8

      const { r, g, b } = hexToRgb(ann.color ?? '#000000')

      // Optional white knock-out box behind the text so edits can cover the
      // underlying original content (used for "replace" edits).
      if (ann.cover) {
        const textWidth = font.widthOfTextAtSize(ann.text, fontSize)
        page.drawRectangle({
          x: x - 1,
          y: baselineY - fontSize * 0.25,
          width: Math.min(textWidth + 2, width - x),
          height: fontSize * 1.35,
          color: rgb(1, 1, 1),
        })
      }

      page.drawText(ann.text, {
        x: Math.max(0, Math.min(x, width - 4)),
        y: Math.max(2, Math.min(baselineY, height - fontSize)),
        size: fontSize,
        font,
        color: rgb(r, g, b),
        lineHeight: fontSize * 1.3,
      })
    }

    const pdfBytes = await pdfDoc.save()

    return new NextResponse(Buffer.from(pdfBytes) as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="edited.pdf"`,
      },
    })
  } catch (err: unknown) {
    console.error('[edit]', err)
    const message = err instanceof Error ? err.message : 'Falha ao processar edições'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
