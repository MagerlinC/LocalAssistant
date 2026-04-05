import { router } from '../trpc';
import { chatRouter } from './chatRouter';
import { searchRouter } from './searchRouter';

export const appRouter = router({
  chat: chatRouter,
  search: searchRouter,
});

export type AppRouter = typeof appRouter;
