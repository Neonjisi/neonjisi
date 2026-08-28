import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 모달(시트·다이얼로그)의 포커스 관리 — aria-modal 이 약속하는 최소 동작.
 *  - 열릴 때 컨테이너(tabIndex=-1)로 포커스를 옮긴다
 *  - Escape 로 닫는다 (중첩 모달에서 바깥까지 닫히지 않게 전파를 멈춘다)
 *  - Tab 순환을 컨테이너 안에 가둔다
 *  - 닫힐 때(언마운트) 열기 전 활성 요소로 포커스를 되돌린다
 * 열려 있는 동안만 마운트되는 컴포넌트에서 쓴다 — 마운트/언마운트가 곧 열림/닫힘이다.
 */
export function useModalFocus<T extends HTMLElement>(
  onDismiss: () => void,
): { containerRef: RefObject<T | null>; onKeyDown: (event: KeyboardEvent<T>) => void } {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    containerRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<T>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onDismiss();
      return;
    }
    if (event.key !== "Tab") return;
    event.stopPropagation();

    const container = containerRef.current;
    if (!container) return;
    const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === container)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return { containerRef, onKeyDown };
}
