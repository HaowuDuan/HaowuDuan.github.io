#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"
cp ../src/styles/global.css styles.css
mkdir -p assets
cp ../drafts/blog1/assets/roofline-demo.svg assets/roofline-demo.svg
mkdir -p assets/optimization
cp ../note_drafts/optimization_techniques/fig_local_update.png assets/optimization/fig_local_update.png
cp ../note_drafts/optimization_techniques/fig_transport.png assets/optimization/fig_transport.png
cp ../note_drafts/optimization_techniques/fig_learning_rate_schedule.png assets/optimization/fig_learning_rate_schedule.png
cp ../note_drafts/optimization_techniques/fig_learning_rate_warmup.png assets/optimization/fig_learning_rate_warmup.png
cp ../note_drafts/optimization_techniques/fig_learning_rate_warmdown.png assets/optimization/fig_learning_rate_warmdown.png
mkdir -p assets/cuda
cp ../note_drafts/cuda_note/figures/nvidia-ga100-full-gpu.png assets/cuda/nvidia-ga100-full-gpu.png
cp ../note_drafts/cuda_note/figures/nvidia-ga100-sm.png assets/cuda/nvidia-ga100-sm.png
cp ../note_drafts/cuda_note/figures/rtx3090-roofline.png assets/cuda/rtx3090-roofline.png

node render-cuda-figures.mjs \
  ../note_drafts/cuda_note/nvidia_cuda_intro_reference.tex \
  assets/cuda

architecture_source_file="$(mktemp)"
test -n "${architecture_source_file:?}"
node prepare-architecture-source.mjs \
  ../note_drafts/attention_moe/attention_moe.tex \
  ../note_drafts/rnn_linear_attention_section1.tex \
  "${architecture_source_file:?}"

node render-architecture-figures.mjs \
  "${architecture_source_file:?}" \
  assets/architecture

node render-rl-figure.mjs \
  ../note_drafts/rl_for_llm_finetuning.tex \
  assets/rl

node render-data-figures.mjs \
  ../note_drafts/data.tex \
  assets/pre-training

node render-model-parallelism-figure.mjs \
  ../note_drafts/model_parallism.tex \
  assets/model-parallelism

node render-flash-attention-figure.mjs \
  ../note_drafts/flashatt.tex \
  assets/flash-attention

node render-optimal-transport-figure.mjs \
  ../note_drafts/optimal_transport.tex \
  assets/optimal-transport

mkdir -p vendor/katex/fonts
cp ../node_modules/katex/dist/katex.min.css vendor/katex/katex.min.css
cp ../node_modules/katex/dist/fonts/* vendor/katex/fonts/

sed '1d' ../drafts/blog1/draft_jimwlk.md | pandoc \
  --from=markdown+tex_math_dollars+fenced_code_blocks+pipe_tables \
  --to=html5 \
  --mathml \
  --toc \
  --toc-depth=3 \
  --template=article-template.html \
  --output=article.html

cp notes-template.html notes.html

figure_build_dir="$(mktemp -d)"
test -n "${figure_build_dir:?}"
pdflatex \
  -interaction=batchmode \
  -halt-on-error \
  -output-directory="${figure_build_dir:?}" \
  diffusion-paths-figure.tex >/dev/null
pdfcrop \
  "${figure_build_dir:?}/diffusion-paths-figure.pdf" \
  "${figure_build_dir:?}/diffusion-paths-figure-cropped.pdf" >/dev/null
pdftocairo \
  -svg \
  "${figure_build_dir:?}/diffusion-paths-figure-cropped.pdf" \
  assets/diffusion-distribution-paths.svg

pandoc ../note_drafts/diffusion_model_note.tex \
  --from=latex \
  --to=html5 \
  --mathml \
  --toc \
  --toc-depth=3 \
  --shift-heading-level-by=1 \
  --template=diffusion-notes-template.html \
  --output=diffusion-notes.html
node prepare-diffusion-note.mjs \
  diffusion-notes.html \
  ../note_drafts/diffusion_model_note.tex

pandoc ../note_drafts/optimization_techniques/optimization_techniques.tex \
  --from=latex \
  --to=html5 \
  --mathml \
  --toc \
  --toc-depth=3 \
  --shift-heading-level-by=1 \
  --template=optimization-notes-template.html \
  --output=llm-optimization.html
node prepare-optimization-note.mjs \
  llm-optimization.html \
  ../note_drafts/optimization_techniques/optimization_techniques.tex

cuda_source_file="$(mktemp)"
test -n "${cuda_source_file:?}"
node prepare-cuda-source.mjs \
  ../note_drafts/cuda_note/nvidia_cuda_intro_reference.tex \
  "${cuda_source_file:?}"
pandoc "${cuda_source_file:?}" \
  --from=latex \
  --to=html5 \
  --mathml \
  --toc \
  --toc-depth=3 \
  --shift-heading-level-by=1 \
  --template=cuda-notes-template.html \
  --output=cuda-notes.html
node prepare-cuda-note.mjs \
  cuda-notes.html \
  ../note_drafts/cuda_note/nvidia_cuda_intro_reference.tex

pandoc ../note_drafts/rl_for_llm_finetuning.tex \
  --from=latex \
  --to=html5 \
  --mathml \
  --toc \
  --toc-depth=3 \
  --shift-heading-level-by=1 \
  --template=rl-notes-template.html \
  --output=rl-notes.html
node prepare-rl-note.mjs \
  rl-notes.html \
  ../note_drafts/rl_for_llm_finetuning.tex

pandoc ../note_drafts/data.tex \
  --from=latex \
  --to=html5 \
  --standalone \
  --mathml \
  --shift-heading-level-by=1 \
  --metadata=title:"Pre-Training" \
  --output=pre-training.html
node prepare-data-note.mjs \
  pre-training.html \
  ../note_drafts/data.tex

pandoc ../note_drafts/model_parallism.tex \
  --from=latex \
  --to=html5 \
  --mathml \
  --toc \
  --toc-depth=3 \
  --shift-heading-level-by=1 \
  --template=model-parallelism-template.html \
  --output=model-parallelism.html
node prepare-model-parallelism-note.mjs \
  model-parallelism.html \
  ../note_drafts/model_parallism.tex

pandoc ../note_drafts/flashatt.tex \
  --from=latex \
  --to=html5 \
  --mathml \
  --toc \
  --toc-depth=3 \
  --shift-heading-level-by=1 \
  --template=flash-attention-template.html \
  --output=flash-attention.html
node prepare-flash-attention-note.mjs \
  flash-attention.html \
  ../note_drafts/flashatt.tex

pandoc ../note_drafts/optimal_transport.tex \
  --from=latex \
  --to=html5 \
  --mathml \
  --toc \
  --toc-depth=3 \
  --shift-heading-level-by=1 \
  --template=optimal-transport-template.html \
  --output=optimal-transport.html
node prepare-optimal-transport-note.mjs \
  optimal-transport.html \
  ../note_drafts/optimal_transport.tex

pandoc "${architecture_source_file:?}" \
  --from=latex \
  --to=html5 \
  --mathml \
  --toc \
  --toc-depth=3 \
  --shift-heading-level-by=1 \
  --citeproc \
  --bibliography=../note_drafts/attention_moe/references.bib \
  --template=architecture-notes-template.html \
  --output=modern-llm-architecture.html
node prepare-architecture-note.mjs modern-llm-architecture.html

node render-katex.mjs article.html notes.html diffusion-notes.html llm-optimization.html modern-llm-architecture.html cuda-notes.html rl-notes.html pre-training.html model-parallelism.html flash-attention.html optimal-transport.html
