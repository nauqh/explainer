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

Facts for {fact:name}: selectedValue.

## Distribution (chart)

Bars of a probability distribution over a few options (next tokens, classes, attention targets), computed in the browser as softmax(logits / temperature). Bars stay in logit order; only their lengths change. `view` shows raw 'logits' or 'probs'. `topK` and `topP` fade the bars that sampling would drop and draw a cutoff line. Parts: 'bar-<i>' (0-based label index), 'cutoff', 'target'. Use it for softmax, temperature, top-k, top-p, greedy vs sampling, classifier outputs, cross-entropy.

Facts for {fact:name}: topLabel, topProb, entropy, kept, targetProb, crossEntropy.

## PointCloud (chart)

A scatter of seeded data points with a model fitted in the browser. `model`: 'linear' or 'polynomial' (regression on line/curve data, fitted on the training points), 'logistic' (2 classes, trained by gradient descent, one `iteration` per step), 'knn' (k nearest neighbours, shades the decision regions), 'kmeans' (clusters blobs, centroids move with `iteration`), or 'none'. `show` builds the picture up: 'points', then 'fit' (line, curve, regions or centroids), then 'errors' (residuals or misclassified points). `split` shows 'all' points, only 'train' or only held-out 'test' points. Use it for regression, classification, decision boundaries, overfitting and underfitting, bias-variance, train/test splits, kNN, k-means and gradient descent on a model. Parts: 'class-<i>', 'fit', 'errors', 'train', 'test', 'centroid-<i>' (kmeans), 'axis-x', 'axis-y'. Overfitting is only visible with few points: for it use a 'curve' with n 20 to 24, noise 0.3 or more, and sweep degree from 1 (underfits) through 3 to 10-12 (overfits). With more points a high degree barely hurts test error. Facts by model: regression 'trainError', 'testError'; logistic and knn 'trainAccuracy', 'testAccuracy', 'misclassified'; logistic also 'loss'; kmeans 'loss'.

Facts for {fact:name}: trainError, testError, trainAccuracy, testAccuracy, misclassified, loss.
