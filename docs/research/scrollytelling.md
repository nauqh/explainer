# Scrollytelling and explorable explainers: what to copy for LLM-generated ML lessons

Research note, 2026-10-07. All web sources accessed 2026-10-07 unless stated. "Measured" means I counted it myself from source code; "unverified" means I could not confirm it from the primary source.

Scope: how the best scroll-driven and explorable explainers structure steps and visuals, and what that implies for a lesson the model configures from a fixed widget catalog (`backend/src/explainer/widgets.py`, PRD sections "Lesson spec", "Widget catalog", "Rendering").

## Executive summary: top recommendations

1. **Build `Distribution` first.** An animated, sorted bar chart of probabilities computed in the browser from model-given logits, with `temperature`, `topK`, `topP` and seeded `draws` as state. It is the visual Transformer Explainer uses for exactly the temperature question ([repo, `ProbabilityBars.svelte`, `textbookPages.ts`](https://github.com/poloclub/transformer-explainer)), and it would have rescued the weak temperature lesson on its own.
2. **Then build `PointCloud`, a seeded scatter with a computed model overlay** (boundary, regression line, k-means, kNN, tree splits). In my measurement, 13 of the 14 MLU-Explain articles use a scatter or beeswarm component ([aws-mlu-explain](https://github.com/aws-samples/aws-mlu-explain)), and R2D3 is built on one ([r2d3.us](https://r2d3.us/visual-intro-to-machine-learning-part-1/)). It covers the most classical ML concepts of any widget.
3. **Add a shared annotation layer and a camera to the step, not to each widget.** Each step gets `annotate` (callouts anchored to part ids) and `camera` (zoom to a part). This is how MLU-Explain and Transformer Explainer make one persistent visual tell a story ([d3-annotation](https://d3-annotation.susielu.com/), [Transformer Explainer `highlightElements`/`expandedBlock`](https://github.com/poloclub/transformer-explainer)). It also applies Mayer's signaling and spatial contiguity principles ([Cambridge Handbook ch. 12](https://www.cambridge.org/core/books/abs/cambridge-handbook-of-multimedia-learning/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles/CD5B7AE1279A9AB81F8EEBB53DBEC86E)).
4. **Every step must change the picture.** Lint that each step either changes one state key or adds a highlight, annotation or camera move. MLU steps each add exactly one layer: points, then curve, then boundary, then a worked example ([logistic-regression `ScrollSide.svelte`](https://github.com/aws-samples/aws-mlu-explain)).
5. **Let step text quote computed numbers through readouts** (`{fact:topProb}`), never model-typed numbers. MLU's precision-recall steps print live TP/FP counts computed from the chart's state ([`ScrollViz.svelte`](https://github.com/aws-samples/aws-mlu-explain)).
6. **Raise the step word cap from 40 to about 80, and require 3 to 8 steps per scrolly scene.** Measured MLU-Explain steps run 26 to 113 words, with a median of about 70. The 40-word cap and short scenes are part of why the lesson reads as "a short answer".
7. **Use slower, staged data transitions (about 1 s) and fixed axes per scene.** Heer and Robertson found animated transitions beat static ones and recommend about 1 s per stage. They also found axis rescaling hurts estimation, so common scales should be used across steps ([Heer & Robertson 2007](https://idl.cs.washington.edu/files/2007-AnimatedTransitions-InfoVis.pdf)). The PRD's 300-500 ms suits highlights but is short for value morphs.
8. **Follow a martini-glass shape inside each scene.** Run guided steps first, then hand the same visual's sliders to the learner in a final "your turn" step ([Segel & Heer 2010](http://vis.stanford.edu/files/2010-Narrative-InfoVis.pdf), [Nicky Case](https://blog.ncase.me/how-i-make-an-explorable-explanation/), MLU's last logistic-regression step embeds the sliders).
9. **Add an optional `scrub` step.** One numeric key sweeps with scroll progress (react-scrollama `onStepProgress`), so the reader "climbs the ladder of abstraction" by watching a parameter vary across its range ([Bret Victor](https://worrydream.com/LadderOfAbstraction/), [Bostock](https://bost.ocks.org/mike/scroll/)). Discrete triggers stay the default.
10. **Keep both modes, and keep the text sufficient on its own.** The evidence on scroll vs stepper is mixed, and only a fraction of readers interact ([Hohman et al. 2020](https://distill.pub/2020/communicating-with-interactive-articles/)). Reduced motion means instant state changes with fades ([WCAG 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)).

## 1. Step and pacing patterns

### What the pieces actually do

- **Sticky graphic plus step triggers is the canonical pattern.** Text blocks trigger chart states while the chart stays fixed ([Samora, Pudding, Jan 2017](https://pudding.cool/process/how-to-implement-scrollytelling/)). Scrollama uses IntersectionObserver, with an `offset` trigger line (default 0.5), `onStepEnter`/`onStepExit` carrying `direction`, and optional `onStepProgress` (0 to 1). It recommends CSS `position: sticky` for the graphic and pixel offsets on mobile "so it doesn't jump around" ([scrollama README](https://github.com/russellsamora/scrollama)). react-scrollama exposes the same callbacks with a default `offset` of 0.3 ([react-scrollama](https://github.com/jsonkao/react-scrollama)).
- **Each step sets the whole state, so scrolling back works.** MLU's logistic regression maps each step index to a function that sets every layer explicitly: step 1 shows the points and hides the curve and boundary, step 2 shows the curve, step 3 the boundary, step 4 the example ([`ScrollSide.svelte`](https://github.com/aws-samples/aws-mlu-explain)). This is the PRD's "scene defaults + this step's `set`", and it satisfies Bostock's "Allow rapid, incremental, reversible scrolling" ([How To Scroll, 2014](https://bost.ocks.org/mike/scroll/)).
- **One change per step.** MLU adds one layer per step (above). Transformer Explainer's textbook mode is a stepper of about 20 pages over one persistent visualization. Each page's `on()` highlights one region, such as `.column.final` for logits or `.step.softmax .title` for probabilities, and `out()` removes it ([`textbookPages.ts`](https://github.com/poloclub/transformer-explainer)). The PRD's `one-change` lint is consistent with practice.
- **Steps per scene.** In MLU, a scrolly section has 4 steps: logistic regression and linear regression each have 4 text steps (measured). Precision-recall has about 5 (Accuracy, Problems, Precision, Recall, then F1), measured from the `steps` array. R2D3 part 1 runs one long scroll section in which the same points move from scatter to histogram to tree ([r2d3.us](https://r2d3.us/visual-intro-to-machine-learning-part-1/)). I could not count its steps because the site returned HTTP 522 on two of three fetches, so that count is unverified. Pudding advises fewer steps on mobile ([Responsive scrollytelling, Apr 2017](https://pudding.cool/process/responsive-scrollytelling/)).
- **Words per step.** Measured step lengths: MLU logistic regression 56, 89, 113 and 26 words; linear regression 59, 85, 90 and 51. That is a median of about 70, and the longest step explains the decision threshold *and* a user scenario. Mayer's segmenting principle supports learner-paced chunks, but it gives no word count ([Cambridge Handbook](https://www.cambridge.org/core/books/abs/cambridge-handbook-of-multimedia-learning/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles/CD5B7AE1279A9AB81F8EEBB53DBEC86E)). Taken together, 40 words is below practice. 30 to 80 words with one idea per step is a defensible band, and it is my recommendation, not a finding.

### Transitions: morph, replace, annotate, zoom

Seyser and Zeiller's analysis of 50 scrollytelling pieces names five techniques: graphic sequence (replace), animated transition (morph), pan and zoom, moviescroller (scrubbing video), and show-and-play (autoplay). It also gives a text-to-visual ratio of one-to-one, one-to-many or many-to-one ([summary via search, paper on ResearchGate](https://www.researchgate.net/publication/329480641_Scrollytelling_-_An_Analysis_of_Visual_Storytelling_in_Online_Journalism); I read summaries, not the full paper, so treat the details as unverified).

For this catalog:

| Transition | When | Example | Our mechanism |
| --- | --- | --- | --- |
| Morph | Same marks, new values or encoding | Bars reshape as temperature changes; R2D3 points regroup into histograms | a state key change |
| Annotate | Same picture, new meaning | A callout on the cutoff line; MLU highlights with rough-notation and d3-svg-annotation ([`annotations.js`, `annotatedTree.js`](https://github.com/aws-samples/aws-mlu-explain)) | `annotate` / `highlight` |
| Zoom | Drill into a part (ladder of abstraction) | Transformer Explainer's `expandedBlock.set({id:'softmax'})` on the Temperature page, then it highlights the scaled formula and the temperature input | `camera` |
| Replace | Different chart type | A new scene | a new scene, never mid-scene |

Rules from the controlled study ([Heer & Robertson 2007](https://idl.cs.washington.edu/files/2007-AnimatedTransitions-InfoVis.pdf)):

- Animated transitions significantly improved object tracking and value-change estimation over static jumps. Staged animation was significantly preferred in most conditions.
- "Maintain valid data graphics during transitions": intermediate frames should be real charts.
- Entering and exiting items fade with alpha blending. Grow-from-baseline was rejected as non-meaningful motion.
- "Common scales should be used across timesteps to remove the need for axis rescaling." When a rescale is unavoidable, rescale first and change values second.
- Time each stage at about 1 s. Heavy multi-stage choreography backfired ("most subjects laughed").

Implication: a widget should compute its scale domains over **all step states in the scene** at mount, so axes never move between steps. Data morphs should run about 600-1000 ms, while highlights and annotation fades can stay at 200-300 ms.

### Discrete vs continuous triggers

- Bostock contrasts position-based transitions, which "automatically adjust speed to match how the reader scrolls", with time-based ones that fire on a trigger. He favours keeping control with the reader and keeping "at least some visible content scroll normally" ([How To Scroll](https://bost.ocks.org/mike/scroll/)).
- McKenna et al. (240 crowd participants) found that visual and navigation feedback affected engagement while discrete vs continuous control did not ([Visual Narrative Flow, EuroVis 2017](https://vdl.sci.utah.edu/publications/2017_eurovis_narrative-flow/)).
- Recommendation: keep discrete `onStepEnter` triggers as the default, because they are reversible and cheap. Add an opt-in `scrub` on a step that sweeps one numeric key from `from` to `to` with `onStepProgress`. In stepper mode the same scrub becomes a short autoplay with a replay button. Under reduced motion it jumps to `to`.

## 2. Visual vocabulary for ML explainers

Ranked by how many concepts each covers. The concept counts are my judgment against a roughly 35-concept list spanning foundations, deep learning and LLM engineering. Coverage per widget is listed so the ranking can be checked.

| Rank | Visual | Used by | State it animates | Parts it exposes | Concepts it covers |
| --- | --- | --- | --- | --- | --- |
| 1 | **Point cloud + model overlay** (decision boundary, fit line, centroids) | MLU-Explain 13/14 articles (measured: Scatter/Scatterplot/Beeswarm components), R2D3 parts 1-2, TensorFlow Playground boundary heatmap ([playground](https://playground.tensorflow.org/)) | threshold, k, iteration, model complexity (degree, depth, min node size in [R2D3 pt 2](https://r2d3.us/visual-intro-to-machine-learning-part-2/)), train/test split | classes, boundary, fit, centroids, errors, train/test sets | classification, logistic and linear regression, kNN, k-means, decision boundary, overfitting, bias-variance, regularization, train/val/test, precision/recall threshold (1D beeswarm), double descent (~11) |
| 2 | **Bar distribution** (logits to probabilities) | Transformer Explainer `ProbabilityBars` with temperature, top-k and top-p; Seeing Theory observed vs true bars converging as you "Flip 100 times" ([Seeing Theory](https://seeing-theory.brown.edu/basic-probability/index.html)) | temperature, top-k/top-p cutoff, logits vs probs, sample counts | bars, cutoff line, target bar | softmax, temperature, top-k, top-p, greedy vs sampling, cross-entropy for the target class, classifier outputs, one attention row, law of large numbers (~9) |
| 3 | **Token strip** with arcs | Transformer Explainer token and embedding pages; BertViz head view, where line weight shows attention ([Vig 2019](https://arxiv.org/abs/1906.05714)); Distill attention diagrams ([Olah & Carter 2016](https://distill.pub/2016/augmented-rnns/)) | upTo (generation), selected token, overlay (ids, attention, mask) | tokens, arcs, ids, mask, window | tokenization, context window, autoregressive generation, attention, causal mask, KV cache, positional encoding, prompt structure (~8) |
| 4 | **Matrix heatmap** (exists) | Distill attention distributions; MLU confusion matrix; Alammar's coloured vector strips ([Illustrated Word2vec](https://jalammar.github.io/illustrated-word2vec/)) | selected cell, row reveal | cells, rows, cols | attention matrix, confusion matrix, similarity, convolution kernel, weight matrix, embedding vectors (~6) |
| 5 | **Loss curve with stepping ball** | Distill "Why Momentum Really Works", with step-size and momentum sliders and live paths ([Goh 2017](https://distill.pub/2017/momentum/)); MLU `GradientDescent*` components in linear and logistic regression | step index, learning rate, momentum | ball, path, minimum, gradient arrow | gradient descent, learning rate, divergence, momentum/Adam, local minima, convergence (~6) |
| 6 | **Vector / embedding map** | Embedding Projector, with PCA/t-SNE and nearest neighbours ([Smilkov et al. 2016](https://arxiv.org/abs/1611.05469)); Alammar's 2D personality plot and king-man+woman | query, k neighbours, analogy | items, groups, neighbour links, arrow | embeddings, cosine similarity, vector search, RAG retrieval, clustering, analogies (~6) |
| 7 | **Layer graph** with activations | TensorFlow Playground (edge colour and thickness for weight sign and size, per-neuron output heatmaps); CNN Explainer overview with drill-down ([Wang et al. 2020](https://arxiv.org/abs/2004.15004)); MLU `NetworkScroll`, `BackProp` | active layer, forward/backward | layers, nodes, edges | MLP, forward pass, backprop, activation functions, depth, dropout (~6) |
| 8 | **Tree** | R2D3 (points flow down the tree); MLU decision-tree and random-forest | depth, path of one example | nodes, edges, leaves | decision tree, random forest, beam search, BPE merges (~4) |

Supporting evidence for animation: Hohman et al. say animation is especially effective for "state transitions, uncertainty, causality, and constructing narratives" ([Distill 2020](https://distill.pub/2020/communicating-with-interactive-articles/)). The current catalog has no widget that animates a *value change*, which is the core of most ML intuitions (a parameter changes, the outcome shifts). FunctionPlot comes closest.

## 3. Layout and annotation

- **Sticky beside text on desktop, top-pinned visual on phones.** This matches the PRD. Pudding's mobile advice is to "keep scrolling" only when "the transitions are truly meaningful, and not just something to make it pop", and otherwise to stack static charts. It also says not to use `vh` heights (mobile bars resize the viewport) and to replace hover with fixed annotations ([Samora, Apr 2017](https://pudding.cool/process/responsive-scrollytelling/)). Scrollama recommends pixel offsets on mobile.
- **Annotation is part of the visual, not the text.** MLU uses `d3-svg-annotation` for tree labels and `rough-notation` for highlights. d3-annotation's anatomy is subject (the thing annotated), connector (line, elbow or curve, optional arrow) and note. Its types include label, callout, circle, rect, threshold and badge ([d3-annotation](https://d3-annotation.susielu.com/)). Placing the note next to the part is Mayer's spatial contiguity, and the highlight is signaling ([Cambridge Handbook](https://www.cambridge.org/core/books/abs/cambridge-handbook-of-multimedia-learning/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles/CD5B7AE1279A9AB81F8EEBB53DBEC86E)).
- **Two-way text-visual linking is preferred by readers.** Zhi, Ottley and Metoyer tested bidirectional highlighting of text and chart elements. Linking and the slideshow layout were preferred ([CGF 2019](https://onlinelibrary.wiley.com/doi/abs/10.1111/cgf.13719)). The PRD's `[[part:id|label]]` already does this. The gap is that the generated lesson rarely pointed at anything meaningful, because the widgets expose few meaningful parts.
- **Text references the computed state.** MLU precision-recall step text interpolates `{$TP}`, `{$FP}` and the computed precision ([`ScrollViz.svelte`](https://github.com/aws-samples/aws-mlu-explain)). The PRD's `{stateKey}` prints inputs. What is missing is printing *outputs* (see section 5).
- **Mobile annotations:** fewer and shorter (at most about 8 words), attached to the part with no long connector, and never relying on hover. This is my recommendation, extrapolated from Pudding's hover guidance.

## 4. Interaction: guided vs free play

- **Martini glass:** an author-driven stem, then a reader-driven open mouth ([Segel & Heer 2010](http://vis.stanford.edu/files/2010-Narrative-InfoVis.pdf)).
- **Nicky Case:** "make them love the question", climb from concrete to abstract, and end in a sandbox: "In the beginning, I start by giving the player _my_ question. And at the end, I want them to explore their _own_ questions." ([2017](https://blog.ncase.me/how-i-make-an-explorable-explanation/))
- **Bret Victor:** "the explorable is integrated with the explanation" rather than sent to a separate sandbox ([Explorable Explanations, 2011](https://worrydream.com/ExplorableExplanations/)). His ladder essay argues that insight comes from varying a parameter across its whole range, then stepping down to one concrete case ([Ladder of Abstraction, 2011](https://worrydream.com/LadderOfAbstraction/)).
- **MLU practice:** the final step of the logistic scroll section embeds two sliders (temperature, decision boundary) that drive the same sticky chart, and the text reports the live prediction. Precision-recall step text says "Try moving the threshold for yourself!" mid-scroll.
- **Caveat:** an often-cited NYT finding that "only a fraction of readers interact with non-static content" is anecdotal, but it is why the guided path must carry the lesson ([Hohman et al.](https://distill.pub/2020/communicating-with-interactive-articles/)). The PRD already requires this.

Recommendation: allow the **last step of a scrolly scene** to declare `controls` (the same shape as explore-scene controls), which turns sliders on for that step only. Coverage lint ignores what happens under those controls, just as it does for explore scenes. Hand over control only after the guided steps have shown the parameter's effect at least twice (low, then high).

## 5. Implications for an LLM-configured catalog

### Who owns what

| The model configures | The widget owns |
| --- | --- |
| Which widget and recipe; small **inputs** (logits, seed dataset kind, text, a few vectors) | All **computed outputs** (probabilities, fits, boundaries, optimizer paths, nearest neighbours) |
| Parameter ranges and per-step values (`set`) | Scales and domains (fixed over all of the scene's steps), layout, colour, mark shapes |
| `highlight`, `annotate` text and anchor, `camera` target | Annotation placement and collision avoidance, connector routing, mobile simplification |
| Step text, including readout placeholders | Transition timing and staging, enter/exit fades, reduced-motion behaviour |
| Optional `scrub` (key, from, to) and final-step `controls` | `describe()`, readouts, accessible name, text alternative, keyboard focus order of parts |

### Keeping visuals honest

- **Illustrative inputs, computed outputs.** The model may write logits, a seed or a handful of 2-8 dimensional vectors, because no runtime model is available. Everything derived is computed in the browser, as `FunctionPlot` and `Matrix` already do. Inputs shown on screen carry a small "illustrative values" note. Transformer Explainer runs a real GPT-2 in the browser through ONNX for real numbers ([repo](https://github.com/poloclub/transformer-explainer)), which is out of scope for now.
- **Readouts.** Each widget exports named facts from `describe()`, such as `topLabel`, `topProb`, `entropy` and `nucleusSize`. Step text quotes them as `{fact:topProb}`. The `refs` lint resolves them. A new **warning** lint flags bare numbers in step text in a scene whose widget computes values, since the model should quote a readout instead.
- **Text matches visual** stays the eval of record, and readouts make most contradictions impossible by construction.
- **Seeded randomness.** Datasets and sampling `draws` come from a seeded PRNG in props, so every learner and every eval sees the same picture.

### Expressiveness without code: three cross-cutting step fields

Add these to `Step`, implemented once in the renderer, so every widget gets them:

```python
class Annotation(Model):
    id: Id
    anchor: Id                  # a part id of the scene's widget
    text: str = Field(max_length=60)
    kind: Literal["label", "callout", "threshold", "badge"] = "callout"

class Scrub(Model):
    key: str                    # a numeric state key (Range)
    from_: float = Field(alias="from")
    to: float

class Step(Model):              # existing fields: id, text, set, highlight, covers
    annotate: list[Annotation] = Field(default_factory=list, max_length=3)
    camera: Id | None = None    # part id to zoom to; None = whole visual
    scrub: Scrub | None = None
    controls: list[Control] = Field(default_factory=list, max_length=3)  # last step only
```

Renderer contract: every widget component exports `anchor(partId) -> {x, y, width, height}` in its own SVG coordinates. The annotation layer and camera use that and nothing else. A beat is then fully declarative: one state change, plus what to point at, plus what to say.

Lint changes:

- `word-cap` rises from 40 to 80.
- New `scene-length` error: scrolly scenes need 3 to 8 steps.
- New `step-does-work` error: each step changes a state key, or adds a highlight, annotation or camera move.
- `one-change` is unchanged. Annotations, highlights and camera do not count as state changes, and `scrub` counts as one change.
- `scrub.key` must be a `Range` key, and `from`/`to` must lie inside it.

## 6. Proposed widget list for the next iteration

These follow the `widgets.py` pattern: a `Visual` subclass with `kind`, `description`, `props`, `state_spec()` returning `Range`/`OneOf`, and `parts()`. "Facts" are the `describe()` readouts. Build them in this order.

### 6.1 `Distribution` (chart), new

```python
class DistributionProps(Model):
    labels: list[str] = Field(min_length=2, max_length=12)       # each max 20 chars
    logits: list[float]                                           # illustrative raw scores, one per label
    target: int | None = None                                     # index of the correct label (cross-entropy)
    temperature: Param | None = None                              # reuse Param: range for the key
    seed: int = 1                                                 # for draws
    # validator: len(logits) == len(labels); labels unique
```

- State: `temperature` Range(p.min, p.max) (default range 0.1-3); `topK` Range(1, n, integer); `topP` Range(0.05, 1); `view` OneOf("logits", "probs"); `draws` Range(0, 500, integer), which shows sampled counts next to the probabilities, Seeing Theory style.
- Parts: `bar-<i>` per label, `cutoff` (top-k/top-p line), `target`, `axis`, `draws`.
- Facts: `topLabel`, `topProb`, `targetProb`, `crossEntropy`, `entropy`, `nucleusSize`, `keptLabels`.
- Rendering: bars sorted by logit and kept in that order whatever the temperature (the order never changes, only the lengths). Bars outside top-k/top-p fade, they are not removed. The x domain is fixed to the max probability over all the scene's steps.

### 6.2 Cross-cutting: `annotate`, `camera`, `scrub`, final-step `controls`, readouts

Specified in section 5. Build these alongside `Distribution`, because they are what turns "a grid of numbers" into a told story.

### 6.3 `PointCloud` (chart), new

```python
class Dataset(Model):
    shape: Literal["blobs", "moons", "circles", "xor", "line", "curve"]
    n: int = Field(ge=10, le=200)
    noise: float = Field(ge=0, le=1)
    classes: int = Field(ge=1, le=3)       # 1 for regression shapes
    seed: int

class PointCloudProps(Model):
    dataset: Dataset
    xLabel: str; yLabel: str               # max 30
    classLabels: list[str] = []            # one per class
    model: Literal["none", "linear", "logistic", "knn", "kmeans", "polynomial", "tree"]
```

- State, depending on `model`:
  - always: `split` OneOf("all", "train", "test") and `show` OneOf("points", "fit", "errors");
  - `logistic`: `threshold` Range(0, 1) and `iteration` Range(0, 30, integer), which steps the fit;
  - `knn`: `k` Range(1, 15, integer) and `query` OneOf(None, "point-<i>"...);
  - `kmeans`: `k` Range(2, 6, integer) and `iteration` Range(0, 10, integer);
  - `polynomial`: `degree` Range(1, 12, integer);
  - `tree`: `depth` Range(0, 6, integer), as in R2D3.
- Parts: `class-<i>`, `boundary` (or `fit`), `centroid-<i>`, `errors`, `train`, `test`, `axis-x`, `axis-y`.
- Facts: `trainAccuracy`, `testAccuracy`, `trainError`, `testError`, `misclassified`, `iterationLoss`.
- One widget with a `model` discriminator, like `Matrix` recipes. All fitting is deterministic and small (n ≤ 200).

### 6.4 `TokenStrip` (process), new

```python
class AttentionLink(Model):
    from_: int = Field(alias="from"); to: int; score: float   # token indices, illustrative score

class TokenStripProps(Model):
    text: str = Field(max_length=280)
    encoding: Literal["o200k", "cl100k", "words"] = "o200k"
    links: list[AttentionLink] = Field(default_factory=list, max_length=24)
```

- Tokenization happens **in the backend validator** (tiktoken), and the resulting `tokens` are written into the props. The model never guesses token boundaries, and both the lint and the frontend know `n`. A link may only reference token indices that exist. Scores are softmaxed per `from` token in the browser.
- State: `upTo` Range(1, n, integer); `selected` OneOf(None, "token-<i>"...); `overlay` OneOf("none", "ids", "attention", "mask"); `window` Range(1, n, integer), which shades tokens outside the context window.
- Parts: `token-<i>`, `arcs`, `ids`, `mask`, `window`.
- Facts: `tokenCount`, `selectedToken`, `strongestLink`, `charsPerToken`.
- Unverified: whether a JS tokenizer is needed at all. Doing it server-side avoids a frontend dependency.

### 6.5 `Descent` (process), new

```python
class DescentProps(Model):
    expression: str                 # 1D loss over x, same grammar as FunctionPlot (reuse check_expression)
    x: Axis
    start: float
    optimizer: Literal["gd", "momentum"] = "gd"
    maxSteps: int = Field(ge=1, le=50)
    learningRate: Param             # range for the key
```

- State: `step` Range(0, maxSteps, integer); `learningRate` Range(p.min, p.max); `momentum` Range(0, 0.99), only when `optimizer == "momentum"`.
- Parts: `curve`, `ball`, `path`, `minimum`, `gradient`.
- Facts: `lossAtStep`, `xAtStep`, `diverged`, `convergedAt`.
- Pairs naturally with `scrub` on `step`, so the ball descends as you scroll. 2D contour surfaces like Distill's momentum article are a follow-up.

### 6.6 `VectorMap` (structure), new

```python
class Item(Model):
    id: Id; label: str; vector: list[float]; group: Id | None = None   # 2-8 dims, all same length

class VectorMapProps(Model):
    items: list[Item] = Field(min_length=3, max_length=30)
    analogy: tuple[Id, Id, Id] | None = None   # a - b + c
```

- The browser projects the vectors with PCA (or plots them directly when there are 2 dims). Cosine similarity and neighbours are computed.
- State: `query` OneOf(None, item ids); `k` Range(0, 5, integer); `showAnalogy` bool OneOf(True, False); `showGroups` OneOf(True, False).
- Parts: `item-<id>`, `group-<id>`, `neighbours`, `analogy`.
- Facts: `nearest` (labels with cosine), `analogyResult`.
- Caveat to state in the UI: a 2D projection distorts distances. The computed cosine readout is the honest number.

### 6.7 Changes to existing widgets

- **`Diagram`**: add `layout: Literal["flow", "tree", "layers"]` and a `path` state (a node id), which highlights the route from the root. This covers R2D3-style trees, beam search and network structure without a new widget. A value-carrying `LayerGraph` (activations flowing, à la TensorFlow Playground) is deferred until a benchmark lesson needs it.
- **`Matrix`**: render as a colour heatmap with a legend (Distill, Alammar). Add `revealRows` Range(0, rows, integer) so a softmax can be shown row by row. Add readouts `selectedValue` and `rowMax`.
- **`FunctionPlot`**: add a `marker` state (an x value) with parts `marker` and `marker-y`, and a readout `yAtMarker`, so steps can point at a value instead of just the curve.

### Build order and rationale

1. `Distribution` plus the cross-cutting step fields fixes the observed failure and serves every LLM-centric benchmark question.
2. `PointCloud` has the widest classical-ML coverage.
3. `TokenStrip` covers LLM mechanics.
4. `Descent`.
5. `VectorMap`.
6. The `Diagram` and `Matrix` upgrades.

## 7. Scroll vs stepper: what the evidence says

- **McKenna et al. 2017:** readers preferred step- or scroll-based navigation. There was no significant engagement difference between discrete and continuous control, but feedback mattered ([paper page](https://vdl.sci.utah.edu/publications/2017_eurovis_narrative-flow/)).
- **Zhi et al. 2019:** comprehension was better in slideshow layouts than in vertical scroll, according to the summary in Hohman et al. ([Distill](https://distill.pub/2020/communicating-with-interactive-articles/), [paper](https://onlinelibrary.wiley.com/doi/abs/10.1111/cgf.13719)). I verified the preference result from the abstract. The comprehension result comes via Hohman.
- **Méndez & Such, CHI 2026 (N=454, privacy policies):** scrollytelling matched other formats on comprehension, with "higher engagement, lower cognitive load" than text ([arXiv 2603.04367](https://arxiv.org/abs/2603.04367)).
- **Transformer Explainer:** its user study (90 participants) reported significant gains in understanding and engagement ([arXiv 2408.04619](https://arxiv.org/abs/2408.04619)). This compares the tool against a baseline, not scroll against stepper.
- **Gap:** I found no 2023-2026 study that directly compares scrollytelling and stepper on *learning outcomes* for ML concepts. That supports the PRD's parity requirement and suggests an A/B test on the recall block once there is traffic.

## 8. Accessibility for scroll-driven visuals

- **WCAG 2.3.3 (AAA)** allows motion triggered by interaction to be disabled unless essential. It names scroll-triggered extras and parallax, and its technique is `prefers-reduced-motion` ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)). Recommendation: under reduced motion, state changes are instant with a fade, and `scrub` jumps to its end value.
- **WCAG 2.2.2:** autoplay over 5 s needs a pause control (already in the PRD). A `scrub` replay in stepper mode is short and user-started.
- **Screen-reader structure:** Zong et al. recommend keeping alt text and data tables, then adding hierarchical structure (overview, then marks), multiple navigation modes and adjustable verbosity ([MIT VIS 2022](https://vis.csail.mit.edu/pubs/rich-screen-reader-vis-experiences/)). Concretely for this repo:
  - the `describe()` output becomes the per-step text alternative, announced via a polite live region on step change;
  - parts become focusable in a fixed order with their labels;
  - each computed widget offers a "show data table" toggle.
- **Mobile:** no hover-only information (Pudding), tap targets for parts, and annotations short enough to fit the 40% pinned area.

## Unverified or limited items

- R2D3 step counts and exact morph sequences: the site returned HTTP 522 twice. The descriptions above come from one successful fetch summary.
- Seyser & Zeiller technique list: from search summaries and the data.europa.eu guide, not the full paper.
- The Bostock rule wording comes from a page fetch on 2026-10-07 (essay dated 2014-11-03).
- The Transformer Explainer venue is listed as CHI 2026 on the arXiv page and README. Its user-count figure ("over 490,000 users") is self-reported.
- Concept-coverage counts in section 2 are my own judgment, not a measurement.
- The MLU-Explain repo was archived (read-only) on 2026-03-06, per its GitHub page. The code is still readable.
