'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal/session'
import { setMyDisplayName } from '@/lib/dal/profile'
import { profileInputSchema } from '@/lib/validation/profile'

export type ProfileActionResult =
  | { ok: true; data: { displayName: string } }
  | { ok: false; error: { code: 'VALIDATION_FAILED' | 'STORAGE_FAILED'; message: string } }

export async function updateMyProfile(input: {
  displayName: string
}): Promise<ProfileActionResult> {
  const { userId } = await verifySession()
  const parsed = profileInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: parsed.error.issues[0]?.message ?? '이름을 다시 확인해주세요.',
      },
    }
  }

  try {
    await setMyDisplayName(userId, parsed.data.displayName)
    revalidatePath('/my')
    revalidatePath('/signup/profile')
    return { ok: true, data: { displayName: parsed.data.displayName } }
  } catch (error) {
    console.error('[signup/profile/actions] 프로필 저장 실패', error)
    return {
      ok: false,
      error: { code: 'STORAGE_FAILED', message: '이름을 저장하지 못했어요. 잠시 후 다시 시도해주세요.' },
    }
  }
}
