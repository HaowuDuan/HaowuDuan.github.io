#!/usr/bin/env python3
"""Generate the illustrative roofline figure used by the blog post."""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np


PEAK_BANDWIDTH_TB_S = 1.0
PEAK_COMPUTE_TFLOP_S = 20.0
RIDGE_INTENSITY = PEAK_COMPUTE_TFLOP_S / PEAK_BANDWIDTH_TB_S


def main() -> None:
    intensity = np.logspace(-2, 3, 600)
    memory_ceiling = PEAK_BANDWIDTH_TB_S * intensity
    compute_ceiling = np.full_like(intensity, PEAK_COMPUTE_TFLOP_S)
    roof = np.minimum(memory_ceiling, compute_ceiling)

    plt.rcParams.update(
        {
            "font.family": "sans-serif",
            "font.size": 10,
            "axes.titleweight": "semibold",
            "axes.labelsize": 11,
            "axes.spines.top": False,
            "axes.spines.right": False,
        }
    )

    fig, ax = plt.subplots(figsize=(9.4, 5.8))
    fig.subplots_adjust(left=0.10, right=0.97, top=0.89, bottom=0.23)
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlim(1e-2, 1e3)
    ax.set_ylim(1e-2, 5e1)

    memory_color = "#0072B2"
    compute_color = "#D55E00"
    roof_color = "#202124"
    grid_color = "#D7DCE2"

    left = intensity <= RIDGE_INTENSITY
    right = intensity >= RIDGE_INTENSITY
    ax.fill_between(
        intensity[left], 1e-2, roof[left], color=memory_color, alpha=0.08
    )
    ax.fill_between(
        intensity[right], 1e-2, roof[right], color=compute_color, alpha=0.07
    )
    ax.plot(
        intensity[left],
        memory_ceiling[left],
        color=memory_color,
        linewidth=3,
        label=r"Memory roof: $P=B_{\rm peak}I$",
    )
    ax.plot(
        intensity[right],
        compute_ceiling[right],
        color=compute_color,
        linewidth=3,
        label=r"Compute roof: $P=P_{\rm peak}$",
    )
    ax.plot(intensity, roof, color=roof_color, linewidth=1.1, alpha=0.75)

    ax.axvline(RIDGE_INTENSITY, color="#6B7280", linestyle="--", linewidth=1.2)
    ax.annotate(
        "Ridge point\n20 FLOP/byte",
        xy=(RIDGE_INTENSITY, PEAK_COMPUTE_TFLOP_S),
        xytext=(7.5, 31),
        arrowprops={"arrowstyle": "->", "color": "#4B5563", "lw": 1.0},
        color="#30343B",
        ha="center",
    )

    examples = [
        ("A  memory-bound", 0.25, 0.20, memory_color, "o"),
        ("B  memory-bound", 3.0, 2.4, memory_color, "o"),
        ("C  compute-bound", 80.0, 16.5, compute_color, "s"),
        ("D  below the roof", 2.0, 0.18, "#7A5195", "D"),
    ]
    offsets = {
        "A  memory-bound": (8, -18),
        "B  memory-bound": (8, -18),
        "C  compute-bound": (8, -19),
        "D  below the roof": (9, 7),
    }
    for label, x_value, y_value, color, marker in examples:
        ax.scatter(
            x_value,
            y_value,
            s=78,
            marker=marker,
            color=color,
            edgecolor="white",
            linewidth=1.0,
            zorder=5,
        )
        ax.annotate(
            label,
            xy=(x_value, y_value),
            xytext=offsets[label],
            textcoords="offset points",
            color="#25282D",
            fontsize=9.5,
        )

    ax.annotate(
        "Optimization headroom",
        xy=(2.0, 1.55),
        xytext=(2.0, 0.29),
        arrowprops={"arrowstyle": "->", "color": "#7A5195", "lw": 1.4},
        color="#5E3C76",
        ha="center",
        fontsize=9,
    )

    ax.text(
        0.022,
        7.0,
        "Bandwidth-limited side\nReduce bytes moved",
        color=memory_color,
        fontsize=10,
        ha="left",
    )
    ax.text(
        70,
        0.035,
        "Compute-limited side\nReduce arithmetic or use faster units",
        color=compute_color,
        fontsize=10,
        ha="center",
    )

    ax.set_title(
        "Roofline model — illustrative GPU with 1 TB/s bandwidth and 20 TFLOP/s compute"
    )
    ax.set_xlabel(r"Arithmetic intensity, $I$  (FLOP per byte read from or written to DRAM)")
    ax.set_ylabel(r"Achieved performance, $P$  (TFLOP/s)")
    ax.grid(True, which="major", color=grid_color, linewidth=0.8)
    ax.grid(True, which="minor", color=grid_color, linewidth=0.45, alpha=0.45)
    ax.legend(loc="lower right", frameon=False, fontsize=9.5)

    fig.text(
        0.5,
        0.035,
        "Illustrative values only — this figure is a teaching example, not measured JIMWLK data.",
        ha="center",
        color="#5B616B",
        fontsize=9.5,
        fontweight="bold",
    )

    output_dir = Path(__file__).resolve().parent / "assets"
    output_dir.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_dir / "roofline-demo.svg", bbox_inches="tight")
    fig.savefig(output_dir / "roofline-demo.png", dpi=220, bbox_inches="tight")


if __name__ == "__main__":
    main()
