'use client'
import React, { useState, useCallback, useEffect } from 'react'
import {
  Box, Typography, Button, Tooltip, IconButton, Paper,
  TextField, Alert, CircularProgress, Chip, Divider,
} from '@mui/material'
import { useDropzone } from 'react-dropzone'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import DownloadIcon from '@mui/icons-material/Download'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft'
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter'
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS'
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'

// ── Toolbar button ─────────────────────────────────────────────────────────────
function ToolbarBtn({
  active, disabled, tooltip, onClick, children,
}: {
  active?: boolean; disabled?: boolean; tooltip: string
  onClick: () => void; children: React.ReactNode
}) {
  return (
    <Tooltip title={tooltip} arrow>
      <span>
        <IconButton
          size="small"
          disabled={disabled}
          onClick={onClick}
          sx={{
            borderRadius: 1.5,
            bgcolor: active ? 'primary.main' : 'transparent',
            color: active ? '#fff' : 'text.primary',
            '&:hover': { bgcolor: active ? 'primary.dark' : 'action.hover' },
            width: 32,
            height: 32,
          }}
        >
          {children}
        </IconButton>
      </span>
    </Tooltip>
  )
}

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null
  const s = { fontSize: 17 }
  return (
    <Paper
      elevation={0}
      sx={{
        border: '1px solid #E4EAF2',
        borderRadius: '12px 12px 0 0',
        px: 1.5, py: 1,
        display: 'flex', alignItems: 'center', gap: 0.25, flexWrap: 'wrap',
        bgcolor: '#FAFCFF',
      }}
    >
      <ToolbarBtn tooltip="Desfazer" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><UndoIcon sx={s} /></ToolbarBtn>
      <ToolbarBtn tooltip="Refazer" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><RedoIcon sx={s} /></ToolbarBtn>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
      {([1, 2, 3] as const).map((lv) => (
        <ToolbarBtn key={lv} tooltip={`Título ${lv}`} active={editor.isActive('heading', { level: lv })} onClick={() => editor.chain().focus().toggleHeading({ level: lv }).run()}>
          <Typography variant="caption" fontWeight={700} sx={{ fontSize: 11, lineHeight: 1 }}>H{lv}</Typography>
        </ToolbarBtn>
      ))}
      <ToolbarBtn tooltip="Parágrafo" active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()}>
        <Typography variant="caption" fontWeight={700} sx={{ fontSize: 11 }}>P</Typography>
      </ToolbarBtn>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
      <ToolbarBtn tooltip="Negrito" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><FormatBoldIcon sx={s} /></ToolbarBtn>
      <ToolbarBtn tooltip="Itálico" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><FormatItalicIcon sx={s} /></ToolbarBtn>
      <ToolbarBtn tooltip="Sublinhado" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><FormatUnderlinedIcon sx={s} /></ToolbarBtn>
      <ToolbarBtn tooltip="Tachado" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><StrikethroughSIcon sx={s} /></ToolbarBtn>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
      <ToolbarBtn tooltip="Lista com marcadores" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><FormatListBulletedIcon sx={s} /></ToolbarBtn>
      <ToolbarBtn tooltip="Lista numerada" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><FormatListNumberedIcon sx={s} /></ToolbarBtn>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
      <ToolbarBtn tooltip="Esquerda" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><FormatAlignLeftIcon sx={s} /></ToolbarBtn>
      <ToolbarBtn tooltip="Centralizar" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><FormatAlignCenterIcon sx={s} /></ToolbarBtn>
      <ToolbarBtn tooltip="Direita" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><FormatAlignRightIcon sx={s} /></ToolbarBtn>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
      <ToolbarBtn tooltip="Linha horizontal" onClick={() => editor.chain().focus().setHorizontalRule().run()}><HorizontalRuleIcon sx={s} /></ToolbarBtn>
    </Paper>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function EditSection() {
  const [step, setStep] = useState<'upload' | 'editing'>('upload')
  const [docTitle, setDocTitle] = useState('')
  const [pages, setPages] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState('')

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: '',
    editorProps: { attributes: { class: 'tiptap-doc' } },
  })

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      .tiptap-doc { outline:none; min-height:600px; font-family:"Inter","Roboto",Arial,sans-serif; font-size:1rem; line-height:1.8; color:#1A1A2E; }
      .tiptap-doc h1 { font-size:2em; font-weight:700; margin:.6em 0 .3em; color:#0D47A1; }
      .tiptap-doc h2 { font-size:1.5em; font-weight:700; margin:.5em 0 .25em; color:#1A1A2E; }
      .tiptap-doc h3 { font-size:1.2em; font-weight:600; margin:.5em 0 .2em; color:#1A1A2E; }
      .tiptap-doc p  { margin:.4em 0; }
      .tiptap-doc strong { font-weight:700; }
      .tiptap-doc em { font-style:italic; }
      .tiptap-doc u  { text-decoration:underline; }
      .tiptap-doc s  { text-decoration:line-through; }
      .tiptap-doc ul { padding-left:1.8em; margin:.4em 0; list-style:disc; }
      .tiptap-doc ol { padding-left:1.8em; margin:.4em 0; list-style:decimal; }
      .tiptap-doc li { margin:.2em 0; }
      .tiptap-doc blockquote { border-left:4px solid #1565C0; padding-left:1em; margin:.8em 0; color:#444; font-style:italic; }
      .tiptap-doc pre { background:#F4F6FA; border-radius:6px; padding:.8em 1.2em; font-family:monospace; font-size:.9em; overflow-x:auto; }
      .tiptap-doc hr  { border:none; border-top:2px solid #E4EAF2; margin:1.2em 0; }
      .tiptap-doc table { border-collapse:collapse; width:100%; margin:.8em 0; }
      .tiptap-doc td,.tiptap-doc th { border:1px solid #C5D5EA; padding:6px 10px; }
      .tiptap-doc th { background:#EBF2FF; font-weight:700; }
    `
    document.head.appendChild(style)
    return () => { document.head.removeChild(style) }
  }, [])

  const onDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0]
    if (!file) return
    setIsLoading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/parse-pdf', { method: 'POST', body: formData })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Falha ao processar o PDF')
      }

      const { html, title, pages: numPages } = await res.json() as { html: string; title: string; pages: number }
      setDocTitle(title)
      setPages(numPages)
      editor?.commands.setContent(html)
      setStep('editing')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro inesperado')
    } finally {
      setIsLoading(false)
    }
  }, [editor])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    disabled: isLoading,
  })

  const handleDownload = async () => {
    if (!editor) return
    setIsDownloading(true)
    setError('')
    try {
      const res = await fetch('/api/html-to-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: editor.getHTML(), title: docTitle }),
      })
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

  // ── Upload ─────────────────────────────────────────────────────────────────
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
              : <PictureAsPdfIcon sx={{ color: '#fff', fontSize: 36 }} />
            }
          </Box>
          <Typography variant="h6" fontWeight={700} mb={0.5}>
            {isLoading ? 'Lendo o PDF…' : isDragActive ? 'Solte o PDF aqui' : 'Faça upload do PDF para editar'}
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {isLoading ? 'Extraindo o conteúdo de texto…' : 'Arraste e solte ou clique para selecionar'}
          </Typography>
          <Chip label=".PDF" size="small" sx={{ bgcolor: 'rgba(230,81,0,0.1)', color: 'secondary.dark', fontWeight: 700 }} />
        </Box>

        <Box mt={3} p={2.5} sx={{ bgcolor: '#FFF8F0', borderRadius: 3, border: '1px solid #FFD0A0' }}>
          <Typography variant="body2" color="secondary.dark" fontWeight={600} mb={0.75}>
            ⚠️ Observação importante
          </Typography>
          <Typography variant="body2" color="text.secondary" lineHeight={1.7}>
            Esta ferramenta extrai o <strong>texto</strong> do PDF e abre no editor. Funciona bem
            para PDFs com texto selecionável (contratos, relatórios, propostas).
            PDFs compostos por imagens ou escaneados não têm texto extraível.
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

  // ── Editor ─────────────────────────────────────────────────────────────────
  return (
    <Box>
      {/* Action bar */}
      <Paper
        elevation={0}
        sx={{
          border: '1px solid #E4EAF2',
          borderRadius: 3,
          px: 2, py: 1.5, mb: 2,
          display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
        }}
      >
        <CloudUploadIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
        <TextField
          value={docTitle}
          onChange={(e) => setDocTitle(e.target.value)}
          variant="standard"
          size="small"
          placeholder="Nome do documento"
          inputProps={{ style: { fontWeight: 700, fontSize: '1rem' } }}
          sx={{ flex: 1, minWidth: 160 }}
        />
        {pages > 0 && (
          <Chip
            label={`${pages} página${pages !== 1 ? 's' : ''}`}
            size="small"
            sx={{ bgcolor: 'rgba(21,101,192,0.1)', color: 'primary.dark', fontWeight: 600 }}
          />
        )}
        <Box flex={1} />
        <Button
          variant="outlined"
          size="small"
          startIcon={<UploadFileIcon />}
          onClick={() => { setStep('upload'); editor?.commands.clearContent() }}
        >
          Trocar PDF
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={isDownloading ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
          onClick={handleDownload}
          disabled={isDownloading}
        >
          {isDownloading ? 'Gerando PDF…' : 'Baixar como PDF'}
        </Button>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Editor area */}
      <Box sx={{ bgcolor: '#E8ECF2', borderRadius: 3, p: { xs: 2, md: 4 }, minHeight: 700 }}>
        <Box sx={{ maxWidth: 820, mx: 'auto' }}>
          <EditorToolbar editor={editor} />
          <Box
            sx={{
              bgcolor: '#fff',
              border: '1px solid #E4EAF2',
              borderTop: 'none',
              borderRadius: '0 0 12px 12px',
              px: { xs: 3, md: 6 },
              py: 5,
              boxShadow: '0 8px 40px rgba(0,0,0,0.1)',
              minHeight: 600,
              cursor: 'text',
            }}
            onClick={() => editor?.commands.focus()}
          >
            <EditorContent editor={editor} />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
