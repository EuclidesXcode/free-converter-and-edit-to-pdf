'use client'
import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  Box, Typography, Button, Tooltip, Paper,
  Alert, CircularProgress, Chip, Slider, Stack, Switch, FormControlLabel,
} from '@mui/material'
import { useDropzone } from 'react-dropzone'
import DownloadIcon from '@mui/icons-material/Download'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import DeleteIcon from '@mui/icons-material/Delete'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import type { TextAnnotation } from '@/types'

// ── PDF.js loader (browser) ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsPromise: Promise<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.js').then((lib) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(lib as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
      return lib
    })
  }
  return pdfjsPromise
}

interface RenderedPage { width: number; height: number; dataUrl: string }

const COLORS = ['#000000', '#D32F2F', '#1565C0', '#2E7D32', '#E65100', '#FFFFFF']

export default function EditSection() {
  const [step, setStep] = useState<'upload' | 'editing'>('upload')
  const [docTitle, setDocTitle] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([])
  const [annotations, setAnnotations] = useState<TextAnnotation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState('')

  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  // displayScale[i] = displayedPageWidthPx / pdfPageWidthPt — converts PDF
  // point sizes to on-screen pixels so text previews at its true final size.
  const [displayScale, setDisplayScale] = useState<number[]>([])

  // ── Render the uploaded PDF to images ──────────────────────────────────────
  const renderPdf = useCallback(async (file: File) => {
    setIsLoading(true)
    setError('')
    try {
      const pdfjs = await loadPdfjs()
      const buf = await file.arrayBuffer()
      const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise

      const pages: RenderedPage[] = []
      const scale = 1.5 // render at 1.5x for crisp display
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p)
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport }).promise
        pages.push({
          width: viewport.width / scale,   // CSS points (1x) for the layer math
          height: viewport.height / scale,
          dataUrl: canvas.toDataURL('image/png'),
        })
      }
      setRenderedPages(pages)
      setDocTitle(file.name.replace(/\.pdf$/i, ''))
      setPdfFile(file)
      setAnnotations([])
      setStep('editing')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao abrir o PDF')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0]
    if (file) renderPdf(file)
  }, [renderPdf])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    disabled: isLoading,
  })

  // ── Annotation handling ─────────────────────────────────────────────────────
  const addAnnotationAt = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore clicks that land on an existing annotation box.
    if ((e.target as HTMLElement).closest('[data-annotation]')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const xFraction = (e.clientX - rect.left) / rect.width
    const yFraction = (e.clientY - rect.top) / rect.height
    const id = crypto.randomUUID()
    setAnnotations((prev) => [
      ...prev,
      { id, pageIndex, xFraction, yFraction, text: '', fontSize: 14, color: '#000000', cover: false },
    ])
    setActiveId(id)
  }

  const updateAnnotation = (id: string, patch: Partial<TextAnnotation>) =>
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))

  const removeAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
    if (activeId === id) setActiveId(null)
  }

  const active = annotations.find((a) => a.id === activeId) ?? null

  // ── Download (apply edits over the original via pdf-lib) ─────────────────────
  const handleDownload = async () => {
    if (!pdfFile) return
    setIsDownloading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('pdf', pdfFile)
      fd.append('annotations', JSON.stringify(annotations.filter((a) => a.text.trim())))
      const res = await fetch('/api/edit', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Falha ao gerar PDF')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${docTitle || 'documento'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha no download')
    } finally {
      setIsDownloading(false)
    }
  }

  // Keep the active selection in sync if it gets deleted elsewhere.
  useEffect(() => {
    if (activeId && !annotations.some((a) => a.id === activeId)) setActiveId(null)
  }, [annotations, activeId])

  // Measure each page's on-screen width to derive the point→pixel scale, and
  // keep it current on resize so font previews stay true to the final PDF.
  useEffect(() => {
    if (step !== 'editing' || !renderedPages.length) return
    const measure = () => {
      setDisplayScale(renderedPages.map((pg, i) => {
        const el = pageRefs.current[i]
        return el ? el.clientWidth / pg.width : 1
      }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    pageRefs.current.forEach((el) => el && ro.observe(el))
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [step, renderedPages])

  // ── Upload screen ────────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <Box>
        <Box
          {...getRootProps()}
          sx={{
            border: '2px dashed',
            borderColor: isDragActive ? 'primary.main' : '#C5D5EA',
            borderRadius: 4,
            p: { xs: 6, md: 8 },
            textAlign: 'center',
            cursor: isLoading ? 'wait' : 'pointer',
            bgcolor: isDragActive ? 'rgba(21,101,192,0.05)' : '#FAFCFF',
            transition: 'all 0.2s',
            '&:hover': { borderColor: 'primary.main', bgcolor: 'rgba(21,101,192,0.04)' },
          }}
        >
          <input {...getInputProps()} />
          <Box
            sx={{
              width: 72, height: 72, borderRadius: '50%',
              bgcolor: isDragActive ? 'secondary.main' : 'primary.main',
              mx: 'auto', mb: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading
              ? <CircularProgress size={32} sx={{ color: '#fff' }} />
              : <PictureAsPdfIcon sx={{ color: '#fff', fontSize: 36 }} />}
          </Box>
          <Typography variant="h6" fontWeight={700} mb={0.5}>
            {isLoading ? 'Abrindo o PDF…' : isDragActive ? 'Solte o PDF aqui' : 'Faça upload do PDF para editar'}
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {isLoading ? 'Renderizando as páginas…' : 'Arraste e solte ou clique para selecionar'}
          </Typography>
          <Chip label=".PDF" size="small" sx={{ bgcolor: 'rgba(230,81,0,0.1)', color: 'secondary.dark', fontWeight: 700 }} />
        </Box>

        <Box mt={3} p={2.5} sx={{ bgcolor: '#F0F7FF', borderRadius: 3, border: '1px solid #B9D6F2' }}>
          <Typography variant="body2" color="primary.dark" fontWeight={600} mb={0.75}>
            ℹ️ Como funciona
          </Typography>
          <Typography variant="body2" color="text.secondary" lineHeight={1.7}>
            O PDF é exibido <strong>exatamente como o original</strong>. Clique em qualquer
            ponto da página para adicionar texto, e use a opção “cobrir” para tampar o
            conteúdo embaixo. O download preserva o documento original com as suas edições.
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}
      </Box>
    )
  }

  // ── Editing screen ─────────────────────────────────────────────────────────
  return (
    <Box>
      {/* Action bar */}
      <Paper
        elevation={0}
        sx={{
          border: '1px solid #E4EAF2', borderRadius: 3, px: 2, py: 1.5, mb: 2,
          display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
        }}
      >
        <PictureAsPdfIcon sx={{ color: 'secondary.main' }} />
        <Typography fontWeight={700} noWrap sx={{ flex: 1, minWidth: 120 }}>{docTitle}</Typography>
        <Chip
          label={`${renderedPages.length} página${renderedPages.length !== 1 ? 's' : ''}`}
          size="small"
          sx={{ bgcolor: 'rgba(21,101,192,0.1)', color: 'primary.dark', fontWeight: 600 }}
        />
        {annotations.length > 0 && (
          <Chip label={`${annotations.length} edição${annotations.length !== 1 ? 'es' : ''}`} size="small" color="secondary" variant="outlined" />
        )}
        <Box flex={1} />
        <Button
          variant="outlined" size="small" startIcon={<UploadFileIcon />}
          onClick={() => { setStep('upload'); setRenderedPages([]); setAnnotations([]); setPdfFile(null) }}
        >
          Trocar PDF
        </Button>
        <Button
          variant="contained" size="small"
          startIcon={isDownloading ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
          onClick={handleDownload} disabled={isDownloading}
        >
          {isDownloading ? 'Gerando…' : 'Baixar PDF'}
        </Button>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>{error}</Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
        {/* Pages */}
        <Box sx={{ flex: 1, bgcolor: '#E8ECF2', borderRadius: 3, p: { xs: 1.5, md: 3 }, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, textAlign: 'center' }}>
            <TextFieldsIcon sx={{ fontSize: 14, verticalAlign: 'middle', mr: 0.5 }} />
            Clique em qualquer lugar da página para adicionar texto
          </Typography>
          <Stack spacing={3} alignItems="center">
            {renderedPages.map((pg, i) => {
              const scale = displayScale[i] ?? 1
              return (
                <Box
                  key={i}
                  ref={(el: HTMLDivElement | null) => { pageRefs.current[i] = el }}
                  data-page={i}
                  onClick={(e) => addAnnotationAt(i, e)}
                  sx={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 800,
                    aspectRatio: `${pg.width} / ${pg.height}`,
                    boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
                    cursor: 'crosshair',
                    bgcolor: '#fff',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pg.dataUrl} alt={`Página ${i + 1}`} style={{ width: '100%', display: 'block' }} />

                  {/* Annotation boxes for this page */}
                  {annotations.filter((a) => a.pageIndex === i).map((a) => (
                    <Box
                      key={a.id}
                      data-annotation
                      onClick={(e) => { e.stopPropagation(); setActiveId(a.id) }}
                      sx={{
                        position: 'absolute',
                        left: `${a.xFraction * 100}%`,
                        top: `${a.yFraction * 100}%`,
                        outline: activeId === a.id ? '2px solid #1565C0' : '1px dashed rgba(21,101,192,0.5)',
                        bgcolor: a.cover ? '#fff' : 'transparent',
                        borderRadius: 0.5,
                        px: 0.25,
                        minWidth: 8,
                      }}
                    >
                      <Box
                        component="textarea"
                        value={a.text}
                        autoFocus={activeId === a.id}
                        placeholder="Digite…"
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                          updateAnnotation(a.id, { text: e.target.value })}
                        onFocus={() => setActiveId(a.id)}
                        sx={{
                          border: 'none', outline: 'none', background: 'transparent',
                          resize: 'none', overflow: 'hidden', p: 0, m: 0,
                          fontFamily: 'Helvetica, Arial, sans-serif',
                          // fontSize is in PDF points; scale to on-screen pixels
                          // so the preview matches the final PDF exactly.
                          fontSize: `${a.fontSize * scale}px`,
                          lineHeight: 1.25,
                          color: a.color,
                          width: `${Math.max(a.text.length, 4)}ch`,
                          minHeight: `${a.fontSize * scale * 1.3}px`,
                        }}
                      />
                    </Box>
                  ))}
                </Box>
              )
            })}
          </Stack>
        </Box>

        {/* Inspector */}
        <Paper
          elevation={0}
          sx={{
            width: { xs: '100%', md: 260 }, flexShrink: 0,
            border: '1px solid #E4EAF2', borderRadius: 3, p: 2,
            position: { md: 'sticky' }, top: { md: 16 },
          }}
        >
          {active ? (
            <Stack spacing={2}>
              <Typography variant="subtitle2" fontWeight={700}>Editar texto</Typography>

              <Box>
                <Typography variant="caption" color="text.secondary">Tamanho: {active.fontSize}pt</Typography>
                <Slider
                  size="small" min={6} max={72} value={active.fontSize}
                  onChange={(_, v) => updateAnnotation(active.id, { fontSize: v as number })}
                />
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>Cor</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {COLORS.map((c) => (
                    <Box
                      key={c}
                      onClick={() => updateAnnotation(active.id, { color: c })}
                      sx={{
                        width: 24, height: 24, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                        border: c === '#FFFFFF' ? '1px solid #ccc' : 'none',
                        outline: active.color === c ? '2px solid #1565C0' : 'none',
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </Stack>
              </Box>

              <FormControlLabel
                control={
                  <Switch
                    size="small" checked={!!active.cover}
                    onChange={(e) => updateAnnotation(active.id, { cover: e.target.checked })}
                  />
                }
                label={<Typography variant="body2">Cobrir conteúdo embaixo</Typography>}
              />

              <Tooltip title="Remover este texto">
                <Button
                  variant="outlined" color="error" size="small" startIcon={<DeleteIcon />}
                  onClick={() => removeAnnotation(active.id)}
                >
                  Remover
                </Button>
              </Tooltip>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Clique na página para adicionar texto, ou selecione uma edição existente para
              ajustar tamanho, cor e cobertura.
            </Typography>
          )}
        </Paper>
      </Box>
    </Box>
  )
}
