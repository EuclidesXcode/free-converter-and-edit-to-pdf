import { NextRequest, NextResponse } from 'next/server'
import { htmlToPdf } from '@/lib/convertToPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { html, title } = await request.json() as { html: string; title?: string }
    if (!html?.trim()) return NextResponse.json({ error: 'Conteúdo HTML ausente' }, { status: 400 })

    const pdfBuffer = await htmlToPdf(html, title)
    const filename = (title ?? 'documento').replace(/[^a-zA-Z0-9\-_À-ÿ ]/g, '_')

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (err: unknown) {
    console.error('[html-to-pdf]', err)
    const message = err instanceof Error ? err.message : 'Falha ao gerar PDF'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
