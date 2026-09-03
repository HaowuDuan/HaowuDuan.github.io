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
const architectureBody = (await extractArticle('modern-llm-architecture.html'))
  .replaceAll('assets/architecture/', '/notes/architecture/');
const cudaBody = (await extractArticle('cuda-notes.html'))
  .replaceAll('assets/cuda/', '/notes/cuda/');

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

const architectureFrontmatter = `---
title: Modern LLM Architecture
order: 1
chapterNumber: 1
math: true
description: Attention, recurrent sequence models, linear attention, normalization, and sparse mixture-of-experts layers
sections:
  - title: Attention
    id: attention
    label: "1.1"
  - title: Mixture of Experts
    id: mixture-of-experts
    label: "1.2"
  - title: Linear Attention and RNN
    id: linear-attention-and-rnn
    label: "1.3"
---`;

const cudaFrontmatter = `---
title: CUDA
order: 1
chapterNumber: 1
math: true
description: GPU execution, CUDA programming, profiling, and performance limits
sections:
  - title: GPU and CUDA
    id: gpu-and-cuda
    label: "1.1"
  - title: Array Addition
    id: array-addition
    label: "1.2"
  - title: Performance Limits and Failure Modes
    id: "sec:gpu-underutilization"
    label: "1.3"
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
  writeFile(
    resolve(repositoryRoot, 'src/content/llm-notes/modern-llm-architecture.md'),
    `${architectureFrontmatter}\n\n${architectureBody}\n`,
  ),
  writeFile(
    resolve(repositoryRoot, 'src/content/gpu-notes/cuda.md'),
    `${cudaFrontmatter}\n\n${cudaBody}\n`,
  ),
  mkdir(resolve(repositoryRoot, 'public/notes/optimization'), { recursive: true }),
  mkdir(resolve(repositoryRoot, 'public/notes/architecture'), { recursive: true }),
  mkdir(resolve(repositoryRoot, 'public/notes/cuda'), { recursive: true }),
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
  ...[
    'token-lattice.svg',
    'decoder-block-dataflow.svg',
    'gqa-example.svg',
    'norm-placement.svg',
    'norm-depth-stack.svg',
    'dense-versus-moe.svg',
    'swiglu-expert.svg',
    'moe-topk-example.svg',
    'elman-cell.svg',
    'lstm-cell.svg',
    'gru-cell.svg',
  ].map(filename =>
    copyFile(
      resolve(previewDirectory, 'assets/architecture', filename),
      resolve(repositoryRoot, 'public/notes/architecture', filename),
    ),
  ),
  ...[
    'atomic-contention.svg',
    'bandwidth-fusion.svg',
    'cpu-gpu-interaction.svg',
    'cuda-index-1d.svg',
    'cuda-index-2d.svg',
    'cuda-programming-model.svg',
    'latency-hiding.svg',
    'launch-overhead.svg',
    'nvidia-ga100-full-gpu.png',
    'nvidia-ga100-sm.png',
    'rtx3090-roofline.png',
    'transfer-bound.svg',
    'transpose-tile-map.svg',
    'unified-memory.svg',
    'warp-divergence.svg',
  ].map(filename =>
    copyFile(
      resolve(previewDirectory, 'assets/cuda', filename),
      resolve(repositoryRoot, 'public/notes/cuda', filename),
    ),
  ),
]);

process.stdout.write('Exported the validated diffusion, architecture, conceptual training, and CUDA previews to Astro content.\n');
