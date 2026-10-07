// Collections de contenu : pages « réalisation » (un chantier = une page).
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const realisations = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/realisations' }),
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    h1: z.string(),
    lieu: z.string(),
    codePostal: z.string(),
    departement: z.string(),
    date: z.string(),
    periode: z.string(),
    prestations: z.array(z.string()),
    pageVille: z.string().nullable(),
    pagesServices: z.array(z.string()),
    liees: z.array(z.string()).default([]),
    photoPrincipale: z.string(),
    photos: z.array(z.object({ src: z.string(), alt: z.string() })),
    cta: z.string(),
  }),
});

export const collections = { realisations };
