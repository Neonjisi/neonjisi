import { cache } from 'react'
import type { Prisma, TasteKind } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireActiveFriendship } from '@/lib/dal/friend'
import { verifySession } from '@/lib/dal/session'

export type ProductView = {
  id: string
  name: string
  categoryId: string
  categoryName: string
  price: number
  imageUrl: string | null
}

export type ProductFilter = {
  query?: string
  categoryId?: string
  categoryName?: string
  friendUserId?: string
}

export type MatchBanner = 'want' | 'have' | 'unwanted' | null

const productSelect = {
  id: true,
  name: true,
  categoryId: true,
  price: true,
  imageUrl: true,
  category: { select: { name: true } },
} satisfies Prisma.ProductSelect

type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>

function toView(product: ProductRow): ProductView {
  return {
    id: product.id,
    name: product.name,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    price: product.price,
    imageUrl: product.imageUrl,
  }
}

async function tasteCategoryIds(friendUserId: string, kind: TasteKind): Promise<string[]> {
  await requireActiveFriendship(friendUserId)
  const rows = await prisma.tasteItem.findMany({
    where: { profile: { userId: friendUserId }, kind },
    select: { categoryId: true },
    distinct: ['categoryId'],
  })
  return rows.map(({ categoryId }) => categoryId)
}

export async function getProducts(filter: ProductFilter = {}): Promise<ProductView[]> {
  await verifySession()
  const excludedCategoryIds = filter.friendUserId
    ? await tasteCategoryIds(filter.friendUserId, 'UNWANTED')
    : []

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(filter.query?.trim()
        ? { name: { contains: filter.query.trim(), mode: 'insensitive' } }
        : {}),
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.categoryName ? { category: { name: filter.categoryName } } : {}),
      ...(excludedCategoryIds.length ? { categoryId: { notIn: excludedCategoryIds } } : {}),
    },
    orderBy: [{ category: { sortOrder: 'asc' } }, { price: 'asc' }],
    select: productSelect,
  })
  return products.map(toView)
}

export const getProduct = cache(async (productId: string): Promise<ProductView | null> => {
  await verifySession()
  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true },
    select: productSelect,
  })
  return product ? toView(product) : null
})

export async function getMatchBanner(
  productId: string,
  friendUserId: string,
): Promise<MatchBanner> {
  await requireActiveFriendship(friendUserId)
  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true },
    select: { categoryId: true },
  })
  if (!product) return null

  const matches = await prisma.tasteItem.findMany({
    where: { profile: { userId: friendUserId }, categoryId: product.categoryId },
    select: { kind: true },
  })
  const kinds = new Set(matches.map(({ kind }) => kind))
  // 차단이 가장 강한 판정이다. 데이터가 비정상적으로 겹쳐도 선물 가능으로 완화하지 않는다.
  if (kinds.has('UNWANTED')) return 'unwanted'
  if (kinds.has('HAVE')) return 'have'
  if (kinds.has('WANT')) return 'want'
  return null
}

export type Recommendations = {
  wantMatches: ProductView[]
  categoryMatches: ProductView[]
  excludedCategoryNames: string[]
  hasWantItems: boolean
}

export async function getRecommendations(friendUserId: string): Promise<Recommendations> {
  await requireActiveFriendship(friendUserId)
  const tastes = await prisma.tasteItem.findMany({
    where: { profile: { userId: friendUserId }, kind: { in: ['WANT', 'UNWANTED'] } },
    select: { kind: true, categoryId: true, productId: true, category: { select: { name: true } } },
  })
  const unwanted = tastes.filter(({ kind }) => kind === 'UNWANTED')
  const excludedIds = [...new Set(unwanted.map(({ categoryId }) => categoryId))]
  const wants = tastes.filter(({ kind }) => kind === 'WANT')
  const wantCategoryIds = [...new Set(wants.map(({ categoryId }) => categoryId))]
  const exactProductIds = [...new Set(wants.flatMap(({ productId }) => (productId ? [productId] : [])))]

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(excludedIds.length ? { categoryId: { notIn: excludedIds } } : {}),
      ...(wantCategoryIds.length ? { categoryId: { in: wantCategoryIds } } : {}),
    },
    orderBy: [{ category: { sortOrder: 'asc' } }, { price: 'asc' }],
    select: productSelect,
  })

  // 카탈로그에서 직접 고른 WANT는 정확 일치, 텍스트 WANT는 카테고리 전체를 1차 추천으로 둔다.
  const wantMatches = !wants.length
    ? []
    : exactProductIds.length
      ? products.filter(({ id }) => exactProductIds.includes(id))
      : products.filter(
          (product, index, all) =>
            all.findIndex(({ categoryId }) => categoryId === product.categoryId) === index,
        )
  const exactSet = new Set(wantMatches.map(({ id }) => id))
  const categoryMatches = products.filter(({ id }) => !exactSet.has(id))

  return {
    wantMatches: wantMatches.map(toView),
    categoryMatches: categoryMatches.map(toView),
    excludedCategoryNames: [...new Set(unwanted.map(({ category }) => category.name))],
    hasWantItems: wants.length > 0,
  }
}

export async function getProductsUnderAmount(
  maxAmount: number,
  opts: { preferWantOf?: string } = {},
): Promise<ProductView[]> {
  const { userId } = await verifySession()
  const preferUserId = opts.preferWantOf
  if (preferUserId && preferUserId !== userId) await requireActiveFriendship(preferUserId)

  const preferredIds = preferUserId
    ? await prisma.tasteItem
        .findMany({
          where: { profile: { userId: preferUserId }, kind: 'WANT' },
          select: { categoryId: true },
          distinct: ['categoryId'],
        })
        .then((rows) => rows.map(({ categoryId }) => categoryId))
    : []

  const products = await prisma.product.findMany({
    where: { isActive: true, price: { lte: Math.max(0, Math.floor(maxAmount)) } },
    orderBy: [{ price: 'asc' }, { name: 'asc' }],
    select: productSelect,
  })
  const preferred = new Set(preferredIds)
  return products
    .map(toView)
    .sort((a, b) => Number(preferred.has(b.categoryId)) - Number(preferred.has(a.categoryId)))
}

export const getProductCategories = cache(async () => {
  await verifySession()
  return prisma.category.findMany({
    where: { products: { some: { isActive: true } } },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true },
  })
})
