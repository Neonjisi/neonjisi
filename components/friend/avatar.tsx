import { User } from 'lucide-react'

export function FriendAvatar({ name, avatarUrl, size = 'md' }: { name: string; avatarUrl: string | null; size?: 'md' | 'lg' }) {
  const classes = size === 'lg' ? 'size-20' : 'size-12'
  if (avatarUrl) {
    // 외부 OAuth 공급자의 이미지 호스트가 사용자마다 달라 Next/Image allowlist로 제한할 수 없다.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={`${name} 프로필`} className={`${classes} shrink-0 rounded-full object-cover`} />
  }
  return (
    <span className={`grid ${classes} shrink-0 place-items-center rounded-full bg-apricot-100 text-apricot-700`} aria-label={`${name} 프로필`}>
      <User size={size === 'lg' ? 34 : 22} aria-hidden />
    </span>
  )
}
