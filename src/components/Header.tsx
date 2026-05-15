'use client'
import React from 'react'
import { AppBar, Toolbar, Typography, Box } from '@mui/material'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'

export default function Header() {
  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{ bgcolor: '#fff', borderBottom: '1px solid #E4EAF2' }}
    >
      <Toolbar sx={{ gap: 1.5 }}>
        <Box
          sx={{
            bgcolor: 'primary.main',
            borderRadius: 2,
            width: 38,
            height: 38,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <PictureAsPdfIcon sx={{ color: '#fff', fontSize: 22 }} />
        </Box>
        <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 700, letterSpacing: -0.3 }}>
          Eucode PDF{' '}
          <Box component="span" sx={{ color: 'secondary.main' }}>
            Converter & Editar 100% Grátis
          </Box>
        </Typography>
        <Box flex={1} />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Sem cadastro · Sem marcas d'água · 100% Grátis
        </Typography>
      </Toolbar>
    </AppBar>
  )
}
