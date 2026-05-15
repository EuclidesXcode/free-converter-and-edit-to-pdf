'use client'
import React, { useState, useCallback } from 'react'
import {
  Box, Typography, Button, Stack, IconButton, Chip, Tooltip,
  CircularProgress, Alert, LinearProgress, Paper,
} from '@mui/material'
import { useDropzone } from 'react-dropzone'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import DescriptionIcon from '@mui/icons-material/Description'
import DeleteIcon from '@mui/icons-material/Delete'
import DownloadIcon from '@mui/icons-material/Download'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import type { FileItem } from '@/types'

const ACCEPTED_TYPES: Record<string, string[]> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/plain': ['.txt'],
  'text/html': ['.html', '.htm'],
  'text/csv': ['.csv'],
  'text/markdown': ['.md'],
}

const FORMAT_LABELS = ['DOCX', 'XLSX', 'XLS', 'CSV', 'TXT', 'HTML', 'Markdown']

function FileRow({ item, onRemove }: { item: FileItem; onRemove: () => void }) {
  const ext = item.file.name.split('.').pop()?.toUpperCase() ?? 'FILE'

  const handleDownload = () => {
    if (!item.pdfBlob) return
    const url = URL.createObjectURL(item.pdfBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = item.file.name.replace(/\.[^.]+$/, '') + '.pdf'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        borderRadius: 3,
        transition: 'all 0.2s',
        borderColor: item.status === 'done' ? 'success.light' : item.status === 'error' ? 'error.light' : 'divider',
        bgcolor: item.status === 'done' ? '#F1FBF4' : item.status === 'error' ? '#FFF5F5' : 'background.paper',
      }}
    >
      <Box
        sx={{
          bgcolor: item.status === 'done' ? 'success.main' : item.status === 'error' ? 'error.main' : 'primary.main',
          borderRadius: 1.5,
          width: 40,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {item.status === 'done' ? (
          <PictureAsPdfIcon sx={{ color: '#fff', fontSize: 22 }} />
        ) : (
          <DescriptionIcon sx={{ color: '#fff', fontSize: 22 }} />
        )}
      </Box>

      <Box flex={1} minWidth={0}>
        <Typography variant="body2" fontWeight={600} noWrap>
          {item.file.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {(item.file.size / 1024).toFixed(1)} KB · {ext}
        </Typography>
        {item.status === 'converting' && (
          <LinearProgress sx={{ mt: 0.5, height: 3 }} />
        )}
        {item.status === 'error' && (
          <Typography variant="caption" color="error.main" display="block">
            {item.error ?? 'Falha na conversão'}
          </Typography>
        )}
      </Box>

      <Stack direction="row" spacing={0.5} alignItems="center">
        {item.status === 'converting' && (
          <CircularProgress size={20} thickness={5} />
        )}
        {item.status === 'done' && (
          <>
            <Chip
              icon={<CheckCircleIcon />}
              label="PDF pronto"
              color="success"
              size="small"
              variant="outlined"
            />
            <Tooltip title="Baixar PDF">
              <IconButton color="primary" onClick={handleDownload} size="small">
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          </>
        )}
        {item.status === 'error' && (
          <ErrorIcon color="error" />
        )}
        <Tooltip title="Remover">
          <IconButton size="small" onClick={onRemove} sx={{ color: 'text.secondary' }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  )
}

export default function ConvertSection() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [globalError, setGlobalError] = useState('')

  const onDrop = useCallback((accepted: File[]) => {
    const newItems: FileItem[] = accepted.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      status: 'idle',
    }))
    setFiles((prev) => [...prev, ...newItems])
    setGlobalError('')
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    multiple: true,
  })

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id))

  const convertAll = async () => {
    const pending = files.filter((f) => f.status === 'idle' || f.status === 'error')
    if (!pending.length) return

    setFiles((prev) =>
      prev.map((f) =>
        pending.some((p) => p.id === f.id) ? { ...f, status: 'converting', error: undefined } : f
      )
    )

    await Promise.all(
      pending.map(async (item) => {
        try {
          const formData = new FormData()
          formData.append('file', item.file)

          const res = await fetch('/api/convert', { method: 'POST', body: formData })

          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Unknown error' }))
            throw new Error(body.error ?? `Server error ${res.status}`)
          }

          const blob = await res.blob()
          setFiles((prev) =>
            prev.map((f) => (f.id === item.id ? { ...f, status: 'done', pdfBlob: blob } : f))
          )
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Conversion failed'
          setFiles((prev) =>
            prev.map((f) => (f.id === item.id ? { ...f, status: 'error', error: msg } : f))
          )
        }
      })
    )
  }

  const downloadAll = () => {
    files.filter((f) => f.status === 'done' && f.pdfBlob).forEach((item) => {
      const url = URL.createObjectURL(item.pdfBlob!)
      const a = document.createElement('a')
      a.href = url
      a.download = item.file.name.replace(/\.[^.]+$/, '') + '.pdf'
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const hasPending = files.some((f) => f.status === 'idle' || f.status === 'error')
  const hasDone = files.some((f) => f.status === 'done')
  const isConverting = files.some((f) => f.status === 'converting')

  return (
    <Box>
      {/* Dropzone */}
      <Box
        {...getRootProps()}
        sx={{
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : '#C5D5EA',
          borderRadius: 4,
          p: { xs: 4, md: 6 },
          textAlign: 'center',
          cursor: 'pointer',
          bgcolor: isDragActive ? 'rgba(21,101,192,0.05)' : '#FAFCFF',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: 'primary.main',
            bgcolor: 'rgba(21,101,192,0.04)',
          },
        }}
      >
        <input {...getInputProps()} />
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            bgcolor: isDragActive ? 'primary.main' : 'primary.light',
            mx: 'auto',
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            opacity: isDragActive ? 1 : 0.85,
          }}
        >
          <CloudUploadIcon sx={{ color: '#fff', fontSize: 36 }} />
        </Box>
        <Typography variant="h6" fontWeight={700} mb={0.5}>
          {isDragActive ? 'Solte os arquivos aqui' : 'Arraste e solte os arquivos aqui'}
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          ou clique para selecionar do seu computador
        </Typography>
        <Stack direction="row" spacing={0.75} justifyContent="center" flexWrap="wrap" sx={{ gap: 0.75 }}>
          {FORMAT_LABELS.map((f) => (
            <Chip
              key={f}
              label={f}
              size="small"
              sx={{ bgcolor: 'rgba(21,101,192,0.1)', color: 'primary.dark', fontWeight: 700, fontSize: '0.7rem' }}
            />
          ))}
        </Stack>
      </Box>

      {/* File list */}
      {files.length > 0 && (
        <Box mt={3}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="subtitle1" fontWeight={700}>
              {files.length} arquivo{files.length !== 1 ? 's' : ''} selecionado{files.length !== 1 ? 's' : ''}
            </Typography>
            <Stack direction="row" spacing={1}>
              {hasDone && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={downloadAll}
                >
                  Baixar Todos
                </Button>
              )}
              {hasPending && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={isConverting ? <CircularProgress size={14} color="inherit" /> : <PictureAsPdfIcon />}
                  onClick={convertAll}
                  disabled={isConverting}
                >
                  {isConverting ? 'Convertendo…' : 'Converter para PDF'}
                </Button>
              )}
            </Stack>
          </Stack>

          <Stack spacing={1.5}>
            {files.map((item) => (
              <FileRow key={item.id} item={item} onRemove={() => removeFile(item.id)} />
            ))}
          </Stack>
        </Box>
      )}

      {globalError && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setGlobalError('')}>
          {globalError}
        </Alert>
      )}

      {/* Empty state hint */}
      {files.length === 0 && (
        <Box mt={4} textAlign="center">
          <Typography variant="body2" color="text.secondary">
            Seus arquivos são processados localmente e nunca armazenados em nossos servidores.
          </Typography>
        </Box>
      )}
    </Box>
  )
}
