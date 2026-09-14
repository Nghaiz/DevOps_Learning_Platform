import { createTRPCRouter } from '../init';
import { adminRouter } from './admin';
import { authoringRouter } from './authoring';
import { authRouter } from './auth';
import { capacityRouter } from './capacity';
import { classesRouter } from './classes';
import { labsRouter } from './labs';
import { lessonsRouter } from './lessons';
import { meRouter } from './me';
import { pathsRouter } from './paths';
import { playgroundsRouter } from './playgrounds';
import { problemsRouter } from './problems';
import { quizRouter } from './quiz';
import { sessionRouter } from './session';

export const appRouter = createTRPCRouter({
  admin: adminRouter,
  auth: authRouter,
  authoring: authoringRouter,
  capacity: capacityRouter,
  classes: classesRouter,
  labs: labsRouter,
  lessons: lessonsRouter,
  me: meRouter,
  paths: pathsRouter,
  playgrounds: playgroundsRouter,
  problems: problemsRouter,
  quiz: quizRouter,
  session: sessionRouter,
});

export type AppRouter = typeof appRouter;
