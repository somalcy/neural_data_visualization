(function () {
  "use strict";

  const utils = window.NeuralChartUtils;
  const REMOTE_SAMPLE_URL =
    "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/data_IC.csv";

  const state = {
    dataset: null,
    sourceLabel: "",
    requestToken: 0,
    lastLayout: null,
  };

  function getEl(id) {
    return document.getElementById(id);
  }

  function setDataStatus(message) {
    const el = getEl("data-status");
    if (el) {
      el.textContent = message;
    }
  }

  function setCanvasMeta(message) {
    const el = getEl("canvas-meta");
    if (el) {
      el.textContent = message;
    }
  }

  function showErrors(errors) {
    const banner = getEl("error-banner");
    if (!banner) return;

    if (!errors || errors.length === 0) {
      banner.classList.remove("visible");
      banner.innerHTML = "";
      return;
    }

    const listItems = errors
      .map(function (msg) {
        return `<li>${escapeHtml(msg)}</li>`;
      })
      .join("");
    banner.innerHTML = `<strong>Cannot render chart:</strong><ul>${listItems}</ul>`;
    banner.classList.add("visible");
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readControls() {
    return {
      widthCm: getEl("width").value,
      heightCm: getEl("height").value,
      marginCm: {
        top: getEl("margin-top").value,
        right: getEl("margin-right").value,
        bottom: getEl("margin-bottom").value,
        left: getEl("margin-left").value,
      },
      axisMarginCm: {
        x: getEl("axis-margin-x").value,
        y: getEl("axis-margin-y").value,
      },
      title: getEl("chart-title").value.trim(),
      xLabel: getEl("x-label").value.trim(),
      yLabel: getEl("y-label").value.trim(),
      lineColor: getEl("line-color").value || "#4682b4",
      ciColor: getEl("ci-color").value || "#cce5df",
      lineWidth: utils.parseFiniteNumber(getEl("line-width").value),
    };
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) return "—";
    return Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)
      ? value.toExponential(2)
      : Number(value.toFixed(3)).toString();
  }

  function formatDatasetSummary(dataset, sourceLabel) {
    const ciText = dataset.hasCI ? "with CI" : "line only (no CI)";
    const skippedText = dataset.skippedRows > 0 ? `, ${dataset.skippedRows} invalid row(s) skipped` : "";
    return `${sourceLabel}: ${dataset.validRows} points (${ciText}${skippedText})`;
  }

  function renderChart() {
    if (!state.dataset || state.dataset.data.length === 0) {
      return;
    }

    const controls = readControls();
    const layoutResult = utils.validateAndComputeLayout(controls);
    const errors = layoutResult.ok ? [] : layoutResult.errors.slice();

    if (!Number.isFinite(controls.lineWidth) || controls.lineWidth <= 0) {
      errors.push("Line width (px) must be a positive number.");
    }

    if (errors.length > 0) {
      showErrors(errors);
      return;
    }

    showErrors([]);
    const layout = layoutResult.layout;
    state.lastLayout = layout;

    const container = getEl("my_dataviz");
    container.dataset.width = String(layout.widthCm);
    container.dataset.height = String(layout.heightCm);

    const data = state.dataset.data;
    const domains = utils.computeAxisDomains(data);

    d3.select("#my_dataviz").html("");

    const svg = d3
      .select("#my_dataviz")
      .append("svg")
      .attr("xmlns", "http://www.w3.org/2000/svg")
      .attr("width", `${layout.widthCm}cm`)
      .attr("height", `${layout.heightCm}cm`)
      .attr("viewBox", `0 0 ${layout.totalWidth} ${layout.totalHeight}`)
      .style("font-family", "Arial, Helvetica, sans-serif");

    // Clean white background for publication-ready SVG & PNG export
    svg
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", layout.totalWidth)
      .attr("height", layout.totalHeight)
      .attr("fill", "#ffffff");

    const rootGroup = svg
      .append("g")
      .attr("transform", `translate(${layout.margin.left},${layout.margin.top})`);

    // Scales strictly bounded within [0, plotWidth] and [plotHeight, 0]
    const x = d3.scaleLinear().domain(domains.xDomain).range([0, layout.plotWidth]);
    const y = d3.scaleLinear().domain(domains.yDomain).range([layout.plotHeight, 0]);

    // X-axis positioned at (axisMargin.x, plotHeight + axisMargin.y)
    rootGroup
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(${layout.xAxisTransform.x}, ${layout.xAxisTransform.y})`)
      .call(d3.axisBottom(x));

    // Y-axis positioned at (0, 0)
    rootGroup
      .append("g")
      .attr("class", "y-axis")
      .attr("transform", `translate(${layout.yAxisTransform.x}, ${layout.yAxisTransform.y})`)
      .call(d3.axisLeft(y));

    // Confidence interval band (when available)
    if (state.dataset.hasCI) {
      const areaGenerator = d3
        .area()
        .defined(function (d) {
          return Number.isFinite(d.ciLow) && Number.isFinite(d.ciHigh);
        })
        .x(function (d) {
          return x(d.x) + layout.dataOffset.x;
        })
        .y0(function (d) {
          return y(d.ciLow) + layout.dataOffset.y;
        })
        .y1(function (d) {
          return y(d.ciHigh) + layout.dataOffset.y;
        });

      rootGroup
        .append("path")
        .datum(data)
        .attr("class", "ci-area")
        .attr("fill", controls.ciColor)
        .attr("fill-opacity", 0.75)
        .attr("stroke", "none")
        .attr("d", areaGenerator);
    }

    // Main time-series line
    const lineGenerator = d3
      .line()
      .x(function (d) {
        return x(d.x) + layout.dataOffset.x;
      })
      .y(function (d) {
        return y(d.y) + layout.dataOffset.y;
      });

    rootGroup
      .append("path")
      .datum(data)
      .attr("class", "series-line")
      .attr("fill", "none")
      .attr("stroke", controls.lineColor)
      .attr("stroke-width", controls.lineWidth)
      .attr("d", lineGenerator);

    // Chart title
    if (controls.title) {
      rootGroup
        .append("text")
        .attr("class", "chart-title")
        .attr("x", layout.dataOffset.x + layout.plotWidth / 2)
        .attr("y", -Math.max(10, Math.min(layout.margin.top * 0.45, 24)))
        .attr("text-anchor", "middle")
        .attr("font-size", "14px")
        .attr("font-weight", "600")
        .attr("fill", "#111827")
        .text(controls.title);
    }

    // X-axis label
    if (controls.xLabel) {
      const xLabelOffset = Math.min(Math.max(32, layout.margin.bottom * 0.65), layout.margin.bottom - 4);
      rootGroup
        .append("text")
        .attr("class", "x-axis-label")
        .attr("x", layout.dataOffset.x + layout.plotWidth / 2)
        .attr("y", layout.xAxisTransform.y + Math.max(24, xLabelOffset))
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("fill", "#374151")
        .text(controls.xLabel);
    }

    // Y-axis label
    if (controls.yLabel) {
      const yLabelOffset = Math.min(Math.max(38, layout.margin.left * 0.65), layout.margin.left - 8);
      rootGroup
        .append("text")
        .attr("class", "y-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -(layout.plotHeight / 2))
        .attr("y", -Math.max(28, yLabelOffset))
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("fill", "#374151")
        .text(controls.yLabel);
    }

    // Interactive hover guide + tooltip
    attachHoverInteraction(rootGroup, data, x, y, layout, controls.lineColor);

    setCanvasMeta(
      `Canvas: ${layout.widthCm} × ${layout.heightCm} cm | Plot area: ${utils.pxToCm(layout.plotWidth).toFixed(2)} × ${utils.pxToCm(layout.plotHeight).toFixed(2)} cm`
    );
  }

  function attachHoverInteraction(rootGroup, data, xScale, yScale, layout, lineColor) {
    const tooltip = getEl("chart-tooltip");
    if (!tooltip || data.length === 0) return;

    const focusGroup = rootGroup
      .append("g")
      .attr("class", "interactive-overlay")
      .style("display", "none");

    const guideLine = focusGroup
      .append("line")
      .attr("y1", 0)
      .attr("y2", layout.plotHeight)
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3");

    const focusDot = focusGroup
      .append("circle")
      .attr("r", 4)
      .attr("fill", lineColor)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.5);

    const bisectX = d3.bisector(function (d) {
      return d.x;
    }).left;

    rootGroup
      .append("rect")
      .attr("class", "interactive-overlay")
      .attr("x", layout.dataOffset.x)
      .attr("y", 0)
      .attr("width", layout.plotWidth)
      .attr("height", layout.plotHeight)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .on("mouseenter", function () {
        focusGroup.style("display", null);
        tooltip.style.opacity = "1";
      })
      .on("mouseleave", function () {
        focusGroup.style("display", "none");
        tooltip.style.opacity = "0";
      })
      .on("mousemove", function (event) {
        const pointer = d3.pointer(event, this);
        const mousePlotX = Math.max(0, Math.min(layout.plotWidth, pointer[0] - layout.dataOffset.x));
        const xValue = xScale.invert(mousePlotX);
        const idx = bisectX(data, xValue, 1);
        const d0 = data[idx - 1];
        const d1 = data[idx];
        let nearest = d0;
        if (d1 && Math.abs(xValue - d1.x) < Math.abs(xValue - d0.x)) {
          nearest = d1;
        }

        const cx = xScale(nearest.x) + layout.dataOffset.x;
        const cy = yScale(nearest.y) + layout.dataOffset.y;

        guideLine.attr("x1", cx).attr("x2", cx);
        focusDot.attr("cx", cx).attr("cy", cy);

        const ciLine =
          Number.isFinite(nearest.ciLow) && Number.isFinite(nearest.ciHigh)
            ? `<br>CI: [${formatNumber(nearest.ciLow)}, ${formatNumber(nearest.ciHigh)}]`
            : "";
        tooltip.innerHTML = `<strong>x:</strong> ${formatNumber(nearest.x)}<br><strong>y:</strong> ${formatNumber(nearest.y)}${ciLine}`;
        tooltip.style.left = `${event.clientX + 14}px`;
        tooltip.style.top = `${event.clientY - 12}px`;
      });
  }

  function applyDataset(dataset, sourceLabel) {
    if (dataset.error) {
      showErrors([dataset.error]);
      return false;
    }
    state.dataset = dataset;
    state.sourceLabel = sourceLabel;
    setDataStatus(formatDatasetSummary(dataset, sourceLabel));
    renderChart();
    return true;
  }

  function useBuiltInSample(reasonPrefix) {
    state.requestToken += 1;
    const sample = utils.getBuiltInSampleData();
    const label = reasonPrefix ? `${reasonPrefix} — Built-in sample` : "Built-in sample";
    applyDataset(sample, label);
  }

  async function loadRemoteSample() {
    const token = ++state.requestToken;
    setDataStatus("Loading remote sample CSV…");

    try {
      const response = await fetch(REMOTE_SAMPLE_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const csvText = await response.text();
      if (token !== state.requestToken) {
        return; // Superseded by a newer load or local file upload
      }
      const parsed = utils.parseCsvText(csvText);
      if (parsed.error) {
        throw new Error(parsed.error);
      }
      applyDataset(parsed, "Remote sample (data_IC.csv)");
    } catch (err) {
      if (token !== state.requestToken) {
        return;
      }
      useBuiltInSample(`Remote sample unavailable (${err.message})`);
    }
  }

  function handleFileUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const token = ++state.requestToken;
    const reader = new FileReader();
    reader.onload = function (loadEvent) {
      if (token !== state.requestToken) return;
      const csvText = String(loadEvent.target.result || "");
      const parsed = utils.parseCsvText(csvText);
      if (parsed.error) {
        showErrors([`Failed to load "${file.name}": ${parsed.error}`]);
        return;
      }
      applyDataset(parsed, `Local file (${file.name})`);
    };
    reader.onerror = function () {
      if (token !== state.requestToken) return;
      showErrors([`Failed to read file "${file.name}".`]);
    };
    reader.readAsText(file);
  }

  function getExportableSvgString() {
    const svgEl = document.querySelector("#my_dataviz svg");
    if (!svgEl || !state.lastLayout) {
      showErrors(["No rendered chart available to export."]);
      return null;
    }

    const cloned = svgEl.cloneNode(true);
    cloned.querySelectorAll(".interactive-overlay").forEach(function (node) {
      node.remove();
    });

    const serializer = new XMLSerializer();
    const rawMarkup = serializer.serializeToString(cloned);
    return utils.prepareSvgForExport(rawMarkup, state.lastLayout);
  }

  function triggerDownload(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function exportSvg() {
    const svgString = getExportableSvgString();
    if (!svgString) return;

    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, "neural-time-series.svg");
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function exportPng() {
    const svgString = getExportableSvgString();
    if (!svgString || !state.lastLayout) return;

    const scale = 3; // High-resolution 3x (~288 DPI)
    const widthPx = Math.ceil(state.lastLayout.totalWidth * scale);
    const heightPx = Math.ceil(state.lastLayout.totalHeight * scale);

    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = function () {
      const canvas = document.createElement("canvas");
      canvas.width = widthPx;
      canvas.height = heightPx;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, widthPx, heightPx);
      ctx.drawImage(img, 0, 0, widthPx, heightPx);
      URL.revokeObjectURL(svgUrl);

      canvas.toBlob(function (pngBlob) {
        if (!pngBlob) {
          showErrors(["Failed to generate PNG image."]);
          return;
        }
        const pngUrl = URL.createObjectURL(pngBlob);
        triggerDownload(pngUrl, "neural-time-series.png");
        setTimeout(function () {
          URL.revokeObjectURL(pngUrl);
        }, 1000);
      }, "image/png");
    };

    img.onerror = function () {
      URL.revokeObjectURL(svgUrl);
      showErrors(["Failed to rasterize SVG into PNG."]);
    };

    img.src = svgUrl;
  }

  function bindEvents() {
    getEl("update").addEventListener("click", renderChart);
    getEl("csv-file").addEventListener("change", handleFileUpload);
    getEl("load-remote-sample").addEventListener("click", loadRemoteSample);
    getEl("load-builtin-sample").addEventListener("click", function () {
      useBuiltInSample("");
    });
    getEl("export-svg").addEventListener("click", exportSvg);
    getEl("export-png").addEventListener("click", exportPng);

    // Live redraw on label & styling changes (uses cached dataset, zero network calls)
    ["chart-title", "x-label", "y-label", "line-color", "ci-color", "line-width"].forEach(function (id) {
      getEl(id).addEventListener("input", renderChart);
    });

    // Support pressing Enter in dimension inputs to apply immediately
    [
      "width",
      "height",
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
      "axis-margin-x",
      "axis-margin-y",
    ].forEach(function (id) {
      getEl(id).addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          renderChart();
        }
      });
    });
  }

  bindEvents();
  loadRemoteSample();
})();
