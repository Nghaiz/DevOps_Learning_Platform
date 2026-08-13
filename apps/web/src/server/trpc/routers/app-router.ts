import { createTRPCRouter } from '../init';
import { authRouter } from './auth';
import { lessonsRouter } from './lessons';
import { meRouter } from './me';
import { sessionRouter } from './session';

export const appRouter = createTRPCRouter({
  auth: authRouter,
  lessons: lessonsRouter,
  me: meRouter,
  session: sessionRouter,
});

export type AppRouter = typeof appRouter;
