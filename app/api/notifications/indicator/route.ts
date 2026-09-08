import { getNotificationIndicator } from '@/lib/dal/notification'

export async function GET() {
  const indicator = await getNotificationIndicator()
  return Response.json(indicator, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
