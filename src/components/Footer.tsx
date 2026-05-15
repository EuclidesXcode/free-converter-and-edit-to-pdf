'use client'
import React from 'react'
import { Box, Container, Typography, Stack, Chip } from '@mui/material'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import { version } from '../../package.json'

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        borderTop: '1px solid #E4EAF2',
        bgcolor: '#FAFCFF',
        py: 4,
        mt: 6,
      }}
    >
      <Container maxWidth="lg">
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="center" spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <PictureAsPdfIcon sx={{ color: 'primary.main', fontSize: 22 }} />
            <Typography variant="body2" fontWeight={700} color="text.primary">
              Conversor e Editor de PDF Gratuito
            </Typography>
            <Chip
              label={`v${version}`}
              size="small"
              sx={{ fontSize: 11, height: 20, bgcolor: '#EBF2FF', color: 'primary.main', fontWeight: 600 }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" textAlign="center">
            100% grátis · Sem cadastro · Seus arquivos nunca são armazenados ou compartilhados.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Desenvolvido por Eucode
          </Typography>
        </Stack>
      </Container>
    </Box>
  )
}
