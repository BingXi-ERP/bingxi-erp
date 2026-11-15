import { request } from './request';
import type { ApiResponse } from '@/types/api-response';

export interface SalesOrderHit {
  order_no: string;
  customer_id: number;
  customer_name: string;
  total_amount: number;
  status: string;
  created_at: string;
  items: {
    product_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    color_no: string | null;
    pantone_code: string | null;
  }[];
}

export interface CustomerHit {
  id: number;
  code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tier: string;
}

export interface ProductHit {
  id: number;
  code: string;
  name: string;
  category: string | null;
  spec: string | null;
  unit: string;
  color_no: string | null;
  pantone_code: string | null;
  price: number;
}

export interface SearchResponse<T> {
  total: number;
  took_ms: number;
  hits: T[];
}

async function search<T>(url: string, params: Record<string, string | number | undefined>) {
  const response = await request.get<ApiResponse<SearchResponse<T>>>(url, { params });
  const payload = response.data;
  if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.hits)) {
    throw new Error(`Invalid search response payload for ${url}`);
  }
  return payload;
}

export function searchSalesOrders(
  q: string,
  params?: { from?: number; size?: number; status?: string }
) {
  return search<SalesOrderHit>('/search/sales-orders', { q, ...params });
}

export function searchCustomers(
  q: string,
  params?: { from?: number; size?: number; tier?: string }
) {
  return search<CustomerHit>('/search/customers', { q, ...params });
}

export function searchProducts(
  q: string,
  params?: { from?: number; size?: number; category?: string }
) {
  return search<ProductHit>('/search/products', { q, ...params });
}
