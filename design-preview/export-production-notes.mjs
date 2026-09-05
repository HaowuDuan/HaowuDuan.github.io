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
const rlBody = (await extractArticle('rl-notes.html'))
  .replaceAll('assets/rl/', '/notes/rl/');

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

const rlFrontmatter = `---
title: Reinforcement Learning for LLM Fine-Tuning from the Path-Integral Perspective
order: 1
math: true
description: Policy gradients, PPO, GRPO, and preference optimization for LLM post-training, developed from path measures
sections:
  - title: Introduction
    id: introduction
    label: "1."
  - title: The LLM Post-Training Problem
    id: the-llm-post-training-problem
    label: "2."
  - title: Online Policy-Gradient Methods
    id: online-policy-gradient-methods
    label: "3."
  - title: Proximal Policy Optimization
    id: proximal-policy-optimization
    label: "4."
  - title: Group-Relative Policy Optimization
    id: group-relative-policy-optimization
    label: "5."
  - title: Online and Offline Training
    id: online-and-offline-training
    label: "6."
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
  writeFile(
    resolve(repositoryRoot, 'src/content/rl-notes/introduction.md'),
    `${rlFrontmatter}\n\n${rlBody}\n`,
  ),
  mkdir(resolve(repositoryRoot, 'public/notes/optimization'), { recursive: true }),
  mkdir(resolve(repositoryRoot, 'public/notes/architecture'), { recursive: true }),
  mkdir(resolve(repositoryRoot, 'public/notes/cuda'), { recursive: true }),
  mkdir(resolve(repositoryRoot, 'public/notes/rl'), { recursive: true }),
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
  copyFile(
    resolve(previewDirectory, 'assets/rl/actor-critic-interface.svg'),
    resolve(repositoryRoot, 'public/notes/rl/actor-critic-interface.svg'),
  ),
]);

process.stdout.write('Exported the validated diffusion, architecture, conceptual training, CUDA, and RL previews to Astro content.\n');
