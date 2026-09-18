import type { StCategory } from '../services/stTicketsApi'

/** No exponer en BacarNet (prueba / depositarios externos). */
export const ST_HIDDEN_CATEGORY_IDS = [16, 24] as const

export const ST_SOPORTE_IT_DEPARTMENT_ID = 16

/** Categorías visibles solo con área SOPORTE - IT. */
export const ST_SOPORTE_IT_CATEGORY_IDS = [17, 18, 19, 20, 21] as const

/** Una sola categoría por área operativa (autoselección). */
export const ST_SINGLE_CATEGORY_BY_DEPARTMENT: Readonly<Record<number, number>> = {
  27: 23,
  28: 22,
  52: 25,
}

export function isStCategoryHidden(categoryId: number): boolean {
  return (ST_HIDDEN_CATEGORY_IDS as readonly number[]).includes(categoryId)
}

export function stCategoryIdsForDepartment(departmentId: number): number[] {
  if (departmentId === ST_SOPORTE_IT_DEPARTMENT_ID) {
    return [...ST_SOPORTE_IT_CATEGORY_IDS]
  }
  const single = ST_SINGLE_CATEGORY_BY_DEPARTMENT[departmentId]
  return single ? [single] : []
}

export function isStCategorySelectLocked(departmentId: number): boolean {
  return departmentId in ST_SINGLE_CATEGORY_BY_DEPARTMENT
}

export function stAutoCategoryIdForDepartment(departmentId: number): string {
  const id = ST_SINGLE_CATEGORY_BY_DEPARTMENT[departmentId]
  return id ? String(id) : ''
}

export function stVisibleCategoriesForDepartment(
  categories: StCategory[],
  departmentId: number | null,
): StCategory[] {
  if (departmentId == null) return []
  const allowed = new Set(stCategoryIdsForDepartment(departmentId))
  return categories.filter((item) => allowed.has(item.id) && !isStCategoryHidden(item.id))
}
