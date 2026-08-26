import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const previewDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(previewDirectory, '..');

async function extractArticle(filename) {
  const html = await readFile(resolve(previewDirectory, filename), 'utf8');
  const match = html.match(
    /<article class="prose" data-linked-headings>\s*([\s\S]*?)\s*<\/article>/,
  );
  if (!match) throw new Error(`Could not find the article body in ${filename}`);
  return match[1];
}

const diffusionBody = (await extractArticle('diffusion-notes.html'))
  .replaceAll('assets/diffusion-distribution-paths.svg', '/notes/diffusion-distribution-paths.svg');
const optimizationBody = (await extractArticle('llm-optimization.html'))
  .replaceAll('assets/optimization/', '/notes/optimization/');

const diffusionFrontmatter = `---
title: Diffusion Models and Path Integrals
order: 1
math: true
description: Forward and reverse stochastic processes, score-matching objectives, and Fokker–Planck consistency
sections:
  - title: Path-integral formulation
    id: path-integral-formulation-of-the-forward-and-reverse-processes
    label: "1."
  - title: Score-matching objectives
    id: score-matching-objectives-and-fokkerplanck-consistency
    label: "2."
---`;

const optimizationFrontmatter = `---
title: Conceptual Introduction to Training
order: 2
chapterNumber: 2
math: true
description: Optimizers, learning-rate schedules, and weight decay from first principles
sections:
  - title: Overview
    id: one-parameter-in-a-smooth-loss
    label: "2.1"
  - title: Optimizer
    id: three-failure-modes-three-optimizers
    label: "2.2"
  - title: Scheduler
    id: learning-rate-schedules-why-warm-up-and-warm-down
    label: "2.3"
  - title: Weight Decay
    id: "sec:weight_decay"
    label: "2.4"
---`;

await Promise.all([
  writeFile(
    resolve(repositoryRoot, 'src/content/diffusion-notes/diffusion-models-and-path-integrals.md'),
    `${diffusionFrontmatter}\n\n${diffusionBody}\n`,
  ),
  writeFile(
    resolve(repositoryRoot, 'src/content/llm-notes/conceptual-introduction-to-training.md'),
    `${optimizationFrontmatter}\n\n${optimizationBody}\n`,
  ),
  mkdir(resolve(repositoryRoot, 'public/notes/optimization'), { recursive: true }),
]);

await Promise.all([
  copyFile(
    resolve(previewDirectory, 'assets/diffusion-distribution-paths.svg'),
    resolve(repositoryRoot, 'public/notes/diffusion-distribution-paths.svg'),
  ),
  ...[
    'fig_local_update.png',
    'fig_transport.png',
    'fig_learning_rate_schedule.png',
    'fig_learning_rate_warmup.png',
    'fig_learning_rate_warmdown.png',
  ].map(filename =>
    copyFile(
      resolve(previewDirectory, 'assets/optimization', filename),
      resolve(repositoryRoot, 'public/notes/optimization', filename),
    ),
  ),
]);

process.stdout.write('Exported the validated diffusion and conceptual training previews to Astro content.\n');
