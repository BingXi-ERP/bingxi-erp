import { request } from './request';
import type { ApiResponse } from '@/types/api';

export interface PaymentChannel {
  id: number;
  channel_code: string;
  channel_name: string;
  enabled: boolean;
  sandbox_mode: boolean;
  app_id: string;
  mch_id: string;
  api_key: '***';
  callback_url: string;
  created_at: string;
  updated_at: string;
  created_by: number | null;
}

export interface UpdatePaymentChannelRequest {
  channel_name?: string;
  enabled?: boolean;
  sandbox_mode?: boolean;
  app_id?: string;
  mch_id?: string;
  api_key?: string;
  callback_url?: string;
}

export interface PaymentChannelOption {
  channel_code: string;
  channel_name: string;
}

export const getPaymentChannels = () =>
  request.get<ApiResponse<PaymentChannel[]>>('/payment-channels');
export const getPaymentChannel = (channelCode: string) =>
  request.get<ApiResponse<PaymentChannel>>(`/payment-channels/${channelCode}`);
export const updatePaymentChannel = (channelCode: string, data: UpdatePaymentChannelRequest) =>
  request.put<ApiResponse<PaymentChannel>>(`/payment-channels/${channelCode}`, data);
export const getPaymentMethodOptions = () =>
  request.get<ApiResponse<PaymentChannelOption[]>>('/ap/payment-requests/payment-methods');
