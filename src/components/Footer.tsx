'use client'
import React from 'react'
import { Box, Container, Typography, Stack, Link } from '@mui/material'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'

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
