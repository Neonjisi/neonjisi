"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerPaymentMethod } from "@/app/payment-methods/actions";
import { Button } from "@/components/ui/button";
import { RadioOption } from "@/components/ui/radio-option";
import { TextField } from "@/components/ui/text-field";
import { isRedirectError } from "@/lib/actions/redirect-error";
import { CARD_BRANDS } from "@/lib/payment/card-brands";

/**
 * 결제수단 등록 폼 (SCR-M3-06 · T032) — 클라이언트 컴포넌트 예산 6개 중 하나 (contracts §6)
 *
 * **카드번호·CVC 를 받지 않는다** (FR-008). mock 은 브랜드와 뒷자리 4자리만 고르고,
 * 실연동(T058)에서는 이 자리에 결제사 위젯이 마운트된다 — 어느 쪽이든 앱은 카드번호를
 * 만지지 않고, 서버로 가는 것도 브랜드·뒷자리뿐이다.
 *
 * 등록이 끝나면 **원래 있던 곳으로 돌아간다** — 요청 플로우에서 강제 진입한 경우 그 흐름이
 * 이어져야 한다 (FR-013 ②). 경로는 서버(page)가 safeReturnTo 로 정리한 값만 내려온다.
 */

const REGISTER_FAILED_MESSAGE = "결제수단을 등록하지 못했어요. 잠시 후 다시 시도해주세요.";
const CARD_LAST4_LENGTH = 4;

type BillingKeyFormProps = {
  /** 등록 성공 후 이동할 앱 내부 경로. page 에서 이미 정리된 값이다 */
  returnTo: string;
};

export function BillingKeyForm({ returnTo }: BillingKeyFormProps) {
  const router = useRouter();
  const brandGroupId = useId();
  const last4Id = useId();
  const [cardBrand, setCardBrand] = useState<string>("");
  const [cardLast4, setCardLast4] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isRegistering, startRegistering] = useTransition();

  const canSubmit = cardBrand !== "" && cardLast4.length === CARD_LAST4_LENGTH;

  const handleSubmit = () => {
    startRegistering(async () => {
      setServerError(null);
      const result = await callRegister(cardBrand, cardLast4);
      if (!result.ok) {
        // 예상 가능한 실패(발급 거절·형태 오류)는 결과 값으로 온다 — 폼을 유지하고 문구만 보인다
        setServerError(result.error.message);
        return;
      }
      // 목록·마이 탭 배지가 함께 바뀐다 — 서버 렌더를 새로 받고 복귀 경로로 이동한다
      router.replace(returnTo);
      router.refresh();
    });
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !isRegistering) handleSubmit();
      }}
    >
      <fieldset className="flex flex-col gap-2.5" disabled={isRegistering}>
        <legend id={brandGroupId} className="pb-1 text-xs font-semibold text-neutral-600">
          카드사
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          {CARD_BRANDS.map((brand) => (
            <RadioOption
              key={brand}
              name="cardBrand"
              value={brand}
              label={brand}
              checked={cardBrand === brand}
              onChange={() => setCardBrand(brand)}
            />
          ))}
        </div>
      </fieldset>

      <TextField
        id={last4Id}
        label="카드 뒷자리 4자리"
        inputMode="numeric"
        autoComplete="off"
        maxLength={CARD_LAST4_LENGTH}
        placeholder="4821"
        value={cardLast4}
        disabled={isRegistering}
        // 숫자만 남긴다 — 서버(zod)도 같은 형태를 다시 본다
        onChange={(event) => setCardLast4(event.target.value.replace(/[^0-9]/g, ""))}
        helper="테스트용: 뒷자리를 0000 으로 등록하면 결제가 항상 실패합니다."
      />

      {serverError && (
        <p role="alert" className="text-sm text-error-600">
          {serverError}
        </p>
      )}

      <Button type="submit" size="lg" disabled={!canSubmit || isRegistering}>
        {isRegistering ? "등록 중…" : "등록하기"}
      </Button>
    </form>
  );
}

/**
 * Server Action 호출 자체가 throw 하면(네트워크 단절 등) STORAGE_FAILED 결과로 바꾼다 —
 * M2 remove-friend-dialog.tsx 와 같은 규칙이다. 결제 화면에서 특히 중요하다: 예외가 그대로
 * 새면 error.tsx 가 화면을 갈아치우고, 사용자는 카드가 등록됐는지 알 수 없다.
 */
async function callRegister(
  cardBrand: string,
  cardLast4: string,
): Promise<Awaited<ReturnType<typeof registerPaymentMethod>>> {
  try {
    return await registerPaymentMethod({ cardBrand, cardLast4 });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[billing-key-form] Server Action 호출 실패 — STORAGE_FAILED 로 변환", error);
    return { ok: false, error: { code: "STORAGE_FAILED", message: REGISTER_FAILED_MESSAGE } };
  }
}
