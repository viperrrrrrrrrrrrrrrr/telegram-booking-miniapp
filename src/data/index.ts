import type { Me } from '../../shared/types';
import { ApiRepository, probeBackend } from './apiRepository';
import { DemoRepository } from './demoRepository';
import type { BookingRepository } from './repository';

export interface RepoChoice { repo: BookingRepository; me: Me; reason: string }

/**
 * Live mode only when (1) we were opened inside Telegram with signed initData and
 * (2) a compatible backend answers /api/health and accepts our initData.
 * Anything else falls back to demo mode (localStorage) automatically. Outside Telegram
 * no network request is made at all.
 */
export async function chooseRepository(tg: { initData: string; firstName: string }): Promise<RepoChoice> {
  const demo = (reason: string): RepoChoice => {
    const me: Me = { id: 'demo', firstName: tg.firstName, isAdmin: false };
    return { repo: new DemoRepository(() => me), me, reason };
  };
  const forced = new URLSearchParams(location.search).get('mode');
  if (forced === 'demo') return demo('forced');
  if (!tg.initData) return demo('no-telegram');
  if (!(await probeBackend())) return demo('no-backend');
  const api = new ApiRepository(tg.initData);
  try {
    return { repo: api, me: await api.getMe(), reason: 'api' };
  } catch {
    return demo('auth-failed');
  }
}
