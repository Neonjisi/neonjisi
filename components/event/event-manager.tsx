'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { removeEvent, saveEvent } from '@/app/events/actions'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { RadioOption } from '@/components/ui/radio-option'
import { TextField } from '@/components/ui/text-field'
import { TopBar } from '@/components/ui/top-bar'
import type { EventView } from '@/lib/dal/event'

const TYPE_LABEL = { BIRTHDAY: '생일', ANNIVERSARY: '기념일', CUSTOM: '기타' } as const

function dateValue(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10)
}

export function EventManager({ events }: { events: EventView[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<EventView | null | 'new'>(null)
  const selected = editing === 'new' ? null : editing
  const [type, setType] = useState<keyof typeof TYPE_LABEL>('BIRTHDAY')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [isRecurring, setIsRecurring] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function open(event?: EventView): void {
    setEditing(event ?? 'new')
    setType(event?.type ?? 'BIRTHDAY')
    setTitle(event?.title ?? '')
    setDate(event ? dateValue(event.date) : '')
    setIsRecurring(event?.isRecurring ?? true)
    setError(null)
  }

  function save(): void {
    startTransition(async () => {
      const result = await saveEvent({ id: selected?.id, type, title, date, isRecurring })
      if (!result.ok) return setError(result.error.message)
      setEditing(null)
      router.refresh()
    })
  }

  function remove(): void {
    if (!selected) return
    startTransition(async () => {
      const result = await removeEvent(selected.id)
      if (!result.ok) return setError(result.error.message)
      setEditing(null)
      router.refresh()
    })
  }

  return (
    <>
      <TopBar title="일정" action={<button type="button" onClick={() => open()} aria-label="일정 추가" className="grid size-10 place-items-center rounded-full text-rose-600 active:bg-rose-50"><Plus size={22} aria-hidden /></button>} />
      {events.length ? (
        <ul className="space-y-3 px-5 pt-3">
          {events.map((event) => <li key={event.id}><button type="button" onClick={() => open(event)} className="w-full rounded-[20px] bg-surface p-4 text-left"><span className="text-xs font-semibold text-rose-700">{TYPE_LABEL[event.type]}</span><strong className="mt-1 block">{event.title}</strong><span className="mt-1 block text-sm text-neutral-600">{dateValue(event.nextDate)}{event.isRecurring ? ' · 매년' : ''}</span></button></li>)}
        </ul>
      ) : <p className="mx-5 mt-3 rounded-[20px] bg-surface p-5 text-sm text-neutral-600">등록한 일정이 없어요.</p>}
      <BottomSheet isOpen={editing !== null} onClose={() => !isPending && setEditing(null)} labelledBy="event-form-title">
        <h2 id="event-form-title" className="text-lg font-bold">{selected ? '일정 편집' : '일정 추가'}</h2>
        <fieldset className="mt-5"><legend className="text-xs font-semibold text-neutral-600">종류</legend><div className="mt-2 flex gap-4">{Object.entries(TYPE_LABEL).map(([value, label]) => <RadioOption key={value} name="event-type" label={label} checked={type === value} onChange={() => setType(value as keyof typeof TYPE_LABEL)} />)}</div></fieldset>
        <div className="mt-5 space-y-4"><TextField id="event-title" label="일정 이름" value={title} onChange={(e) => setTitle(e.target.value)} /><TextField id="event-date" label="날짜" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="size-5 accent-rose-500" />매년 반복</label>
        <p className="mt-4 rounded-xl bg-info-50 p-3 text-sm text-info-700">친구에게 이 일정이 보입니다.</p>
        {error ? <p role="alert" className="mt-3 text-sm text-error-700">{error}</p> : null}
        <div className="mt-6 flex gap-3"><Button size="lg" disabled={isPending} onClick={save}>{isPending ? '저장 중...' : '저장'}</Button>{selected ? <Button variant="tertiary" disabled={isPending} onClick={remove}>삭제</Button> : null}</div>
      </BottomSheet>
    </>
  )
}
