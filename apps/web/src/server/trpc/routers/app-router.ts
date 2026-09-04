import { createTRPCRouter } from '../init';
import { authRouter } from './auth';
import { labsRouter } from './labs';
import { lessonsRouter } from './lessons';
import { meRouter } from './me';
import { playgroundsRouter } from './playgrounds';
import { sessionRouter } from './session';

export const appRouter = createTRPCRouter({
  auth: authRouter,
  labs: labsRouter,
  lessons: lessonsRouter,
  me: meRouter,
  playgrounds: playgroundsRouter,
  session: sessionRouter,
});

export type AppRouter = typeof appRouter;
