interface DecimalParts {
  negative: boolean
  units: bigint
  scale: number
}

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/

const SALES_ORDER_STATUSES = [
  'draft',
  'pending',
  'approved',
  'partial_shipped',
  'shipped',
  'completed',
  'cancelled',
  'rejected',
] as const

const SALES_RETURN_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED'] as const
const PAYMENT_STATUSES = ['pending', 'confirmed', 'cancelled'] as const
const CUSTOMER_STATUSES = ['active', 'inactive', 'merged', 'blacklist'] as const
const PRODUCT_STATUSES = ['active', 'inactive'] as const
const COLOR_CARD_STATUSES = [
  'draft',
  'issued',
  'received',
  'used',
  'expired',
  'archived',
  'lost',
] as const

export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number]
export type SalesReturnStatus = (typeof SALES_RETURN_STATUSES)[number]
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number]
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]
export type ColorCardStatus = (typeof COLOR_CARD_STATUSES)[number]

function parseDecimal(value: string): DecimalParts {
  const normalized = value.trim()
  if (!DECIMAL_PATTERN.test(normalized)) {
    throw new Error(`Invalid decimal: ${value}`)
  }

  const negative = normalized.startsWith('-')
  const unsigned = negative ? normalized.slice(1) : normalized
  const [integer = '', fraction = ''] = unsigned.split('.')
  return {
    negative,
    units: BigInt(`${integer}${fraction}`),
    scale: fraction.length,
  }
}

function formatDecimal(units: bigint, scale: number, negative: boolean): string {
  if (units === 0n) return '0'
  const digits = units.toString().padStart(scale + 1, '0')
  const integer = scale === 0 ? digits : digits.slice(0, -scale)
  const fractionDigits = scale === 0 ? '' : digits.slice(-scale).replace(/0+$/, '')
  const fraction = fractionDigits.length > 0 ? `.${fractionDigits}` : ''
  return `${negative ? '-' : ''}${integer}${fraction}`
}

export function normalizeDecimals(values: readonly string[]): string[] {
  return values.map((value) => {
    const parsed = parseDecimal(value)
    return formatDecimal(parsed.units, parsed.scale, parsed.negative)
  })
}

function alignDecimals(left: DecimalParts, right: DecimalParts) {
  const scale = Math.max(left.scale, right.scale)
  return {
    leftUnits: left.units * 10n ** BigInt(scale - left.scale),
    rightUnits: right.units * 10n ** BigInt(scale - right.scale),
    scale,
  }
}

export function calculateLineTotal(quantity: string, unitPrice: string): string {
  const left = parseDecimal(quantity)
  const right = parseDecimal(unitPrice)
  const units = left.units * right.units
  return formatDecimal(units, left.scale + right.scale, left.negative !== right.negative)
}

export function compareDecimals(leftValue: string, rightValue: string): -1 | 0 | 1 {
  const left = parseDecimal(leftValue)
  const right = parseDecimal(rightValue)
  const aligned = alignDecimals(left, right)
  const leftSigned = left.negative ? -aligned.leftUnits : aligned.leftUnits
  const rightSigned = right.negative ? -aligned.rightUnits : aligned.rightUnits
  if (leftSigned < rightSigned) return -1
  if (leftSigned > rightSigned) return 1
  return 0
}

export function normalizePageQuery(query: Record<string, unknown>): {
  page: number
  page_size: number
} {
  const { page, page_size: pageSize } = query
  if (!Number.isInteger(page) || (page as number) < 1) {
    throw new Error('page must be a positive integer')
  }
  if (!Number.isInteger(pageSize) || (pageSize as number) < 1) {
    throw new Error('page_size must be a positive integer')
  }
  return { page: page as number, page_size: pageSize as number }
}

export function mergeUniqueById<T extends { id: number | string }>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const merged = new Map<number | string, T>()
  for (const item of [...current, ...incoming]) {
    merged.set(item.id, item)
  }
  return [...merged.values()]
}

export function normalizeSalesOrderStatus(value: string): SalesOrderStatus {
  if (!(SALES_ORDER_STATUSES as readonly string[]).includes(value)) {
    throw new Error(`Unknown sales order status: ${value}`)
  }
  return value as SalesOrderStatus
}

export function normalizeSalesReturnStatus(value: string): SalesReturnStatus {
  if (!(SALES_RETURN_STATUSES as readonly string[]).includes(value)) {
    throw new Error(`Unknown sales return status: ${value}`)
  }
  return value as SalesReturnStatus
}

export function normalizePaymentStatus(value: string): PaymentStatus {
  if (!(PAYMENT_STATUSES as readonly string[]).includes(value)) {
    throw new Error(`Unknown payment status: ${value}`)
  }
  return value as PaymentStatus
}

export function normalizeCustomerStatus(value: string): CustomerStatus {
  if (!(CUSTOMER_STATUSES as readonly string[]).includes(value)) {
    throw new Error(`Unknown customer status: ${value}`)
  }
  return value as CustomerStatus
}

export function normalizeProductStatus(value: string): ProductStatus {
  if (!(PRODUCT_STATUSES as readonly string[]).includes(value)) {
    throw new Error(`Unknown product status: ${value}`)
  }
  return value as ProductStatus
}

export function normalizeColorCardStatus(value: string): ColorCardStatus {
  if (!(COLOR_CARD_STATUSES as readonly string[]).includes(value)) {
    throw new Error(`Unknown color card status: ${value}`)
  }
  return value as ColorCardStatus
}
