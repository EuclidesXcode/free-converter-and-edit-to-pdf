import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { TextAnnotation } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean, 16)
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
      const x = ann.xFraction * width
      // PDF y-axis starts from bottom-left; convert from top-origin fraction
      const y = height - ann.yFraction * height

      const { r, g, b } = hexToRgb(ann.color ?? '#000000')
      const fontSize = Math.max(6, Math.min(ann.fontSize ?? 14, 144))

      page.drawText(ann.text, {
        x: Math.max(0, Math.min(x, width - 10)),
        y: Math.max(fontSize, Math.min(y, height - 4)),
        size: fontSize,
        font,
        color: rgb(r, g, b),
        maxWidth: width - x - 10,
        lineHeight: fontSize * 1.3,
      })
    }

    const pdfBytes = await pdfDoc.save()

    return new NextResponse(Buffer.from(pdfBytes), {
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
