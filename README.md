# neural_data_visualization

Publication-ready neural data visualization tools built with D3.js and physical centimeter (`cm`) sizing.

## Features (`time_line_plot`)

- **Consistent Physical Canvas Sizing (`cm`)**: `Width (cm)` and `Height (cm)` always represent the total SVG canvas size on both initial load and subsequent updates, with `plotWidth = totalWidth - margin.left - margin.right - axisMargin.x` and `plotHeight = totalHeight - margin.top - margin.bottom - axisMargin.y`.
- **Clip-Free Detached Axes (`axisMargin`)**: X/Y axes, confidence intervals, and curves stay strictly within the SVG viewport with configurable axis offsets.
- **Input Validation**: Rejects empty, non-numeric, negative, or margin-overflowing inputs with clear on-page error messages.
- **Data Caching & Offline Fallback**: Caches the active dataset so resizing or restyling never re-fetches remote CSVs; gracefully falls back to a built-in neural time-series dataset when offline.
- **Local CSV Import & Adaptive Axes**: Upload any local `.csv` file; supports both `x, y, CI_left, CI_right` and `x, y`-only formats, automatically adapting X/Y axis domains.
- **Publication Export & Customization**: Customize chart title, axis labels, line/CI colors, and line width; hover over the plot for exact value inspection; export vector **SVG** (preserving `xmlns`, `cm` dimensions, and `viewBox`) or high-resolution **PNG (3x)**.

## Quick Start

1. Open `time_line_plot/time_line_plot.html` directly in any modern browser, or serve the repository locally:
   ```bash
   python3 -m http.server 8000
   ```
   Then visit `http://localhost:8000/time_line_plot/time_line_plot.html`.

## CSV Format

Required columns: `x`, `y`  
Optional confidence interval columns: `CI_left`, `CI_right`

```csv
x,y,CI_left,CI_right
1,3.21,2.75,3.67
2,3.45,2.98,3.92
3,3.88,3.39,4.37
```

If `CI_left` / `CI_right` are omitted, the plot renders the main line only.

## Project Structure

- `time_line_plot/time_line_plot.html` — Standard HTML5 UI and responsive layout
- `time_line_plot/chart-utils.js` — Zero-dependency pure logic module (unit conversions, layout validation, CSV parsing, adaptive domains, SVG export attributes, built-in sample data) compatible with both browsers and Node.js
- `time_line_plot/chart.js` — D3.js rendering, caching, hover tooltips, file upload, and SVG/PNG export
- `tests/chart-utils.test.js` — Automated unit tests using `node --test`

## Running Tests

Requires Node.js 18+ (no external dependencies):

```bash
node --test
```
