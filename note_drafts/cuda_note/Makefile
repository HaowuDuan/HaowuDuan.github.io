.PHONY: all roofline clean

all: nvidia_cuda_intro_reference.pdf triton_reference.pdf

nvidia_cuda_intro_reference.pdf: nvidia_cuda_intro_reference.tex \
	figures/nvidia-ga100-full-gpu.png \
	figures/nvidia-ga100-sm.png \
	figures/rtx3090-roofline.pdf
	latexmk -pdf -interaction=nonstopmode -halt-on-error nvidia_cuda_intro_reference.tex

triton_reference.pdf: triton_reference.tex
	latexmk -pdf -interaction=nonstopmode -halt-on-error triton_reference.tex

roofline: figures/rtx3090-roofline.pdf

figures/rtx3090-roofline.pdf: figures/rtx3090-roofline.tex
	cd figures && latexmk -pdf -interaction=nonstopmode -halt-on-error rtx3090-roofline.tex

clean:
	latexmk -c nvidia_cuda_intro_reference.tex
	latexmk -c triton_reference.tex
	cd figures && latexmk -c rtx3090-roofline.tex
