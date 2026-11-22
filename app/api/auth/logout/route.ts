import { after, NextRequest, NextResponse } from 'next/server'
import { recordAuthEvent } from '@/lib/auth-audit'
import { requireUser } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const gate = await requireUser(request)
  if ('response' in gate) return gate.response
  after(async () => {
    await recordAuthEvent({
      eventType: 'logout',
      userId: gate.user.id,
      userAgent: request.headers.get('user-agent'),
    })
  })
  return NextResponse.json({ recorded: true })
}
