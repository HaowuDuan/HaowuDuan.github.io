import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const noteSchema = z.object({
  title: z.string(),
  order: z.number(),
  math: z.boolean().optional().default(false),
  description: z.string().optional(),
});

const blogSchema = z.object({
  title: z.string(),
  date: z.coerce.date(),
  tags: z.array(z.string()).optional().default([]),
  description: z.string().optional(),
  math: z.boolean().optional().default(false),
  pinned: z.boolean().optional().default(false),
});

export const collections = {
  blog: defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
    schema: blogSchema,
  }),
  'llm-notes': defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/llm-notes' }),
    schema: noteSchema,
  }),
  'diffusion-notes': defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/diffusion-notes' }),
    schema: noteSchema,
  }),
  'rl-notes': defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/rl-notes' }),
    schema: noteSchema,
  }),
  'gpu-notes': defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/gpu-notes' }),
    schema: noteSchema,
  }),
};
