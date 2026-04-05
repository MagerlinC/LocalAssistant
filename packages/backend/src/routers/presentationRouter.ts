import { router, publicProcedure } from '../trpc';
import { PresentationInputSchema } from '@local-assistant/shared';
import { generatePresentation } from '../lib/presentationGenerator';

export const presentationRouter = router({
  create: publicProcedure
    .input(PresentationInputSchema)
    .mutation(async ({ input }) => {
      const filePath = await generatePresentation(input);
      return { filePath };
    }),
});
