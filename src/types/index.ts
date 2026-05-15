export type ConversionStatus = 'idle' | 'converting' | 'done' | 'error'

export interface FileItem {
  id: string
  file: File
  status: ConversionStatus
  pdfBlob?: Blob
  error?: string
}

export interface TextAnnotation {
  id: string
  pageIndex: number
  xFraction: number
  yFraction: number
  text: string
  fontSize: number
  color: string
}
