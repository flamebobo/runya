import type {
  DuplicateCandidate,
  DuplicateResolveBody,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  SyncSnapshotResponse,
} from '@runew/contracts';
import { apiRequest } from '@/api/client';

export function pushOperations(request: SyncPushRequest) {
  return apiRequest<SyncPushResponse>('/sync/push', { method: 'POST', body: request });
}

export function pullChanges(familyId: string, cursor: number, limit = 200) {
  const query = new URLSearchParams({ familyId, cursor: String(cursor), limit: String(limit) });
  return apiRequest<SyncPullResponse>(`/sync/pull?${query.toString()}`);
}

export function fetchSnapshot(familyId: string) {
  return apiRequest<SyncSnapshotResponse>(
    `/sync/snapshot?familyId=${encodeURIComponent(familyId)}`,
  );
}

export function listDuplicateCandidates(familyId: string) {
  return apiRequest<{ items: DuplicateCandidate[] }>(
    `/sync/duplicates?familyId=${encodeURIComponent(familyId)}`,
  );
}

export function resolveDuplicateCandidate(
  candidateId: string,
  familyId: string,
  body: DuplicateResolveBody,
) {
  return apiRequest<{
    candidateId: string;
    resolution: 'MERGED' | 'KEEP_BOTH';
    canonicalId: string | null;
    mergedId: string | null;
  }>(`/sync/duplicates/${candidateId}/resolve?familyId=${encodeURIComponent(familyId)}`, {
    method: 'POST',
    body,
  });
}
