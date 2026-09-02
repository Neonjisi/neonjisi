import { z } from 'zod'

export const DISPLAY_NAME_MAX_LENGTH = 20

export const profileInputSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, '이름을 입력해주세요.')
    .max(DISPLAY_NAME_MAX_LENGTH, `이름은 ${DISPLAY_NAME_MAX_LENGTH}자까지 입력할 수 있어요.`),
})
