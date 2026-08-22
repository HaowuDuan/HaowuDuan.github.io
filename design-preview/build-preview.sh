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

node render-katex.mjs article.html notes.html diffusion-notes.html llm-optimization.html
