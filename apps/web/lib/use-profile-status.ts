'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/**
 * Shape of the bits of `/auth/me` we care about for the membership-purchase
 * gate. Kept loose on purpose — the backend payload is typed elsewhere and we
 * only need a handful of fields here.
 */
interface MeShape {
  user?: {
    full_name?: string | null;
    name?: string | null;
    selfie_url?: string | null;
  } | null;
}

export interface ProfileStatus {
  /** User has a non-empty legal name (≥ 2 chars after trim). */
  hasFullName: boolean;
  /** Selfie has been uploaded. */
  hasSelfie: boolean;
  /** Gate flag — true when the user is allowed to purchase a membership. */
  canPurchaseMembership: boolean;
  /** How many of the REQUIRED fields are filled in (0..requiredTotal). */
  requiredComplete: number;
  /** Total number of REQUIRED fields. Currently 2 (full name + selfie). */
  requiredTotal: number;
}

/**
 * Single source of truth for "can this member buy a membership yet?".
 *
 * Consumers (profile checklist, plans modal, dashboard CTAs, …) should all
 * import this hook so the rules stay consistent. It piggybacks on the
 * existing `['auth', 'me']` query, so it won't trigger an extra request.
 */
export function useProfileStatus(): ProfileStatus {
  const { data: me } = useQuery<MeShape>({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const rawName = me?.user?.full_name || me?.user?.name || '';
  const hasFullName = rawName.trim().length >= 2;
  const hasSelfie = !!me?.user?.selfie_url;

  const requiredComplete = (hasFullName ? 1 : 0) + (hasSelfie ? 1 : 0);
  const requiredTotal = 2;
  const canPurchaseMembership = hasFullName && hasSelfie;

  return {
    hasFullName,
    hasSelfie,
    canPurchaseMembership,
    requiredComplete,
    requiredTotal,
  };
}
