import { createTRPCRouter } from '../init';
import { authoringRouter } from './authoring';
import { authRouter } from './auth';
import { labsRouter } from './labs';
import { lessonsRouter } from './lessons';
import { meRouter } from './me';
import { pathsRouter } from './paths';
import { playgroundsRouter } from './playgrounds';
import { quizRouter } from './quiz';
import { sessionRouter } from './session';

export const appRouter = createTRPCRouter({
  auth: authRouter,
  authoring: authoringRouter,
  labs: labsRouter,
  lessons: lessonsRouter,
  me: meRouter,
  paths: pathsRouter,
  playgrounds: playgroundsRouter,
  quiz: quizRouter,
  session: sessionRouter,
});

export type AppRouter = typeof appRouter;
