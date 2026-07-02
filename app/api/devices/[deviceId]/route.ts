import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function DELETE(
  req: Request,
  { params }: { params: { deviceId: string } },
) {
  let supabase
  try {
    supabase = getServiceClient()
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 503 },
    )
  }

  const { deviceId } = params

  if (!deviceId) {
    return NextResponse.json({ error: 'Device ID is required' }, { status: 400 })
  }

  // Delete from devices table. 
  // We'll delete telemetry explicitly just in case to be safe, if there's no FK constraint.
  const { error: teleError } = await supabase
    .from('telemetry')
    .delete()
    .eq('device_id', deviceId)

  if (teleError) {
    console.error('[DELETE Device] Telemetry deletion error:', teleError.message)
    return NextResponse.json({ error: teleError.message }, { status: 500 })
  }

  const { error } = await supabase
    .from('devices')
    .delete()
    .eq('device_id', deviceId)

  if (error) {
    console.error('[DELETE Device] Device deletion error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
