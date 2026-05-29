// Copies the pdf.js worker into public/ so the browser editor can load it at
// /pdf.worker.min.js. Run on build/dev so the worker always matches the
// installed pdfjs-dist version (instead of committing a stale 1MB binary).
import { copyFileSync, mkdirSync } from 'fs'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)
const root = dirname(fileURLToPath(import.meta.url))
const dest = join(root, '..', 'public', 'pdf.worker.min.js')

try {
  const src = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.js')
  mkdirSync(join(root, '..', 'public'), { recursive: true })
  copyFileSync(src, dest)
  console.log('[copy-pdf-worker] copied worker to public/pdf.worker.min.js')
} catch (err) {
  console.error('[copy-pdf-worker] failed:', err.message)
  process.exit(1)
}
