'use server'

import { redirect } from 'next/navigation'
import { createWishlistFromProduct } from '@/app/taste/actions'

export async function selectWishlistProduct(productId: string): Promise<void> {
  const result = await createWishlistFromProduct(productId)
  if (!result.ok) redirect(`/taste/products?error=${encodeURIComponent(result.error.message)}`)
  redirect('/taste')
}
