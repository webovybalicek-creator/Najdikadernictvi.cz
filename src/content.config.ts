import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

export const KATEGORIE = ['Pro pány', 'Pro ženy', 'Péče o vlasy', 'Rady a návody'] as const;

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      perex: z.string(),
      datum: z.coerce.date(),
      kategorie: z.enum(KATEGORIE),
      obrazek: image(),
      obrazekAlt: z.string(),
      /** Autor fotky (Unsplash) */
      obrazekAutor: z.string(),
      /** Zvýrazněný článek na úvodu blogu */
      hlavni: z.boolean().default(false),
    }),
});

export const collections = { blog };
