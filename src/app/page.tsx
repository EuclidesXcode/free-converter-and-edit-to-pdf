'use client'
import React, { useState } from 'react'
import { Box, Container, Tab, Tabs, Paper } from '@mui/material'
import TransformIcon from '@mui/icons-material/Transform'
import EditNoteIcon from '@mui/icons-material/EditNote'
import Header from '@/components/Header'
import Hero from '@/components/Hero'
import ConvertSection from '@/components/ConvertSection'
import EditSection from '@/components/EditSection'
import Footer from '@/components/Footer'

export default function Home() {
  const [tab, setTab] = useState(0)

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Header />
      <Hero />

      <Container maxWidth="lg" sx={{ flex: 1, py: { xs: 4, md: 6 } }}>
        <Paper
          elevation={0}
          sx={{
            border: '1px solid #E4EAF2',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          {/* Tab header */}
          <Box sx={{ borderBottom: '1px solid #E4EAF2', bgcolor: '#FAFCFF' }}>
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              sx={{ px: 3 }}
              TabIndicatorProps={{ style: { height: 3, borderRadius: '3px 3px 0 0' } }}
            >
              <Tab
                icon={<TransformIcon />}
                iconPosition="start"
                label="Converter para PDF"
                sx={{ gap: 1 }}
              />
              <Tab
                icon={<EditNoteIcon />}
                iconPosition="start"
                label="Editar PDF"
                sx={{ gap: 1 }}
              />
            </Tabs>
          </Box>

          {/* Tab content */}
          <Box sx={{ p: { xs: 2.5, md: 4 } }}>
            {tab === 0 && <ConvertSection />}
            {tab === 1 && <EditSection />}
          </Box>
        </Paper>
      </Container>

      <Footer />
    </Box>
  )
}
