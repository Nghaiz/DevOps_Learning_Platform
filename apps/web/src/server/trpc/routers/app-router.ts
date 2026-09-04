import { createTRPCRouter } from '../init';
import { adminRouter } from './admin';
import { authoringRouter } from './authoring';
import { authRouter } from './auth';
import { capacityRouter } from './capacity';
import { labsRouter } from './labs';
import { lessonsRouter } from './lessons';
import { meRouter } from './me';
import { pathsRouter } from './paths';
import { playgroundsRouter } from './playgrounds';
import { quizRouter } from './quiz';
import { sessionRouter } from './session';

export const appRouter = createTRPCRouter({
  admin: adminRouter,
  auth: authRouter,
  authoring: authoringRouter,
  capacity: capacityRouter,
  labs: labsRouter,
  lessons: lessonsRouter,
  me: meRouter,
  paths: pathsRouter,
  playgrounds: playgroundsRouter,
  quiz: quizRouter,
  session: sessionRouter,
});

export type AppRouter = typeof appRouter;
