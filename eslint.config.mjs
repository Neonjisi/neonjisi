import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // PT 촬영 스크립트의 로컬 중간 산출물 — 추적하지 않는 자리다 (.gitignore 와 한 짝)
    ".pt-tmp/**",
  ]),
  {
    // T023 — 화면·Server Action 에서 Prisma 직접 접근 금지 (research R4).
    // M1 에는 RLS 2차 방어선이 없어 lib/dal/ 이 유일한 접근 제어 지점이다.
    // 규칙을 문서가 아니라 린터로 강제한다.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/prisma",
              message:
                "화면·액션에서 Prisma 를 직접 쓰지 않는다. lib/dal/ 을 거칠 것 (T023, research R4).",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
