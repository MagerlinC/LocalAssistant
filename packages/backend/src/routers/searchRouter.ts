import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { webSearch } from '../lib/webSearch';

export const searchRouter = router({
  web: publicProcedure
    .input(z.object({ query: z.string().min(1).max(500) }))
    .query(async ({ input }) => {
      return webSearch(input.query);
    }),
});
