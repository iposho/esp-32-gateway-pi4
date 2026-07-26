import { NextResponse, type NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params
  const safeFilename = path.basename(filename ?? '')
  
  if (!safeFilename || !safeFilename.endsWith('.bin') || safeFilename !== filename) {
    return new NextResponse('Not found', { status: 404 })
  }

  const firmwareDir = path.join(process.cwd(), 'public', 'firmware')
  const filepath = path.join(firmwareDir, safeFilename)

  if (!filepath.startsWith(firmwareDir)) {
    return new NextResponse('Access Denied', { status: 403 })
  }

  try {
    const fileBuffer = await fs.readFile(filepath)
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Length': fileBuffer.length.toString(),
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (e) {
    return new NextResponse('File Not Found', { status: 404 })
  }
}
