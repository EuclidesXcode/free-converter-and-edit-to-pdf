import { NextRequest, NextResponse } from 'next/server'
import { docxToPdf, xlsxToPdf, txtToPdf, markdownToPdf, htmlToPdf } from '@/lib/convertToPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPPORTED: Record<string, string> = {
  docx: 'docx',
  doc: 'docx', // attempt with mammoth
  xlsx: 'xlsx',
  xls: 'xlsx',
  csv: 'xlsx',
  ods: 'xlsx',
  txt: 'txt',
  html: 'html',
  htm: 'html',
  md: 'md',
  markdown: 'md',
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

    const filename = file.name
    const ext = filename.split('.').pop()?.toLowerCase() ?? ''
    const type = SUPPORTED[ext]

    if (!type) {
      return NextResponse.json(
        { error: `Formato ".${ext}" não suportado. Formatos aceitos: ${Object.keys(SUPPORTED).join(', ')}` },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    let pdfBuffer: Buffer

    switch (type) {
      case 'docx':
        pdfBuffer = await docxToPdf(buffer)
        break
      case 'xlsx':
        pdfBuffer = await xlsxToPdf(buffer, filename)
        break
      case 'txt':
        pdfBuffer = await txtToPdf(buffer.toString('utf-8'), filename)
        break
      case 'html':
        pdfBuffer = await htmlToPdf(buffer.toString('utf-8'), filename.replace(/\.[^.]+$/, ''))
        break
      case 'md':
        pdfBuffer = await markdownToPdf(buffer.toString('utf-8'), filename.replace(/\.[^.]+$/, ''))
        break
      default:
        return NextResponse.json({ error: 'Formato não suportado' }, { status: 400 })
    }

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename.replace(/\.[^.]+$/, '')}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (err: unknown) {
    console.error('[convert]', err)
    const message = err instanceof Error ? err.message : 'Conversion failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
