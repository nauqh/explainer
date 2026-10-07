# Widget catalog

## Diagram (structure)

Boxes and arrows: components and how they connect (architectures, pipelines, roles). Nodes are revealed in list order up to `visible`; `focus` emphasises one node or group. Reveal nodes one step at a time to build the picture up.

## Sequence (process)

Who sends what to whom, in order, as a sequence diagram. Messages are text only. `upTo` reveals every message up to and including that message id.

## Compare (structure)

A side-by-side table comparing 2 to 4 options across a few rows. `highlight` emphasises one column, or none.

## FunctionPlot (chart)

A curve y = f(x) that the browser computes from `expression`. Grammar: numbers, x, declared parameters, + - * / ^, parentheses, and abs, cos, exp, log, max, min, sin, sqrt, tanh. Each parameter is a state key within its range. Never write plotted values yourself.

## Matrix (structure)

A grid whose cell values the browser computes from a recipe: 'softmax' (rows of raw scores, each row softmaxed, e.g. attention weights), 'dot-product' (row vectors times column vectors, e.g. similarity) or 'confusion' (counts of actual vs predicted class). `selected` emphasises one cell, id 'cell-<row>-<col>' with 0-based indices, or none. Never write computed cell values yourself.
