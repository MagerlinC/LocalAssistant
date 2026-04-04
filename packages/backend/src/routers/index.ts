import { router } from '../trpc';
import { chatRouter } from './chatRouter';

export const appRouter = router({
  chat: chatRouter,
});

export type AppRouter = typeof appRouter;
