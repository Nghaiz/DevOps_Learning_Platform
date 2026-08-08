import { createTRPCRouter } from '../init';
import { authRouter } from './auth';
import { meRouter } from './me';
import { sessionRouter } from './session';

export const appRouter = createTRPCRouter({
  auth: authRouter,
  me: meRouter,
  session: sessionRouter,
});

export type AppRouter = typeof appRouter;
