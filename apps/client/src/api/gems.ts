import type {
  CreateRewardBody,
  GemBalance,
  GemTransactionPublic,
  RewardOrderPublic,
  RewardPublic,
} from '@runew/contracts';
import { apiRequest } from './client';

export const fetchGemBalance = () => apiRequest<GemBalance>('/gems/balance');
export const fetchRewards = () => apiRequest<RewardPublic[]>('/rewards');
export const redeemReward = (id: string, key: string) =>
  apiRequest<{ order: RewardOrderPublic; balance: number }>(`/rewards/${id}/redeem`, {
    method: 'POST',
    idempotencyKey: key,
  });
export const fetchOrders = () => apiRequest<RewardOrderPublic[]>('/reward-orders');
export const fetchTransactions = () =>
  apiRequest<GemTransactionPublic[]>('/gems/transactions');
export const fulfillRewardOrder = (id: string, completionPhotoMemoryId: string | null = null) =>
  apiRequest<RewardOrderPublic>(`/reward-orders/${id}/fulfill`, {
    method: 'POST',
    body: { completionPhotoMemoryId },
  });
export const cancelRewardOrder = (id: string) =>
  apiRequest<RewardOrderPublic>(`/reward-orders/${id}/cancel`, { method: 'POST' });
export const createCustomReward = (body: CreateRewardBody) =>
  apiRequest<RewardPublic>('/rewards', { method: 'POST', body });
