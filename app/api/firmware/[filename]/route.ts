import { NextResponse, type NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params
  
  if (!filename || !filename.endsWith('.bin')) {
    return new NextResponse('Not found', { status: 404 })
  }

  const filepath = path.join(process.cwd(), 'public', 'firmware', filename)
  try {
    const fileBuffer = await fs.readFile(filepath)
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (e) {
    return new NextResponse('File Not Found', { status: 404 })
  }
}
