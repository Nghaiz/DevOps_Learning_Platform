import { createTRPCRouter } from '../init';
import { adminRouter } from './admin';
import { authoringRouter } from './authoring';
import { authRouter } from './auth';
import { capacityRouter } from './capacity';
import { classesRouter } from './classes';
import { examSittingRouter } from './exam-sitting';
import { examsRouter } from './exams';
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
  // `exams` = soạn đề + chấm, admin-only. `examSitting` = màn làm bài của
  // người học. Hai router tách hẳn nhau là một yêu cầu tường minh của lane
  // 18.F, không phải một lựa chọn thẩm mỹ — xem chú thích đầu mỗi file.
  examSitting: examSittingRouter,
  exams: examsRouter,
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
