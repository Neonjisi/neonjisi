'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createMyEvent, deleteMyEvent, updateMyEvent } from '@/lib/dal/event'

const eventSchema = z.object({
  type: z.enum(['BIRTHDAY', 'ANNIVERSARY', 'CUSTOM']),
  title: z.string().trim().min(1, '일정 이름을 입력해주세요.').max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜를 확인해주세요.'),
  isRecurring: z.boolean(),
})

type Result = { ok: true; data: { eventId: string } } | { ok: false; error: { code: 'VALIDATION_FAILED' | 'NOT_OWNER' | 'STORAGE_FAILED'; message: string } }

function refresh(): void {
  revalidatePath('/')
  revalidatePath('/events')
  revalidatePath('/friends')
}

export async function saveEvent(input: { id?: string; type: string; title: string; date: string; isRecurring: boolean }): Promise<Result> {
  try {
    const parsed = eventSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: { code: 'VALIDATION_FAILED', message: parsed.error.issues[0]?.message ?? '입력을 확인해주세요.' } }
    const data = { ...parsed.data, date: new Date(`${parsed.data.date}T00:00:00.000Z`) }
    if (input.id) {
      if (!z.uuid().safeParse(input.id).success || !(await updateMyEvent(input.id, data))) return { ok: false, error: { code: 'NOT_OWNER', message: '수정할 수 없는 일정이에요.' } }
      refresh()
      return { ok: true, data: { eventId: input.id } }
    }
    const eventId = await createMyEvent(data)
    refresh()
    return { ok: true, data: { eventId } }
  } catch (error) {
    console.error('[events/actions] 일정 저장 실패', error)
    return { ok: false, error: { code: 'STORAGE_FAILED', message: '일정을 저장하지 못했어요.' } }
  }
}

export async function removeEvent(id: string): Promise<Result> {
  try {
    if (!z.uuid().safeParse(id).success || !(await deleteMyEvent(id))) return { ok: false, error: { code: 'NOT_OWNER', message: '삭제할 수 없는 일정이에요.' } }
    refresh()
    return { ok: true, data: { eventId: id } }
  } catch (error) {
    console.error('[events/actions] 일정 삭제 실패', error)
    return { ok: false, error: { code: 'STORAGE_FAILED', message: '일정을 삭제하지 못했어요.' } }
  }
}
