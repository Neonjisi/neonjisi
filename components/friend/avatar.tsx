import { User } from 'lucide-react'

/**
 * 프로필 아바타 — 폴백 아이콘을 **항상 깔고** 그 위에 사진을 덮는다.
 *
 * 예전에는 `avatarUrl` 이 null 일 때만 아이콘을 그렸다. 그래서 URL 은 있는데 그 호스트가
 * 죽은 경우(외부 OAuth 이미지가 503 을 주는 상황) 깨진 이미지 아이콘과 alt 텍스트가 그대로
 * 노출됐다. 서버 컴포넌트라 `onError` 를 쓸 수 없고, 이 화면들 몫의 `'use client'` 예산도
 * 없다 — 그래서 **CSS 로 겹쳐** 푼다:
 *
 *  - 컨테이너가 폴백 아이콘을 그린다 (사진이 없거나·아직 안 왔거나·실패했을 때 보이는 층)
 *  - 사진은 `alt=""` 로 그 위를 덮는다. 로드에 실패하면 브라우저가 빈 상자로 접어 아래
 *    아이콘이 그대로 드러난다 (alt 가 비어 있으면 깨진 아이콘·대체 텍스트를 그리지 않는다)
 *
 * 접근 이름은 컨테이너가 `role="img"` + `aria-label` 로 들고 있다 — 사진의 성패와 무관하게
 * 스크린 리더에는 항상 같은 이름이 간다.
 */
export function FriendAvatar({ name, avatarUrl, size = 'md' }: { name: string; avatarUrl: string | null; size?: 'md' | 'lg' }) {
  const classes = size === 'lg' ? 'size-20' : 'size-12'
  return (
    <span
      role="img"
      aria-label={`${name} 프로필`}
      className={`relative grid ${classes} shrink-0 place-items-center overflow-hidden rounded-full bg-apricot-100 text-apricot-700`}
    >
      <User size={size === 'lg' ? 34 : 22} aria-hidden />
      {avatarUrl && (
        // 외부 OAuth 공급자의 이미지 호스트가 사용자마다 달라 Next/Image allowlist로 제한할 수 없다.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="absolute inset-0 size-full object-cover" />
      )}
    </span>
  )
}
