import { handle } from '../_lib/api.ts';
import type { Env } from '../_lib/env.ts';

export const onRequest: PagesFunction<Env> = (ctx) => handle(ctx.request, ctx.env, (p) => ctx.waitUntil(p));
