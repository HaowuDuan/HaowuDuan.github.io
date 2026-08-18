---
title: JIMWLK in the Speed of Light
date: 2026-08-18
tags:
  - GPU computing
  - CUDA
  - high-energy QCD
description: "Profiling and optimizing a matrix-valued lattice simulation, from a direct CuPy port to fused CUDA kernels and a practical GPU performance model."
math: true
pinned: true
---

In this note, I detail my first experience with CUDA optimization. I did not expect to enjoy the process as much as I did: each profiling result exposed a concrete problem, and each fix produced a performance gain that I could immediately see. For readers who are not familiar with the underlying equation, the code performs Langevin evolution of a field of $3 \times 3$ matrices on a 2D lattice, rather than evolving a single vector. As you might guess, this involves a lot of linear algebra. I begin with a direct NumPy-to-CuPy port, simply to get the code running on a GPU and establish a baseline. From there, I use profiling measurements to identify the most time-consuming parts of the evolution and optimize them one by one. At the end of the post, I summarize the mental model I developed for thinking about GPU optimization.

## 1. The Algorithm

We simulate JIMWLK evolution — the renormalization group equation that governs how gluon fields inside a proton change with energy. The degrees of freedom are Wilson lines: at each site of a 2D $N \times N$ lattice, we store a $3 \times 3$ complex unitary matrix $V(\mathbf{x}) \in SU(3)$. The computation has three phases.

**Initial condition.** We build $V$ as a path-ordered product of $N_y$ random layers,

$$
V(\mathbf{x}) = \prod_{k=1}^{N_y} V_k(\mathbf{x}), \qquad V_k = \exp\!\Big(i \sum_{a=1}^{8} \rho_k^a(\mathbf{x})\, t^a\Big)
$$

where $t^a$ are the eight Gell-Mann generators of $\mathfrak{su}(3)$ and $\rho_k^a$ are Gaussian random fields whose two-point correlator is set by the propagator,

$$
\langle \rho^a(\mathbf{k})\, \rho^b(\mathbf{k}') \rangle = \frac{\mu^2}{N_y\, a^2} \cdot \frac{\delta^{ab}\, \delta_{\mathbf{k},\mathbf{k}'}}{k^2 + m^2}
$$

For each layer, we generate 8 noise fields $\rho^a$, Fourier transform to momentum space, multiply by the propagator $G(\mathbf{k}) = 1/(k^2 + m^2)$, transform back, assemble the result into a $3 \times 3$ Lie-algebra element, take the matrix exponential, and multiply into the running product.

---

> **Algorithm 1** — Initial Condition
>
> **Input:** lattice size $N$, layer count $N_y$, noise amplitude $\sigma$, propagator $G(\mathbf{k}) = 1/(k^2 + m^2)$, Gell-Mann generators $t^a$ for $a = 1, \ldots, 8$
>
> **Output:** path-ordered Wilson line $V(\mathbf{x}) \in SU(3)$ at every lattice site
>
> 1: $V(\mathbf{x}) \leftarrow I_3$ for all $\mathbf{x}$
>
> 2: **for** $k = 1$ **to** $N_y$ **do**
>
> 3: $\quad A(\mathbf{x}) \leftarrow 0_{3 \times 3}$ for all $\mathbf{x}$
>
> 4: $\quad$ **for** $a = 1$ **to** $8$ **do**
>
> 5: $\quad\quad \rho^a(\mathbf{x}) \leftarrow \sigma \cdot \mathcal{N}(0, 1)$ $\qquad\triangleright$ draw $N \times N$ i.i.d. Gaussian samples
>
> 6: $\quad\quad \tilde{\rho}^a(\mathbf{k}) \leftarrow \text{FFT}_\text{2D}\!\big[\rho^a\big]$
>
> 7: $\quad\quad \tilde{\rho}^a(\mathbf{k}) \leftarrow \tilde{\rho}^a(\mathbf{k}) \cdot G(\mathbf{k})$ $\qquad\triangleright$ convolve with propagator in k-space
>
> 8: $\quad\quad \rho^a(\mathbf{x}) \leftarrow \text{Re}\!\big(\text{IFFT}_\text{2D}\!\big[\tilde{\rho}^a\big]\big)$
>
> 9: $\quad\quad A(\mathbf{x}) \leftarrow A(\mathbf{x}) + \rho^a(\mathbf{x})\, t^a$ $\qquad\triangleright$ accumulate into $\mathfrak{su}(3)$ algebra element
>
> 10: $\quad$ **end for**
>
> 11: $\quad M(\mathbf{x}) \leftarrow i\, A(\mathbf{x})$ $\qquad\triangleright$ anti-Hermitian traceless $3 \times 3$ matrix per site
>
> 12: $\quad V_k(\mathbf{x}) \leftarrow \text{MatExp}_{3 \times 3}\!\big[M(\mathbf{x})\big]$ $\qquad\triangleright$ Cayley-Hamilton, see Algorithm 3
>
> 13: $\quad V(\mathbf{x}) \leftarrow V(\mathbf{x}) \cdot V_k(\mathbf{x})$ $\qquad\triangleright$ path-ordered product, $3 \times 3$ matmul per site
>
> 14: **end for**
>
> 15: **return** $V$

---

**Evolution.** At each rapidity step $\Delta Y$, the JIMWLK Langevin equation updates every lattice site simultaneously,

$$
V(\mathbf{x}) \;\longrightarrow\; e^{-i\varepsilon\, [\mathbf{K} * \boldsymbol{\xi}](\mathbf{x})} \;\cdot\; V(\mathbf{x}) \;\cdot\; e^{+i\varepsilon\, [\mathbf{K} * (V^\dagger \boldsymbol{\xi} V)](\mathbf{x})}
$$

where $\varepsilon = \sqrt{\alpha_s\, \Delta Y}/\pi$ controls the step size, $\boldsymbol{\xi}(\mathbf{x}) = \sum_a \xi^a(\mathbf{x})\, t^a$ is a Gaussian white-noise field in the Lie algebra, and $\mathbf{K}$ is the Weizsäcker-Williams kernel,

$$
K_i(\mathbf{x}) = \frac{x_i}{|\mathbf{x}|^2}
$$

The convolution $[\mathbf{K} * \boldsymbol{\xi}]$ sums over both transverse polarizations: $K_x * \xi_x + K_y * \xi_y$. There is an important asymmetry in the update: the left exponential depends only on the noise $\boldsymbol{\xi}$ and is therefore state-independent, while the right exponential depends on $V^\dagger \boldsymbol{\xi} V$ and must be recomputed at every step. This means the left side can be precomputed in batches.

---

> **Algorithm 2** — JIMWLK Evolution (one rapidity step)
>
> **Input:** Wilson lines $V(\mathbf{x})$, WW kernel $\tilde{K}_i(\mathbf{k})$ for $i = x, y$, step size $\varepsilon = \sqrt{\alpha_s \,\Delta Y}/\pi$
>
> **Output:** updated $V(\mathbf{x})$
>
> $\triangleright$ *Generate noise*
>
> 1: **for** $a = 1$ **to** $8$ **do**
>
> 2: $\quad \xi_x^a(\mathbf{x}),\; \xi_y^a(\mathbf{x}) \leftarrow \mathcal{N}(0, 1)$ $\qquad\triangleright$ draw $2 \times N \times N$ i.i.d. samples (two polarizations)
>
> 3: **end for**
>
> 4: $\boldsymbol{\xi}_i(\mathbf{x}) \leftarrow \sum_{a=1}^{8} \xi_i^a(\mathbf{x})\, t^a$ for $i = x, y$ $\qquad\triangleright$ assemble $\mathfrak{su}(3)$ noise, one $3 \times 3$ matrix per site per polarization
>
> $\triangleright$ *Left exponential (state-independent)*
>
> 5: $\tilde{\boldsymbol{\xi}}_i(\mathbf{k}) \leftarrow \text{FFT}_\text{2D}\!\big[\boldsymbol{\xi}_i\big]$ for $i = x, y$
>
> 6: $\tilde{\eta}_L(\mathbf{k}) \leftarrow \tilde{K}_x(\mathbf{k})\, \tilde{\boldsymbol{\xi}}_x(\mathbf{k}) + \tilde{K}_y(\mathbf{k})\, \tilde{\boldsymbol{\xi}}_y(\mathbf{k})$ $\qquad\triangleright$ $\tilde{K}_i$ is scalar, $\tilde{\boldsymbol{\xi}}_i$ is $3 \times 3$; pointwise multiply + sum
>
> 7: $\eta_L(\mathbf{x}) \leftarrow \text{IFFT}_\text{2D}\!\big[\tilde{\eta}_L\big]$
>
> 8: $e_L(\mathbf{x}) \leftarrow \text{MatExp}_{3 \times 3}\!\big[-i\varepsilon\, \eta_L(\mathbf{x})\big]$ $\qquad\triangleright$ Cayley-Hamilton per site
>
> $\triangleright$ *Right exponential (state-dependent)*
>
> 9: $\boldsymbol{\xi}_i^R(\mathbf{x}) \leftarrow V^\dagger(\mathbf{x})\, \boldsymbol{\xi}_i(\mathbf{x})\, V(\mathbf{x})$ for $i = x, y$ $\qquad\triangleright$ gauge-rotate noise; two $3 \times 3$ matmuls per site
>
> 10: $\tilde{\boldsymbol{\xi}}_i^R(\mathbf{k}) \leftarrow \text{FFT}_\text{2D}\!\big[\boldsymbol{\xi}_i^R\big]$ for $i = x, y$
>
> 11: $\tilde{\eta}_R(\mathbf{k}) \leftarrow \tilde{K}_x(\mathbf{k})\, \tilde{\boldsymbol{\xi}}_x^R(\mathbf{k}) + \tilde{K}_y(\mathbf{k})\, \tilde{\boldsymbol{\xi}}_y^R(\mathbf{k})$
>
> 12: $\eta_R(\mathbf{x}) \leftarrow \text{IFFT}_\text{2D}\!\big[\tilde{\eta}_R\big]$
>
> 13: $e_R(\mathbf{x}) \leftarrow \text{MatExp}_{3 \times 3}\!\big[+i\varepsilon\, \eta_R(\mathbf{x})\big]$
>
> $\triangleright$ *Update*
>
> 14: $V(\mathbf{x}) \leftarrow e_L(\mathbf{x}) \cdot V(\mathbf{x}) \cdot e_R(\mathbf{x})$ $\qquad\triangleright$ two $3 \times 3$ matmuls per site
>
> 15: **if** step mod $5 = 0$ **then** $\qquad\triangleright$ Gram-Schmidt reunitarization
>
> 16: $\quad \mathbf{r}_0 \leftarrow V_{0,:}\, /\, \|V_{0,:}\|$, $\quad \mathbf{r}_1 \leftarrow V_{1,:} - (\mathbf{r}_0^* \cdot V_{1,:})\,\mathbf{r}_0$, $\quad \mathbf{r}_1 \leftarrow \mathbf{r}_1 / \|\mathbf{r}_1\|$, $\quad \mathbf{r}_2 \leftarrow (\mathbf{r}_0 \times \mathbf{r}_1)^*$
>
> 17: **end if**
>
> 18: **return** $V$

---

**Observables.** After evolution, we measure correlation functions. The dipole correlator is

$$
S(r) = \frac{1}{N_c}\, \Big\langle \mathrm{tr}\, V(\mathbf{x})\, V^\dagger(\mathbf{x} + \mathbf{r}) \Big\rangle
$$

and the Weizsäcker-Williams gluon TMDs are extracted from the gauge field $A_i^a = 2\, \mathrm{tr}\big(V^\dagger \partial_i V \cdot t^a\big) / ig$.

**From the computational side**, all of this reduces to: batched $3 \times 3$ matrix multiplies, 2D FFTs, element-wise transcendentals (exp, cos, arccos), and reductions. These are the same operations that dominate GPU time in transformer training, at a different scale.

## 2. The Naive GPU Port

The first step is mechanical: replace NumPy with CuPy. Every array operation — noise generation, FFT, matrix multiply, einsum — becomes a CuPy call, which dispatches to cuFFT, cuBLAS, or elementwise CUDA kernels under the hood. No custom kernels, no clever tricks.

```python
# Initial condition — one layer
propagator = build_propagator()  # G(k) = 1 / (k_hat² + m²), with G(0) = 0

for a in range(8):
    rho = sigma * rng.standard_normal((N, N))
    rho_k = cp.fft.fft2(rho)
    rho_k *= propagator
    field = cp.real(cp.fft.ifft2(rho_k))
    A += field[:, :, None, None] * generators[a]

V_layer = matexp_su3(1j * A)   # Cayley-Hamilton in pure CuPy
V = cp.matmul(V, V_layer)      # path ordering
```

```python
# Evolution — one step
xi = cp.einsum('pija,acd->pijcd', coeffs, generators)  # noise
xi_k = cp.fft.fft2(xi, axes=(1, 2))
xi_conv = K_of_k[0] * xi_k[0] + K_of_k[1] * xi_k[1]  # convolution
xi_conv = cp.fft.ifft2(xi_conv, axes=(0, 1))
exp_L = matexp_su3(-pref * 1j * xi_conv)

Vd = V.conj().transpose(0, 1, 3, 2)
xi_R = cp.matmul(Vd[None], cp.matmul(xi, V[None]))     # V†ξV
# ... same FFT+convolve pipeline for right side ...
exp_R = matexp_su3(pref * 1j * xi_conv_R)

V = cp.matmul(cp.matmul(exp_L, V), exp_R)
```

### The matrix exponential: leveraging Cayley-Hamilton Theorem

The matrix exponential $e^M$ appears once per layer in the initial condition and twice per evolution step. At each of the $N^2$ lattice sites sits an independent $3\times3$ traceless anti-Hermitian matrix, so a single sweep demands $\sim10^6$ exponentials. There is no library call for this. `scipy.linalg.expm` implements Padé approximation with scaling and squaring — an algorithm designed for general matrices of arbitrary size. It accepts batch dimensions as of v1.16, but internally loops over each matrix in Python; running it over $10^6$ sites is orders of magnitude slower than necessary. CuPy provides `cupyx.scipy.linalg.expm`, but it is the same general-purpose algorithm, not a vectorized kernel for millions of small matrices.

The Cayley–Hamilton theorem eliminates the problem entirely. It says every matrix satisfies its own characteristic polynomial. For a $3\times3$ matrix with characteristic polynomial $p(\lambda) = \lambda^3 + a\lambda^2 + b\lambda + c$, this gives $M^3 = -aM^2 - bM - cI$, so $M^3 \in \text{span}\{I, M, M^2\}$. Multiplying by $M$ and substituting, $M^4$ reduces the same way; by induction, every $M^k$ with $k \geq 3$ does. Each partial sum $\sum_{k=0}^{K} M^k/k!$ is therefore a linear combination of $I$, $M$, $M^2$, and since this subspace is finite-dimensional (hence closed), the limit $e^M$ stays in it:

$$
e^M = c_0\, I + c_1\, M + c_2\, M^2.
$$

To find $c_0, c_1, c_2$: if $v$ is an eigenvector with eigenvalue $\lambda_k$, the left side gives $e^{\lambda_k} v$ and the right side gives $(c_0 + c_1\lambda_k + c_2\lambda_k^2)v$. So the scalar polynomial $q(\lambda) = c_0 + c_1\lambda + c_2\lambda^2$ must satisfy $q(\lambda_k) = e^{\lambda_k}$ at each eigenvalue — three equations for three unknowns, a Vandermonde system whose solution is Lagrange interpolation. When two eigenvalues coincide, the Vandermonde matrix is singular; the fix is Hermite interpolation, matching the derivative $q'(\lambda) = e^{\lambda}$ at the repeated root.

For traceless $M$, the characteristic polynomial simplifies: $\text{tr}(M) = 0$ kills the quadratic term, leaving the depressed cubic $\lambda^3 + \frac{1}{2}\text{tr}(M^2)\,\lambda - \det(M) = 0$, which is exactly the form Cardano's formula solves. The algorithm, then, is entirely scalar arithmetic per site:

1. Compute $\operatorname{tr}(M^2)$ and $\det(M)$.
2. Solve the depressed cubic (Cardano's formula) for the three eigenvalues.
3. Evaluate $e^{\lambda_k}$.
4. Build the Lagrange coefficients $c_0, c_1, c_2$ (or Hermite, if eigenvalues coincide).
5. Assemble $R = c_0\, I + c_1\, M + c_2\, M^2$.
Every step vectorizes over all $N^2$ sites. In CuPy this is roughly 40 lines of elementwise arithmetic — no matrix decomposition, no iteration, no convergence check. One subtlety: Cardano's formula subtracts nearly equal quantities, so the eigenvalue solve must run in float64; the final $3\times3$ assembly can drop back to float32.

On an RTX 3090 at $N = 1024$ with 50 layers, the initial condition takes 9.4 s and each evolution step 1.47 s.


## 3. My First Profiling Pass

The naive CuPy port was correct but slow: at $N=1024$, one 50-layer initial condition took 9.4 seconds and one evolution step took 1.47 seconds. Before changing the code, I profiled where the time went and why.

I made the following three measurements:

1. **Wall-time breakdown.** CUDA events identify the expensive sections of the program.
2. **Kernel-launch breakdown.** Kernel counts show how CuPy operations expand into GPU work and whether that work is fragmented.
3. **Hardware counters.** Nsight Compute reports compute and memory throughput for each kernel, revealing the limiting resource.

### Measurement 1: wall-time breakdown

CUDA work is asynchronous, so a CPU timer around a CuPy call can stop before the GPU finishes. I used CUDA events and synchronized at the end of each measured region. The measurements below were taken on an RTX 3090 with $N=1024$, $L=64$, and $N_y=50$.

**Initial condition (50 layers, 9.4 s total):**

| Section | Per-call | Share of initial condition |
|---------|---------:|---------------------------:|
| Noise generation (8 fields) | 0.3 ms | 0.2% |
| FFT + propagation (8 fields) | 1.3 ms | 0.7% |
| Algebra assembly | 3.1 ms | 1.7% |
| **Matrix exponential** | **172 ms** | **92.1%** |
| Path-ordered matrix multiply | 10.3 ms | 5.4% |

**Evolution (one step, median of 5 steps):**

| Section | Per-call | Share of step |
|---------|---------:|--------------:|
| Noise generation | 1.5 ms | 0.1% |
| Left FFT + convolution | 5.6 ms | 0.4% |
| **Left matrix exponential** | **287 ms** | **19.6%** |
| **$V^\dagger\xi V$** | **572 ms** | **39.0%** |
| Right FFT + convolution | 17 ms | 1.1% |
| **Right matrix exponential** | **287 ms** | **19.6%** |
| **Wilson-line update** | **279 ms** | **19.0%** |
| Reunitarization | 18 ms | 1.2% |

FFTs and convolutions account for about 2% of an evolution step; matrix exponentials and $3\times3$ matrix multiplications account for about 97%. I therefore profiled the matrix operations at a finer granularity.

### Measurement 2: kernel-launch breakdown

The next surprise was how much GPU work a few lines of CuPy generated. Running Nsight Compute over one full initial condition plus one evolution step produced 16,487 kernel launches across 84 kernel types:

| Category | Kernel launches |
|----------|----------------:|
| CuPy elementwise operations | 10,799 |
| Batched matrix multiply | 3,571 |
| cuFFT | 1,610 |
| Random-number generation | 401 |
| Reductions | 106 |
| **Total** | **16,487** |

CuPy vectorizes the Python expression, but it does not necessarily fuse that expression. An addition, multiplication, exponential, comparison, or `where` can each become a separate kernel. The pure-CuPy matrix exponential alone generates roughly 100 launches per call, and the initial condition calls it once for every layer.

A large launch count is not automatically bad. A large kernel can perform enough useful work to amortize its launch overhead. Here, however, many launches also read and write the same $N^2\times3\times3$ arrays. The problem was therefore not just launch latency; it was repeated full-array traffic between launches.

The launch breakdown exposes fragmentation, but not the cost of each kernel. For that, I needed hardware counters.

### Measurement 3: hardware counters

The hardware sets a ceiling on data-transfer rate, $Q_{\mathrm{peak}}$, and another on compute rate, $P_{\mathrm{peak}}$. These peak numbers do not predict a kernel's runtime. They describe the best rates the hardware can reach under suitable conditions; the actual rates depend on the kernel. I measure runtime with CUDA events and use hardware counters to explain it.

For a kernel that performs $W$ floating-point operations and moves $D$ bytes, the **arithmetic intensity** is

$$
I=\frac{W}{D}\qquad\text{(floating-point operations per byte)}.
$$

Here, $D$ is the total read and write traffic between L2 cache and device DRAM; using traffic at another memory level would define a different roofline.

If the kernel takes time $T$, its measured compute performance is $P=W/T$. The roofline model bounds that performance by

$$
P \leq \min\!\left(P_{\mathrm{peak}},\;Q_{\mathrm{peak}}I\right).
$$

The sloped part of the roof is the data-transfer ceiling; the horizontal part is the compute-throughput ceiling. If $Q_{\mathrm{peak}}I<P_{\mathrm{peak}}$, the memory roof is lower and the kernel is memory-bound. If $P_{\mathrm{peak}}<Q_{\mathrm{peak}}I$, the compute roof is lower and the kernel is compute-bound. The two ceilings meet at the ridge point, $I_{\mathrm{ridge}}=P_{\mathrm{peak}}/Q_{\mathrm{peak}}$.

![Illustrative roofline plot showing the memory-bound region, compute-bound region, ridge point, and example kernels](/blog/jimwlk/roofline-demo.svg)

*Figure 1. A teaching example of the roofline model. The hardware values and example kernels are illustrative; they are not measurements from the JIMWLK program.*

The two regions are categories, not grades. A memory-bound kernel close to the memory roof can be just as well implemented as a compute-bound kernel close to the compute roof. Making a kernel compute-bound by adding useless arithmetic would only make it slower. The practical strategy is:

1. Move the kernel toward its active roof by fixing implementation inefficiencies such as poor memory access, insufficient parallelism, dependencies, or excessive launch overhead.
2. Once it is close, reduce the work that defines that roof: reduce arithmetic for a compute-bound kernel, or reduce data movement for a memory-bound kernel.

Reducing memory traffic increases arithmetic intensity and may move a kernel across the ridge point into the compute-bound region, but crossing the ridge is not the goal. Lower execution time is the goal.

The roofs are properties of the hardware for a particular precision and memory level. The algorithm determines $W$ and $D$; the kernel implementation determines how closely $P$ approaches the relevant roof. This distinction matters on an RTX 3090 because its FP32 and FP64 compute roofs are very different: a kernel using double-precision arithmetic can hit its relevant compute ceiling while leaving most FP32 capacity irrelevant.

I then used `ncu --set full` to collect hardware counters for one evolution step. Nsight Compute may replay a kernel many times to collect incompatible counters, so the wall time of the profiling command is not an application benchmark. I use CUDA events for latency and the Nsight data below for diagnosis.

First, grouping launches by kernel family shows where device time is concentrated:

| Kernel family | Launches | GPU time in capture | Share of captured GPU time |
|---------------|---------:|--------------------:|---------------------------:|
| Batched matrix multiply (complex128) | 102 | 1176 ms | 90.9% |
| Batched matrix multiply (complex64) | 64 | 60 ms | 4.6% |
| Elementwise kernels | ~200 | ~25 ms | ~1.9% |
| cuFFT kernels | 8 | ~6 ms | ~0.5% |
| Other kernels | ~125 | ~27 ms | ~2.1% |
| **Total** | **499** | **1294 ms** | **100%** |

The statement that matrix multiply consumes 95.5% of the captured GPU time comes directly from the first two rows:

$$
\frac{1176\ \mathrm{ms}+60\ \mathrm{ms}}{1294\ \mathrm{ms}}\times100\%=95.5\%.
$$

That percentage refers to GPU kernel time within this one Nsight capture—not CPU time or the wall time of the entire application.

Family totals answer *where* the time goes, but hardware counters describe individual kernels. Averaging all elementwise or FFT kernels together would hide their different utilization patterns. Representative kernels show the distinction:

| Representative kernel | Captured GPU time | SM throughput | DRAM throughput |
|-----------------------|------------------:|--------------:|----------------:|
| Batched matmul (complex128) | 1176.4 ms | 87.9% | 0.2% |
| Batched matmul (complex64) | 59.9 ms | 70.4% | 1.6% |
| Elementwise complex128 multiply | 4.0 ms | 26.4% | 91.1% |
| Elementwise complex128 exponential | 1.1 ms | 85.7% | 19.7% |
| Regular FFT kernel | 4.9 ms | 3.2% | 54.1% |
| Vector FFT kernel | 1.4 ms | 29.8% | 91.7% |

**SM throughput** is the activity of the busiest execution pipeline in a streaming multiprocessor, reported as a percentage of its sustained peak. **DRAM throughput** is the data-transfer rate at device memory, also reported as a percentage of its sustained peak. Neither column is arithmetic intensity. In particular,

$$
\frac{\text{SM throughput \%}}{\text{DRAM throughput \%}}
$$

is a dimensionless ratio of two normalized metrics, not FLOP/byte. It cannot be used to calculate $I$ or determine the active roof.

To classify a kernel with the roofline model, obtain $I=W/D$ from operation and DRAM-traffic counters, or directly from Nsight Compute's roofline section, and compare it with the ridge point:

- $I<I_{\mathrm{ridge}}$: memory-bound.
- $I>I_{\mathrm{ridge}}$: compute-bound.

The two percentages provide only a qualitative check. High DRAM throughput with much lower SM throughput is consistent with a memory-bound kernel; high throughput in the relevant compute pipeline with low DRAM throughput is consistent with a compute-bound kernel. They are not a substitute for arithmetic intensity.

## 4. Optimization

The profile identified the matrix exponential and tiny matrix products as the main optimization targets.

### Per-site RawKernels for 3×3 matrix multiply

```c
// matmul_abc: out = A · B · C in one kernel launch
__global__ void matmul_abc(const float2* A, const float2* B,
                           const float2* C, float2* out, int n) {
    int idx = blockDim.x * blockIdx.x + threadIdx.x;
    if (idx >= n) return;

    float ar[9], ai[9], br[9], bi[9], cr[9], ci[9];
    float tr[9], ti[9], or[9], oi[9];

    load3x3(A, idx, ar, ai);
    load3x3(B, idx, br, bi);
    load3x3(C, idx, cr, ci);
    mul3x3(ar, ai, br, bi, tr, ti);  // T = A·B
    mul3x3(tr, ti, cr, ci, or, oi);  // out = T·C
    store3x3(out, idx, or, oi);
}
```

For $3 \times 3$ matrices, the right strategy is one CUDA thread per lattice site. Each thread loads 9 complex numbers into registers, performs the multiply entirely in-register, and writes back. No shared memory, no tiling.

One thread per site does not mean one kernel launch per site. The kernel is launched once with enough threads to cover the whole lattice. For $N=1024$, there are $N^2=1{,}048{,}576$ sites. With 256 threads per block, one launch creates 4,096 blocks, and each thread computes

$$
\mathrm{out}_s=A_sB_sC_s
$$

for one site $s$.

The RTX 3090 has 82 SMs and 10,496 CUDA cores. CUDA cores are arithmetic pipelines, not permanent thread slots. Each SM can hold at most 1,536 resident threads or 48 warps, giving an architectural maximum of $82\times1{,}536=125{,}952$ resident threads across the GPU. This kernel reaches a lower limit first. A 256-thread block contains 8 warps and uses 54 registers per thread. It therefore needs

$$
256\times54=13{,}824
$$

registers per block. Each SM has 65,536 registers, so only four blocks fit at once. The other hardware limits would allow six blocks by thread count, six by warp count, and sixteen by block count; registers reduce the actual number to four.

Across 82 SMs, at most

$$
82\times4=328\ \text{blocks}
$$

or

$$
328\times256=83{,}968\ \text{threads}
$$

from this kernel can be resident at once. The launch still contains 4,096 blocks. CUDA initially assigns up to 328 of them, keeps the rest pending, and assigns another block whenever one finishes. This requires $4096/328=12.49$ block waves, matching the `waves/SM` value reported by Nsight Compute. The waves are not synchronized batches: each SM requests new work as its current blocks finish, and block execution order is unspecified.

One matrix field contains $N^2\times9$ complex64 numbers, at 8 bytes each:

$$
N^2\times9\times8\ \text{bytes}.
$$

The actual call is

```python
matmul_abc(exp_L, V, exp_R, out=V)
```

so the output overwrites $V$ instead of allocating a fourth field. At $N=1024$, one field is exactly 72 MiB and the three fields occupy 216 MiB. The temporary $AB$ matrix exists only in registers for the resident threads; those registers are reused as successive blocks execute.

The original CuPy implementation also processed all sites as a batch:

```python
tmp = cp.matmul(A, B)
out = cp.matmul(tmp, C)
```

The difference is not only one fewer launch:

| | CuPy: two matmuls | Fused kernel |
|-|-------------------:|-------------:|
| Full lattice fields live during the operation | 5: $A,B,C,\mathrm{tmp},\mathrm{out}$ | 3: $A,B,C$; output overwrites $B$ |
| Memory at $N=1024$ | 360 MiB | 216 MiB |
| Logical global-memory traffic per site | 432 bytes | 288 bytes |
| Full-size intermediate | `tmp` in device memory | $AB$ in registers |

The fused kernel performs the same arithmetic, but removes the full $AB$ array, reduces logical memory traffic by one third, and uses a thread mapping written specifically for fixed-size $3\times3$ matrices. For a large lattice, avoiding `tmp` matters more than saving one launch.

We write two kernels: `matmul_adgba_dual` computes $V^\dagger \xi_0 V$ and $V^\dagger \xi_1 V$ simultaneously (computing $V^\dagger$ once), and `matmul_abc` computes $e_L \cdot V \cdot e_R$ in a single launch. These replace the complex64 cuBLAS calls used by the rotation and Wilson-line update. The fused matrix exponential in the next section separately eliminates the complex128 batched multiplies that dominate the profile.

### Fused matrix exponential

The algorithm stays the same: both versions use Cayley–Hamilton. What changes is how the calculation is mapped to the GPU.

In the CuPy version, every array operation is a separate piece of GPU work:

```python
M2 = cp.matmul(M, M)                  # complex64 matrix field
M_64 = M.astype(cp.complex128)        # full-lattice conversion
M2_64 = cp.matmul(M_64, M_64)         # complex128 matrix field

# Many array-wide operations for Cardano and Lagrange interpolation
theta0 = 2.0 * sqrt_u * cp.cos(phi)
e0 = cp.exp(1j * theta0)
# ... compute c0, c1, c2 ...

R = (c0[:, None, None] * eye
     + c1[:, None, None] * M
     + c2[:, None, None] * M2)
```

`M2 = cp.matmul(M, M)` must finish across the lattice and write `M2` to device memory before later launches can use it. The cast, the second matrix multiplication, and the scalar expressions do the same. A site is therefore not assigned to one thread for the duration of the matrix exponential; it is revisited by independently scheduled kernels, with intermediate arrays connecting them.

In the profiled evolution step, the two matrix-exponential calls generated 102 complex128 GEMM kernel launches for `M2_64`, followed by the elementwise kernels used to solve for and combine the coefficients. This is where the estimate of roughly 100 launches per matrix exponential comes from.

The fused version assigns one site to one thread for the complete calculation:

```c
// One thread per site. Eigenvalues in float64, result in float32.
extern "C" __global__ void matexp_su3_scaled(const float2* iH, float2* R,
                                             float scale, int n) {
    int idx = blockDim.x * blockIdx.x + threadIdx.x;
    if (idx >= n) return;

    // Load 3×3 iH into registers (float32)
    float mr[9], mi[9];
    load3x3(iH, idx, mr, mi);
    apply_scale(mr, mi, scale);

    // M² in registers
    float m2r[9], m2i[9];
    mul3x3(mr, mi, mr, mi, m2r, m2i);

    // Eigenvalues via Cardano (float64 for stability)
    double tr_M2 = trace_M2(mr, mi, m2r, m2i);
    double det_M = determinant(mr, mi);
    double theta[3];
    cardano(tr_M2, det_M, theta);

    // Lagrange interpolation coefficients (float64)
    double2 c0, c1, c2;
    lagrange_coeffs(theta, &c0, &c1, &c2);

    // R = c0·I + c1·M + c2·M² (back to float32)
    assemble_result(c0, c1, c2, mr, mi, m2r, m2i, R, idx);
}
```

The thread loads one $3\times3$ complex64 matrix, forms $M^2$, computes the invariants, solves for the eigenvalues and coefficients, assembles $R$, and finally writes the nine output elements. The matrices $M$, $M^2$, and $R$ remain thread-local. Only the scalar invariants, eigenvalues, and interpolation coefficients use float64. The scaled kernel also applies `scale * i` while loading the input instead of creating a scaled matrix field first.

At $N=1024$, the launch contains $1{,}048{,}576$ threads in 4,096 blocks of 256 threads, exactly the same grid size as `matmul_abc`. The difference is the amount of work and thread-local state. The three local $3\times3$ complex64 matrices already contain 54 float components, and each float64 value occupies two 32-bit registers. Nsight Compute reports 90 registers per thread, so one block requires

$$
256\times90=23{,}040\ \text{registers}.
$$

An RTX 3090 has 65,536 registers per SM, so only two of these blocks can reside on one SM at a time. Across 82 SMs, that is 164 resident blocks, or 41,984 resident threads. CUDA schedules the 4,096-block grid in

$$
\frac{4096}{164}=24.98
$$

block waves, matching the `waves/SM` value reported by Nsight Compute. When a block finishes, its registers are released and a pending block is assigned to that SM.

The pre- and post-optimization comparison is:

| | Pure CuPy | Fused CUDA kernel |
|-|-----------|-------------------|
| Algorithm | Cayley–Hamilton | Cayley–Hamilton |
| Work mapping | Many array-wide kernels; sites return to device memory between operations | One thread carries one site from input to output |
| Launches per matrix exponential | Roughly 100 | 1 |
| Full matrix arrays created inside `matexp` | `M`, `M2` in complex64 and `M_64`, `M2_64` in complex128: 432 MiB at $N=1024$, before the scalar arrays | No full-lattice intermediates; input plus output occupy 144 MiB |
| Precision | Full matrix fields $M_{64}$ and $M^2_{64}$ in complex128 | Matrix algebra in complex64; scalar solve in float64 |
| Left exponential | 287 ms | 1.95 ms |
| Right exponential | 287 ms | 2.38 ms |

The CuPy times are per-call CUDA-event measurements; the fused times are the corresponding kernel durations in the Nsight Compute capture.

The reduction is therefore much larger than saving launch overhead. Fusion removes the full complex128 matrix fields, repeated reads and writes of intermediate arrays, and a general batched-GEMM implementation for $3\times3$ matrices. The result is one compute-heavy kernel: the left and right launches reach about 86% SM throughput while using only 7–9% of DRAM throughput.

### Batching independent work

The left exponential does not depend on $V$, so we precompute 10 steps at once: generate all noise in one batch, one batched `rfft2` (the noise is real, so we use R2C FFTs — half the spectrum), one batched convolution and `irfft2`, one batched algebra assembly, one batched matexp. This turns $10 \times (\text{many kernel launches})$ into 6 batched operations.

For the right side, the noise must be rotated by the current $V$ (state-dependent), so it cannot be precomputed. We still fuse the k-space convolution into a single kernel that loads $\tilde{K}_x, \tilde{K}_y$ into registers and loops over all 9 matrix elements — 3× less memory traffic than the naive broadcast multiply.

### What cannot be optimized

Not everything benefits from custom kernels. cuFFT already runs at 76–93% of peak DRAM throughput — it is hitting its ceiling, and there is nothing to gain by reimplementing it. Path ordering ($V_1 \cdot V_2 \cdots V_{50}$ per site) is inherently serial across layers; we fused it into one kernel where each thread does the sequential multiply in registers, but no parallelism exists to exploit. The left-side k-space convolution has an unfavorable data layout (8 fields × batch × 2 polarizations × $N$ × $N/2+1$) — a fused kernel would require a transpose that costs more than it saves.

## 5. After Optimization

We profile the optimized code with the same Nsight Compute setup. Every kernel is now either a custom RawKernel or a cuFFT library call:

| Kernel | Duration | SM % | DRAM % |
|--------|----------|-----:|-------:|
| matexp_su3_scaled (left) | 1.95 ms | 86.4 | 8.5 |
| matexp_su3_scaled (right) | 2.38 ms | 86.3 | 6.9 |
| matmul_adgba_dual (V†ξV) | 632 μs | 8.1 | 79.1 |
| matmul_abc ($e_L \cdot V \cdot e_R$) | 419 μs | 6.5 | 90.1 |
| fused_conv_c2c | 288 μs | 6.0 | 92.3 |
| assemble_algebra | 282 μs | 5.5 | 79.0 |
| assemble_su3_noise | 552 μs | 5.6 | 79.7 |
| reunitarize_su3 | 310 μs | 5.0 | 79.8 |
| cuFFT (all combined) | ~1.8 ms | 15–36 | 68–93 |

Total per evolution step: ~8.6 ms, down from 1466 ms — a 170× speedup. Total kernel launches per step: 13, down from 499.

## 6. Conclusion

| | Naive CuPy | Optimized CUDA |
|-|-----------|----------------|
| Evolution step | 1466 ms | 8.6 ms |
| Kernel launches/step | 499 | 13 |
| IC (50 layers) | 9.4 s | 134 ms |

The 170× speedup comes from one principle applied in three ways. First, **fusion**: replace many small kernels with one that keeps data in registers, so that the GPU spends its time on arithmetic rather than kernel launches and redundant memory traffic. Second, **right-sizing**: cuBLAS is designed for matrices that fill a warp; for $3 \times 3$, one thread per site with data in registers is faster than any library. Third, **batching**: the $N_y$ layers in the IC and the left-side exponentials across evolution steps are independent — we process them in one shot.

These are the same techniques behind XLA's operator fusion, `torch.compile`'s kernel merging, and custom CUDA kernels in production ML systems (FlashAttention, fused Adam, fused layer norm). The domain is different, but the engineering is the same: profile, identify the gap between hardware ceiling and achieved throughput, close it systematically, and stop when the roofline says there is nothing left to close.
