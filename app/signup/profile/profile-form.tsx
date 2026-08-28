"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

/** 기본 프로필 입력 폼 (SCR-M0-03) — 아바타 업로드는 스토리지 연동 시 채운다 */
export function ProfileForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const canSubmit = name.trim().length > 0;

  return (
    <div className="flex flex-1 flex-col pb-8">
      <div className="flex flex-col items-center gap-3 py-8">
        <span className="grid size-24 place-items-center rounded-full bg-apricot-100">
          <Camera size={32} className="text-apricot-700" aria-hidden />
        </span>
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-sm font-semibold text-neutral-600 active:bg-neutral-100"
        >
          사진 선택
        </button>
      </div>
      <TextField
        id="display-name"
        label="이름"
        placeholder="이름을 입력하세요"
        helper="친구에게 이 이름으로 보입니다."
        value={name}
        maxLength={20}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="mt-auto">
        <Button size="lg" disabled={!canSubmit} onClick={() => router.push("/onboarding")}>
          다음
        </Button>
      </div>
    </div>
  );
}
