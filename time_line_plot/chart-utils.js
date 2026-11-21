(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NeuralChartUtils = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // CSS reference pixel conversion: 96 px per inch / 2.54 cm per inch
  const CM_TO_PX = 96 / 2.54;

  function parseFiniteNumber(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : NaN;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") {
        return NaN;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : NaN;
    }
    return NaN;
  }

  function cmToPx(cm) {
    const value = parseFiniteNumber(cm);
    return Number.isFinite(value) ? value * CM_TO_PX : NaN;
  }

  function pxToCm(px) {
    const value = parseFiniteNumber(px);
    return Number.isFinite(value) ? value / CM_TO_PX : NaN;
  }

  /**
   * Validate canvas, margin, and axis-margin inputs (all in cm) and compute
   * consistent pixel layout geometry.
   *
   * Semantics:
   * - widthCm / heightCm represent the TOTAL physical SVG canvas size.
   * - plotWidth  = totalWidth  - margin.left - margin.right  - axisMargin.x
   * - plotHeight = totalHeight - margin.top  - margin.bottom - axisMargin.y
   * - Inside the margin group translate(margin.left, margin.top):
   *   - Y-axis sits at x = 0, spanning y in [0, plotHeight]
   *   - X-axis sits at y = plotHeight + axisMargin.y, spanning x in [axisMargin.x, axisMargin.x + plotWidth]
   *   - Data (CI area + line) spans x in [axisMargin.x, axisMargin.x + plotWidth], y in [0, plotHeight]
   *   This guarantees all elements stay strictly inside the SVG bounds without clipping.
   */
  function validateAndComputeLayout(config) {
    const errors = [];
    const safeConfig = config && typeof config === "object" ? config : {};
    const rawMargin = safeConfig.marginCm && typeof safeConfig.marginCm === "object" ? safeConfig.marginCm : {};
    const rawAxisMargin =
      safeConfig.axisMarginCm && typeof safeConfig.axisMarginCm === "object" ? safeConfig.axisMarginCm : {};

    const widthCm = parseFiniteNumber(safeConfig.widthCm);
    const heightCm = parseFiniteNumber(safeConfig.heightCm);
    const marginCm = {
      top: parseFiniteNumber(rawMargin.top),
      right: parseFiniteNumber(rawMargin.right),
      bottom: parseFiniteNumber(rawMargin.bottom),
      left: parseFiniteNumber(rawMargin.left),
    };
    const axisMarginCm = {
      x: parseFiniteNumber(rawAxisMargin.x),
      y: parseFiniteNumber(rawAxisMargin.y),
    };

    if (!Number.isFinite(widthCm) || widthCm <= 0) {
      errors.push("Canvas width (cm) must be a positive number.");
    }
    if (!Number.isFinite(heightCm) || heightCm <= 0) {
      errors.push("Canvas height (cm) must be a positive number.");
    }

    const marginLabels = [
      ["top", "Top margin (cm)"],
      ["right", "Right margin (cm)"],
      ["bottom", "Bottom margin (cm)"],
      ["left", "Left margin (cm)"],
    ];
    for (const [key, label] of marginLabels) {
      if (!Number.isFinite(marginCm[key]) || marginCm[key] < 0) {
        errors.push(`${label} must be a non-negative number.`);
      }
    }

    if (!Number.isFinite(axisMarginCm.x) || axisMarginCm.x < 0) {
      errors.push("X-axis margin (cm) must be a non-negative number.");
    }
    if (!Number.isFinite(axisMarginCm.y) || axisMarginCm.y < 0) {
      errors.push("Y-axis margin (cm) must be a non-negative number.");
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    const totalWidth = cmToPx(widthCm);
    const totalHeight = cmToPx(heightCm);
    const margin = {
      top: cmToPx(marginCm.top),
      right: cmToPx(marginCm.right),
      bottom: cmToPx(marginCm.bottom),
      left: cmToPx(marginCm.left),
    };
    const axisMargin = {
      x: cmToPx(axisMarginCm.x),
      y: cmToPx(axisMarginCm.y),
    };

    const innerWidth = totalWidth - margin.left - margin.right;
    const innerHeight = totalHeight - margin.top - margin.bottom;
    const plotWidth = innerWidth - axisMargin.x;
    const plotHeight = innerHeight - axisMargin.y;

    if (plotWidth <= 0) {
      errors.push(
        "Plot width must be positive: reduce left/right margins or X-axis margin, or increase canvas width."
      );
    }
    if (plotHeight <= 0) {
      errors.push(
        "Plot height must be positive: reduce top/bottom margins or Y-axis margin, or increase canvas height."
      );
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    return {
      ok: true,
      layout: {
        widthCm,
        heightCm,
        marginCm,
        axisMarginCm,
        totalWidth,
        totalHeight,
        innerWidth,
        innerHeight,
        plotWidth,
        plotHeight,
        margin,
        axisMargin,
        xAxisTransform: { x: axisMargin.x, y: plotHeight + axisMargin.y },
        yAxisTransform: { x: 0, y: 0 },
        dataOffset: { x: axisMargin.x, y: 0 },
      },
    };
  }

  function splitCsvLine(line) {
    const cells = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells;
  }

  function findColumnIndex(headers, exactName) {
    const exactIdx = headers.indexOf(exactName);
    if (exactIdx !== -1) {
      return exactIdx;
    }
    const lowerTarget = exactName.toLowerCase();
    return headers.findIndex((h) => h.toLowerCase() === lowerTarget);
  }

  /**
   * Parse CSV text into numeric time-series rows.
   * Requires 'x' and 'y' columns; optionally supports 'CI_left' and 'CI_right'.
   */
  function parseCsvText(csvText) {
    if (typeof csvText !== "string") {
      return {
        data: [],
        hasCI: false,
        totalRows: 0,
        validRows: 0,
        skippedRows: 0,
        error: "CSV input must be a string.",
      };
    }

    const cleaned = csvText.replace(/^\uFEFF/, "");
    const rawLines = cleaned.split(/\r?\n/).filter((line) => line.trim() !== "");

    if (rawLines.length === 0) {
      return {
        data: [],
        hasCI: false,
        totalRows: 0,
        validRows: 0,
        skippedRows: 0,
        error: "CSV content is empty.",
      };
    }

    const headers = splitCsvLine(rawLines[0]).map((h) => h.trim());
    const xIdx = findColumnIndex(headers, "x");
    const yIdx = findColumnIndex(headers, "y");
    const ciLeftIdx = findColumnIndex(headers, "CI_left");
    const ciRightIdx = findColumnIndex(headers, "CI_right");

    if (xIdx === -1 || yIdx === -1) {
      return {
        data: [],
        hasCI: false,
        totalRows: 0,
        validRows: 0,
        skippedRows: 0,
        error: "CSV header must contain 'x' and 'y' columns.",
      };
    }

    const data = [];
    let skippedRows = 0;
    let hasCI = false;
    const totalRows = rawLines.length - 1;

    for (let i = 1; i < rawLines.length; i += 1) {
      const cells = splitCsvLine(rawLines[i]);
      const x = parseFiniteNumber(cells[xIdx]);
      const y = parseFiniteNumber(cells[yIdx]);

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        skippedRows += 1;
        continue;
      }

      let ciLeft = null;
      let ciRight = null;
      let ciLow = null;
      let ciHigh = null;

      if (ciLeftIdx !== -1 && ciRightIdx !== -1) {
        const parsedLeft = parseFiniteNumber(cells[ciLeftIdx]);
        const parsedRight = parseFiniteNumber(cells[ciRightIdx]);
        if (Number.isFinite(parsedLeft) && Number.isFinite(parsedRight)) {
          ciLeft = parsedLeft;
          ciRight = parsedRight;
          ciLow = Math.min(parsedLeft, parsedRight);
          ciHigh = Math.max(parsedLeft, parsedRight);
          hasCI = true;
        }
      }

      data.push({
        x,
        y,
        CI_left: ciLeft,
        CI_right: ciRight,
        ciLow,
        ciHigh,
      });
    }

    data.sort((a, b) => a.x - b.x);

    return {
      data,
      hasCI,
      totalRows,
      validRows: data.length,
      skippedRows,
      error: data.length === 0 ? "No valid numeric (x, y) rows found in CSV." : null,
    };
  }

  /**
   * Compute adaptive X and Y axis domains from parsed data (including CI bounds).
   */
  function computeAxisDomains(data, options) {
    const opts = options && typeof options === "object" ? options : {};
    const yPaddingRatio =
      typeof opts.yPaddingRatio === "number" && Number.isFinite(opts.yPaddingRatio) && opts.yPaddingRatio >= 0
        ? opts.yPaddingRatio
        : 0.05;

    if (!Array.isArray(data) || data.length === 0) {
      return {
        xDomain: [0, 1],
        yDomain: [0, 1],
      };
    }

    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;

    for (const d of data) {
      if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.y)) {
        continue;
      }
      if (d.x < xMin) xMin = d.x;
      if (d.x > xMax) xMax = d.x;
      if (d.y < yMin) yMin = d.y;
      if (d.y > yMax) yMax = d.y;

      if (Number.isFinite(d.ciLow)) {
        if (d.ciLow < yMin) yMin = d.ciLow;
        if (d.ciLow > yMax) yMax = d.ciLow;
      }
      if (Number.isFinite(d.ciHigh)) {
        if (d.ciHigh < yMin) yMin = d.ciHigh;
        if (d.ciHigh > yMax) yMax = d.ciHigh;
      }
    }

    if (!Number.isFinite(xMin) || !Number.isFinite(yMin)) {
      return {
        xDomain: [0, 1],
        yDomain: [0, 1],
      };
    }

    let xDomain;
    if (xMin === xMax) {
      const pad = Math.abs(xMin) > 0 ? Math.abs(xMin) * 0.1 : 1;
      xDomain = [xMin - pad, xMax + pad];
    } else {
      xDomain = [xMin, xMax];
    }

    let yDomain;
    if (yMin === yMax) {
      const pad = Math.abs(yMin) > 0 ? Math.abs(yMin) * 0.1 : 1;
      yDomain = [yMin - pad, yMax + pad];
    } else {
      const yPad = (yMax - yMin) * yPaddingRatio;
      const lower = yMin >= 0 && yMin - yPad < 0 ? 0 : yMin - yPad;
      const upper = yMax + yPad;
      yDomain = [lower, upper];
    }

    return { xDomain, yDomain };
  }

  /**
   * Ensure serialized SVG markup carries valid XML header, xmlns, physical cm
   * width/height attributes, and viewBox for publication-ready vector export.
   */
  function prepareSvgForExport(svgMarkup, layout) {
    if (typeof svgMarkup !== "string" || !svgMarkup.includes("<svg")) {
      throw new Error("Invalid SVG markup.");
    }
    if (!layout || !Number.isFinite(layout.widthCm) || !Number.isFinite(layout.heightCm)) {
      throw new Error("Valid layout is required to prepare SVG for export.");
    }

    const viewBoxValue = `0 0 ${layout.totalWidth} ${layout.totalHeight}`;
    const updated = svgMarkup.replace(/<svg\b([^>]*)>/, function (_match, attrs) {
      let nextAttrs = attrs;

      const setOrReplaceAttr = function (attrName, attrValue) {
        const regex = new RegExp(`\\s${attrName}="[^"]*"`, "i");
        if (regex.test(nextAttrs)) {
          nextAttrs = nextAttrs.replace(regex, ` ${attrName}="${attrValue}"`);
        } else {
          nextAttrs += ` ${attrName}="${attrValue}"`;
        }
      };

      setOrReplaceAttr("xmlns", "http://www.w3.org/2000/svg");
      setOrReplaceAttr("width", `${layout.widthCm}cm`);
      setOrReplaceAttr("height", `${layout.heightCm}cm`);
      setOrReplaceAttr("viewBox", viewBoxValue);

      return `<svg${nextAttrs}>`;
    });

    if (updated.trimStart().startsWith("<?xml")) {
      return updated;
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n${updated}`;
  }

  /**
   * Built-in deterministic neural time-series sample data (100 timepoints with 95% CI)
   * used as offline fallback or quick demo dataset.
   */
  function getBuiltInSampleData() {
    const data = [];
    for (let i = 0; i < 100; i += 1) {
      const x = i + 1;
      const evokedPeak = 7.5 * Math.exp(-Math.pow((x - 32) / 11, 2));
      const rebound = -1.6 * Math.exp(-Math.pow((x - 58) / 14, 2));
      const oscillation = 0.65 * Math.sin(x * 0.28) * Math.exp(-x / 85);
      const y = Number((3.2 + evokedPeak + rebound + oscillation).toFixed(4));
      const halfWidth = Number((0.45 + 0.55 * Math.exp(-Math.pow((x - 32) / 16, 2)) + 0.1 * Math.abs(Math.cos(x * 0.15))).toFixed(4));
      const ciLow = Number((y - halfWidth).toFixed(4));
      const ciHigh = Number((y + halfWidth).toFixed(4));
      data.push({
        x,
        y,
        CI_left: ciLow,
        CI_right: ciHigh,
        ciLow,
        ciHigh,
      });
    }

    return {
      data,
      hasCI: true,
      totalRows: data.length,
      validRows: data.length,
      skippedRows: 0,
      error: null,
    };
  }

  return {
    CM_TO_PX,
    parseFiniteNumber,
    cmToPx,
    pxToCm,
    validateAndComputeLayout,
    splitCsvLine,
    parseCsvText,
    computeAxisDomains,
    prepareSvgForExport,
    getBuiltInSampleData,
  };
});
