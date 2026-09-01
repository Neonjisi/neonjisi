import type { FriendTasteView } from '@/lib/dal/friend'

const SECTIONS = [
  { kind: 'WANT', title: '원하는 것' },
  { kind: 'HAVE', title: '이미 있어요' },
  { kind: 'UNWANTED', title: '관심 없어요' },
] as const

export function FriendTasteCard({ friend }: { friend: FriendTasteView }) {
  const isSparse = !friend.description && friend.itemsByKind.WANT.length === 0
  return (
    <div className="flex flex-col gap-6 px-5 pb-10 pt-2">
      {friend.description && (
        <section className="rounded-[20px] bg-lavender-50 p-4">
          <h2 className="text-sm font-bold text-lavender-900">취향 서술</h2>
          <p className="whitespace-pre-wrap pt-2 text-sm leading-relaxed text-neutral-700">{friend.description}</p>
        </section>
      )}
      {isSparse && <p className="rounded-[20px] bg-surface p-4 text-sm text-neutral-600">아직 적은 게 많지 않아요. 지금 남겨둔 취향부터 살펴보세요.</p>}
      {SECTIONS.map(({ kind, title }) => {
        const items = friend.itemsByKind[kind]
        if (items.length === 0) return null
        return (
          <section key={kind} aria-label={title}>
            <h2 className="pb-2 text-base font-bold">{title} <span className="text-sm font-normal text-neutral-500">({items.length})</span></h2>
            <ul className="overflow-hidden rounded-[20px] bg-surface px-4">
              {items.map((item, index) => (
                <li key={item.id} className={`py-3 ${index ? 'border-t border-neutral-100' : ''}`}>
                  <p className="text-sm font-semibold">{item.categoryName}</p>
                  {item.detail && <p className="pt-1 text-sm text-neutral-600">{item.detail}</p>}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
