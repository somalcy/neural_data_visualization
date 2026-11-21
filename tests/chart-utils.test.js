"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  CM_TO_PX,
  cmToPx,
  pxToCm,
  validateAndComputeLayout,
  parseCsvText,
  computeAxisDomains,
  prepareSvgForExport,
  getBuiltInSampleData,
} = require("../time_line_plot/chart-utils.js");

describe("cm <-> px conversions", () => {
  it("converts cm to px and back accurately", () => {
    assert.ok(Math.abs(CM_TO_PX - 96 / 2.54) < 1e-12);
    assert.ok(Math.abs(cmToPx(2.54) - 96) < 1e-10);
    assert.ok(Math.abs(pxToCm(96) - 2.54) < 1e-10);
  });

  it("returns NaN for empty or non-numeric inputs", () => {
    assert.ok(Number.isNaN(cmToPx("")));
    assert.ok(Number.isNaN(cmToPx("abc")));
    assert.ok(Number.isNaN(cmToPx(null)));
  });
});

describe("validateAndComputeLayout", () => {
  const baseConfig = {
    widthCm: 16.2,
    heightCm: 14.1,
    marginCm: { top: 1.5, right: 1, bottom: 1.8, left: 2 },
    axisMarginCm: { x: 0.5, y: 0.5 },
  };

  it("treats width/height consistently as total SVG canvas size and keeps all elements inside bounds", () => {
    const first = validateAndComputeLayout(baseConfig);
    const second = validateAndComputeLayout({ ...baseConfig });

    assert.equal(first.ok, true);
    assert.deepEqual(first.layout, second.layout);

    const { layout } = first;
    const expectedPlotWidth =
      layout.totalWidth - layout.margin.left - layout.margin.right - layout.axisMargin.x;
    const expectedPlotHeight =
      layout.totalHeight - layout.margin.top - layout.margin.bottom - layout.axisMargin.y;

    assert.ok(Math.abs(layout.plotWidth - expectedPlotWidth) < 1e-9);
    assert.ok(Math.abs(layout.plotHeight - expectedPlotHeight) < 1e-9);

    // Verify zero clipping in outer SVG coordinates
    const dataLeftSvg = layout.margin.left + layout.dataOffset.x;
    const dataRightSvg = dataLeftSvg + layout.plotWidth;
    const dataTopSvg = layout.margin.top + layout.dataOffset.y;
    const dataBottomSvg = dataTopSvg + layout.plotHeight;
    const xAxisYSvg = layout.margin.top + layout.xAxisTransform.y;

    assert.ok(dataLeftSvg >= layout.margin.left);
    assert.ok(Math.abs(dataRightSvg - (layout.totalWidth - layout.margin.right)) < 1e-9);
    assert.ok(dataTopSvg >= layout.margin.top);
    assert.ok(dataBottomSvg <= layout.totalHeight - layout.margin.bottom + 1e-9);
    assert.ok(Math.abs(xAxisYSvg - (layout.totalHeight - layout.margin.bottom)) < 1e-9);
  });

  it("handles zero axisMargin cleanly with axes meeting at (0, plotHeight)", () => {
    const result = validateAndComputeLayout({
      ...baseConfig,
      axisMarginCm: { x: 0, y: 0 },
    });
    assert.equal(result.ok, true);
    assert.equal(result.layout.xAxisTransform.x, 0);
    assert.equal(result.layout.xAxisTransform.y, result.layout.plotHeight);
    assert.equal(result.layout.dataOffset.x, 0);
    assert.equal(result.layout.dataOffset.y, 0);
  });

  it("rejects empty, NaN, negative, and zero canvas dimensions", () => {
    const res1 = validateAndComputeLayout({
      ...baseConfig,
      widthCm: "",
      heightCm: -5,
    });
    assert.equal(res1.ok, false);
    assert.ok(res1.errors.length >= 2);

    const res2 = validateAndComputeLayout({
      ...baseConfig,
      marginCm: { top: -1, right: 1, bottom: 1, left: 1 },
      axisMarginCm: { x: -0.2, y: 0.5 },
    });
    assert.equal(res2.ok, false);
    assert.ok(res2.errors.length >= 2);
  });

  it("rejects margins + axisMargin that exceed or equal canvas size", () => {
    const res = validateAndComputeLayout({
      widthCm: 4,
      heightCm: 4,
      marginCm: { top: 2, right: 2, bottom: 2, left: 2 },
      axisMarginCm: { x: 0.5, y: 0.5 },
    });
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => e.includes("Plot width must be positive")));
    assert.ok(res.errors.some((e) => e.includes("Plot height must be positive")));
  });
});

describe("parseCsvText", () => {
  it("parses numeric x, y, CI_left, CI_right and sorts by x", () => {
    const csv = [
      "x,y,CI_left,CI_right",
      "2,5.5,4.5,6.5",
      "1,3.0,3.8,2.2", // reversed CI order should still normalize ciLow <= ciHigh
    ].join("\n");

    const parsed = parseCsvText(csv);
    assert.equal(parsed.error, null);
    assert.equal(parsed.hasCI, true);
    assert.equal(parsed.validRows, 2);
    assert.equal(parsed.skippedRows, 0);
    assert.equal(parsed.data[0].x, 1);
    assert.equal(parsed.data[0].y, 3.0);
    assert.equal(parsed.data[0].ciLow, 2.2);
    assert.equal(parsed.data[0].ciHigh, 3.8);
    assert.equal(parsed.data[1].x, 2);
  });

  it("gracefully supports x, y only CSV without confidence intervals", () => {
    const csv = "x,y\r\n0,1.2\r\n10,2.4\r\n20,3.6\r\n";
    const parsed = parseCsvText(csv);
    assert.equal(parsed.error, null);
    assert.equal(parsed.hasCI, false);
    assert.equal(parsed.validRows, 3);
    assert.equal(parsed.data[0].ciLow, null);
    assert.equal(parsed.data[0].ciHigh, null);
  });

  it("filters out invalid rows and reports skipped count", () => {
    const csv = [
      "x,y,CI_left,CI_right",
      "1,2,1.5,2.5",
      "bad,3,2,4",
      "2,,1,3",
      "3,4,notnum,5",
    ].join("\n");

    const parsed = parseCsvText(csv);
    assert.equal(parsed.error, null);
    assert.equal(parsed.totalRows, 4);
    assert.equal(parsed.validRows, 2);
    assert.equal(parsed.skippedRows, 2);
    assert.equal(parsed.hasCI, true);
    assert.equal(parsed.data[1].ciLow, null);
  });

  it("returns error when required columns are missing or no valid rows exist", () => {
    const missingCols = parseCsvText("time,value\n1,2\n");
    assert.ok(missingCols.error);

    const noValid = parseCsvText("x,y\na,b\n");
    assert.ok(noValid.error);
  });
});

describe("computeAxisDomains", () => {
  it("computes adaptive X and Y domains including CI bounds", () => {
    const data = [
      { x: -50, y: 2, ciLow: 1, ciHigh: 3 },
      { x: 150, y: 10, ciLow: 8, ciHigh: 12 },
    ];
    const { xDomain, yDomain } = computeAxisDomains(data);
    assert.deepEqual(xDomain, [-50, 150]);
    assert.ok(yDomain[0] <= 1);
    assert.ok(yDomain[1] >= 12);
    assert.ok(yDomain[0] >= 0); // non-negative data clamped at 0
  });

  it("expands degenerate constant domains safely", () => {
    const data = [{ x: 5, y: 10, ciLow: null, ciHigh: null }];
    const { xDomain, yDomain } = computeAxisDomains(data);
    assert.ok(xDomain[0] < 5 && xDomain[1] > 5);
    assert.ok(yDomain[0] < 10 && yDomain[1] > 10);
  });
});

describe("prepareSvgForExport & built-in sample", () => {
  it("ensures XML declaration, xmlns, cm width/height, and viewBox on exported SVG", () => {
    const layoutRes = validateAndComputeLayout({
      widthCm: 16.2,
      heightCm: 14.1,
      marginCm: { top: 1.5, right: 1, bottom: 1.8, left: 2 },
      axisMarginCm: { x: 0.5, y: 0.5 },
    });
    assert.equal(layoutRes.ok, true);

    const exported = prepareSvgForExport('<svg width="100" height="100"><g></g></svg>', layoutRes.layout);
    assert.ok(exported.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(exported.includes('xmlns="http://www.w3.org/2000/svg"'));
    assert.ok(exported.includes('width="16.2cm"'));
    assert.ok(exported.includes('height="14.1cm"'));
    assert.ok(
      exported.includes(`viewBox="0 0 ${layoutRes.layout.totalWidth} ${layoutRes.layout.totalHeight}"`)
    );
  });

  it("provides valid deterministic built-in sample data for offline use", () => {
    const sample = getBuiltInSampleData();
    assert.equal(sample.error, null);
    assert.equal(sample.hasCI, true);
    assert.equal(sample.validRows, 100);
    assert.ok(sample.data.every((d) => Number.isFinite(d.x) && Number.isFinite(d.y) && d.ciLow <= d.y && d.y <= d.ciHigh));
  });
});
