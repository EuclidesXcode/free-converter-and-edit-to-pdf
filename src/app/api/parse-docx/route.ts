import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!['docx', 'doc'].includes(ext)) {
      return NextResponse.json({ error: 'Formato inválido. Envie um arquivo .docx' }, { status: 400 })
    }

    const mammoth = await import('mammoth')
    const buffer = Buffer.from(await file.arrayBuffer())
    const { value: html, messages } = await mammoth.convertToHtml({ buffer })

    const warnings = messages.filter((m) => m.type === 'warning').map((m) => m.message)
    const title = file.name.replace(/\.[^.]+$/, '')

    return NextResponse.json({ html, title, warnings })
  } catch (err: unknown) {
    console.error('[parse-docx]', err)
    const message = err instanceof Error ? err.message : 'Falha ao processar o arquivo'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
