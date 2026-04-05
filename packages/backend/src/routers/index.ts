import { router } from '../trpc';
import { chatRouter } from './chatRouter';
import { searchRouter } from './searchRouter';
import { presentationRouter } from './presentationRouter';

export const appRouter = router({
  chat: chatRouter,
  search: searchRouter,
  presentation: presentationRouter,
});

export type AppRouter = typeof appRouter;
