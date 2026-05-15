import type { Metadata } from 'next'
import ThemeRegistry from '@/components/ThemeRegistry'
import './globals.css'

export const metadata: Metadata = {
  title: 'Conversor e Editor de PDF Gratuito',
  description:
    'Converta DOCX, XLSX, TXT, HTML e outros para PDF gratuitamente. Edite arquivos PDF online. Sem cadastro, sem marcas d\'água.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  )
}
