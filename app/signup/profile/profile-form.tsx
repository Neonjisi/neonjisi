"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { FriendAvatar } from "@/components/friend/avatar";
import { callAction } from "@/lib/actions/call-action";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/validation/profile";
import { updateMyProfile } from "./actions";

/** 기본 프로필 입력 폼 (SCR-M0-03) — 아바타 업로드는 스토리지 연동 시 채운다 */
export function ProfileForm({
  initialName,
  avatarUrl,
  returnTo,
}: {
  initialName: string;
  avatarUrl: string | null;
  returnTo: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canSubmit = name.trim().length > 0;

  function submit() {
    if (!canSubmit || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await callAction(() => updateMyProfile({ displayName: name }));
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(returnTo);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-1 flex-col pb-8">
      <div className="flex flex-col items-center gap-3 py-8">
        <FriendAvatar name={initialName} avatarUrl={avatarUrl} size="lg" />
        <span className="flex items-center gap-1 text-xs text-neutral-500"><Camera size={14} aria-hidden />프로필 사진 변경은 준비 중이에요</span>
      </div>
      <TextField
        id="display-name"
        label="이름"
        placeholder="이름을 입력하세요"
        helper="친구에게 이 이름으로 보입니다."
        value={name}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        onChange={(event) => setName(event.target.value)}
      />
      {error ? <p role="alert" className="mt-2 text-sm text-error-600">{error}</p> : null}
      <div className="mt-auto">
        <Button size="lg" disabled={!canSubmit || isPending} onClick={submit}>
          {isPending ? "저장 중..." : returnTo === "/my" ? "저장" : "다음"}
        </Button>
      </div>
    </div>
  );
}
