'use client'
import React from 'react'
import { Box, Container, Typography, Stack, Chip } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'

const badges = ['Sem cadastro', 'Sem marcas d\'água', 'Sem limite de tamanho', 'Seguro e Privado']
const formats = ['DOCX', 'XLSX', 'CSV', 'TXT', 'HTML', 'Markdown']

export default function Hero() {
  return (
    <Box
      sx={{
        background: 'linear-gradient(135deg, #1565C0 0%, #0D47A1 50%, #1A237E 100%)',
        color: 'white',
        py: { xs: 6, md: 9 },
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: -80,
          right: -80,
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          bottom: -120,
          left: -60,
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
        },
      }}
    >
      <Container maxWidth="md" sx={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <Typography
          variant="h2"
          sx={{ mb: 2, fontSize: { xs: '2rem', md: '3rem' }, lineHeight: 1.2 }}
        >
          Converta e Edite PDFs na Hora
        </Typography>
        <Typography
          variant="h6"
          sx={{ mb: 4, opacity: 0.85, fontWeight: 400, maxWidth: 560, mx: 'auto' }}
        >
          Faça upload dos seus documentos e converta para PDF em segundos. Edite PDFs com anotações.
          Tudo funciona no seu navegador — nenhum dado é armazenado.
        </Typography>

        <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" sx={{ gap: 1, mb: 4 }}>
          {badges.map((b) => (
            <Chip
              key={b}
              icon={<CheckCircleIcon sx={{ color: '#A5D6A7 !important', fontSize: 16 }} />}
              label={b}
              sx={{
                bgcolor: 'rgba(255,255,255,0.12)',
                color: 'white',
                fontWeight: 600,
                border: '1px solid rgba(255,255,255,0.2)',
                backdropFilter: 'blur(4px)',
              }}
            />
          ))}
        </Stack>

        <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" sx={{ gap: 1 }}>
          <Typography variant="body2" sx={{ opacity: 0.7, alignSelf: 'center', mr: 1 }}>
            Formatos suportados:
          </Typography>
          {formats.map((f) => (
            <Chip
              key={f}
              label={f}
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.18)',
                color: 'white',
                fontWeight: 700,
                fontSize: '0.7rem',
              }}
            />
          ))}
        </Stack>
      </Container>
    </Box>
  )
}
