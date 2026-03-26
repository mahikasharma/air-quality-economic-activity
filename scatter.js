// scatter.js
// D3 Scatter Plot: Total Energy Consumption vs CO2 Emissions
// Interactions: hover tooltip, click-to-filter region, brush selection
// Usage: call initScatter("#scatter-container") after DOM is ready
// Expects eia_data.csv in the same directory (or update CSV_PATH below)

const CSV_PATH = "eia_data.csv";

const REGION_MAP = {
  CT:"Northeast",ME:"Northeast",MA:"Northeast",NH:"Northeast",RI:"Northeast",
  VT:"Northeast",NJ:"Northeast",NY:"Northeast",PA:"Northeast",
  DE:"South",FL:"South",GA:"South",MD:"South",NC:"South",SC:"South",
  VA:"South",WV:"South",AL:"South",KY:"South",MS:"South",TN:"South",
  AR:"South",LA:"South",OK:"South",TX:"South",DC:"South",
  IL:"Midwest",IN:"Midwest",MI:"Midwest",OH:"Midwest",WI:"Midwest",
  IA:"Midwest",KS:"Midwest",MN:"Midwest",MO:"Midwest",NE:"Midwest",
  ND:"Midwest",SD:"Midwest",
  AZ:"West",CO:"West",ID:"West",MT:"West",NV:"West",NM:"West",
  UT:"West",WY:"West",AK:"West",CA:"West",HI:"West",OR:"West",WA:"West"
};

const REGION_COLORS = {
  Northeast: "#3b6ea5",
  South:     "#c0552a",
  Midwest:   "#4a9a6e",
  West:      "#8b5ea5"
};

// Which state abbreviations get a permanent label
const LABEL_STATES = new Set(["CA","TX","FL","NY","IN","WV","VT","OR","WA","ND","LA"]);

function getDominantSource(row) {
  const sources = {
    "Coal":        +row.Coal_Consumption        || 0,
    "Natural Gas": +row.NatGas_Consumption      || 0,
    "Nuclear":     +row.Nuclear_Consumption     || 0,
    "Renewables":  +row.Renewable_Consumption   || 0,
  };
  return Object.entries(sources).sort((a,b) => b[1]-a[1])[0][0];
}

function initScatter(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) { console.error("scatter: container not found:", containerSelector); return; }

  // ── Layout ────────────────────────────────────────────────────────────────
  const margin = { top: 20, right: 30, bottom: 60, left: 76 };
  const totalW  = container.clientWidth  || 860;
  const totalH  = Math.round(totalW * 0.56);
  const innerW  = totalW - margin.left - margin.right;
  const innerH  = totalH - margin.top  - margin.bottom;

  // ── DOM shell ────────────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="scatter-controls" id="scatter-legend"></div>
    <svg id="scatter-svg"
         width="${totalW}" height="${totalH}"
         viewBox="0 0 ${totalW} ${totalH}"
         style="display:block;max-width:100%"></svg>
    <div class="scatter-brush-info" id="scatter-brush-info">
      Drag on the chart to select a group of points
    </div>
  `;

  // ── Tooltip (appended to body so it floats above everything) ─────────────
  let ttEl = document.getElementById("scatter-tooltip");
  if (!ttEl) {
    ttEl = document.createElement("div");
    ttEl.id = "scatter-tooltip";
    ttEl.innerHTML = `
      <div class="stt-state"  id="stt-state"></div>
      <div class="stt-region" id="stt-region"></div>
      <div class="stt-row"><span class="stt-k">Year</span>        <span class="stt-v" id="stt-year"></span></div>
      <div class="stt-row"><span class="stt-k">Energy (B. Btu)</span><span class="stt-v" id="stt-energy"></span></div>
      <div class="stt-row"><span class="stt-k">CO₂ (Mil. Mt)</span><span class="stt-v" id="stt-co2"></span></div>
      <div class="stt-row"><span class="stt-k">Dom. Source</span>  <span class="stt-v" id="stt-source"></span></div>
    `;
    document.body.appendChild(ttEl);
  }

  const showTT = (event, d) => {
    document.getElementById("stt-state").textContent  = d.state;
    document.getElementById("stt-region").textContent = d.region;
    document.getElementById("stt-region").style.color = REGION_COLORS[d.region];
    document.getElementById("stt-year").textContent   = d.year;
    document.getElementById("stt-energy").textContent = d3.format(",")(Math.round(d.energy));
    document.getElementById("stt-co2").textContent    = d3.format(",")(Math.round(d.co2));
    document.getElementById("stt-source").textContent = d.source;

    const pad = 14, tw = 210, th = 120;
    let tx = event.clientX + pad;
    let ty = event.clientY - 60;
    if (tx + tw > window.innerWidth)  tx = event.clientX - tw - pad;
    if (ty + th > window.innerHeight) ty = window.innerHeight - th - 8;
    if (ty < 8) ty = 8;

    ttEl.style.left = tx + "px";
    ttEl.style.top  = ty + "px";
    ttEl.classList.add("visible");
  };
  const hideTT = () => ttEl.classList.remove("visible");

  // ── Load + process data ──────────────────────────────────────────────────
  d3.csv(CSV_PATH).then(raw => {

    const rows = raw
      .filter(d => +d.Year >= 1981 && d.State !== "US" && REGION_MAP[d.State])
      .map(d => ({
        state:  d.State,
        region: REGION_MAP[d.State],
        year:   d.Year,
        energy: +d.Total_Energy_Consumption,
        co2:    +d.CO2_Emissions,
        source: getDominantSource(d),
      }))
      .filter(d => isFinite(d.energy) && isFinite(d.co2));

    if (rows.length === 0) {
      container.innerHTML = `<p style="color:#c0552a;padding:16px">
        No data loaded. Check that <code>${CSV_PATH}</code> is in the same folder
        and has columns: State, Year, Total_Energy_Consumption, CO2_Emissions,
        Coal_Consumption, NatGas_Consumption, Nuclear_Consumption, Renewable_Consumption.
      </p>`;
      return;
    }

    renderChart(rows);

  }).catch(err => {
    console.error("scatter: CSV load failed", err);
    container.innerHTML = `<p style="color:#c0552a;padding:16px">
      Could not load <code>${CSV_PATH}</code>. Make sure it lives in the same directory
      as your HTML page.<br><small>${err}</small>
    </p>`;
  });

  // ── Render ───────────────────────────────────────────────────────────────
  function renderChart(rows) {
    const svg = d3.select("#scatter-svg");
    const g   = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear()
      .domain([0, d3.max(rows, d => d.energy) * 1.06]).nice()
      .range([0, innerW]);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(rows, d => d.co2) * 1.08]).nice()
      .range([innerH, 0]);

    const fmt = v => v >= 1000 ? (v/1000).toFixed(0)+"k" : v;

    // Grid
    g.append("g").attr("class","scatter-grid")
      .call(d3.axisLeft(yScale).tickSize(-innerW).tickFormat(""))
      .call(ax => ax.select(".domain").remove());

    g.append("g").attr("class","scatter-grid")
      .attr("transform",`translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).tickSize(-innerH).tickFormat(""))
      .call(ax => ax.select(".domain").remove());

    // Axes
    g.append("g").attr("class","scatter-axis")
      .attr("transform",`translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).ticks(7).tickFormat(fmt));

    g.append("g").attr("class","scatter-axis")
      .call(d3.axisLeft(yScale).ticks(6).tickFormat(fmt));

    // Axis labels
    svg.append("text").attr("class","scatter-axis-label")
      .attr("x", margin.left + innerW / 2).attr("y", totalH - 12)
      .attr("text-anchor","middle")
      .text("Total Energy Consumption (Billion Btu)");

    svg.append("text").attr("class","scatter-axis-label")
      .attr("transform","rotate(-90)")
      .attr("x", -(margin.top + innerH / 2)).attr("y", 16)
      .attr("text-anchor","middle")
      .text("CO₂ Emissions (Million Metric Tons)");

    // Dots layer (below brush so brush overlay stays on top)
    const dotsG = g.append("g").attr("class","scatter-dots");

    const dots = dotsG.selectAll("circle")
      .data(rows)
      .join("circle")
        .attr("cx", d => xScale(d.energy))
        .attr("cy", d => yScale(d.co2))
        .attr("r", 4.5)
        .attr("fill",         d => REGION_COLORS[d.region])
        .attr("fill-opacity", 0.72)
        .attr("stroke",       d => REGION_COLORS[d.region])
        .attr("stroke-width", 1)
        .attr("stroke-opacity", 0.4)
        .style("cursor","pointer");

    // State labels for key outliers
    g.append("g").attr("class","scatter-state-labels")
      .selectAll("text")
      .data(rows.filter(d => LABEL_STATES.has(d.state)))
      .join("text")
        .attr("class","scatter-state-text")
        .attr("x", d => xScale(d.energy) + 7)
        .attr("y", d => yScale(d.co2) + 4)
        .text(d => d.state);

    // ── State: active regions + brush ──────────────────────────────────────
    const regions = Object.keys(REGION_COLORS);
    let activeRegions = new Set(regions);
    let brushedStates = null; // Set of state strings, or null = no brush

    function applyVisibility() {
      dots.attr("opacity", d => {
        const rOk = activeRegions.has(d.region);
        const bOk = brushedStates === null || brushedStates.has(d.state + d.year);
        return (rOk && bOk) ? 1 : 0.07;
      });
    }

    // ── Legend / filter buttons ─────────────────────────────────────────────
    const legendEl = d3.select("#scatter-legend");

    legendEl.append("span").attr("class","scatter-legend-label").text("Filter:");

    regions.forEach(r => {
      const btn = legendEl.append("button")
        .attr("class","scatter-legend-btn scatter-legend-btn--active")
        .attr("data-region", r)
        .on("click", function() {
          const reg = this.dataset.region;
          if (activeRegions.has(reg)) {
            if (activeRegions.size === 1) return;
            activeRegions.delete(reg);
            d3.select(this)
              .classed("scatter-legend-btn--active", false)
              .classed("scatter-legend-btn--dimmed", true);
          } else {
            activeRegions.add(reg);
            d3.select(this)
              .classed("scatter-legend-btn--active", true)
              .classed("scatter-legend-btn--dimmed", false);
          }
          applyVisibility();
        });

      btn.append("span")
        .attr("class","scatter-swatch")
        .style("background", REGION_COLORS[r]);
      btn.append("span").text(r);
    });

    legendEl.append("button")
      .attr("class","scatter-reset-btn")
      .text("Reset")
      .on("click", () => {
        activeRegions = new Set(regions);
        brushedStates = null;
        d3.selectAll(".scatter-legend-btn")
          .classed("scatter-legend-btn--active", true)
          .classed("scatter-legend-btn--dimmed", false);
        brushLayer.call(brush.move, null);
        applyVisibility();
        setBrushInfo(null);
      });

    // ── Tooltip events ──────────────────────────────────────────────────────
    dots
      .on("mousemove", function(event, d) {
        if (!activeRegions.has(d.region)) return;
        if (brushedStates !== null && !brushedStates.has(d.state + d.year)) return;
        showTT(event, d);
      })
      .on("mouseleave", hideTT);

    // ── Brush ───────────────────────────────────────────────────────────────
    function setBrushInfo(selection) {
      const el = document.getElementById("scatter-brush-info");
      if (!selection) {
        brushedStates = null;
        el.innerHTML = "Drag on the chart to select a group of points";
        return;
      }
      const [[x0,y0],[x1,y1]] = selection;
      const sel = rows.filter(d => {
        const cx = xScale(d.energy), cy = yScale(d.co2);
        return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1
               && activeRegions.has(d.region);
      });
      if (sel.length === 0) {
        brushedStates = null;
        el.innerHTML = "No visible points in selection — try a different area";
      } else {
        brushedStates = new Set(sel.map(d => d.state + d.year));
        const avgE = d3.mean(sel, d => d.energy);
        const avgC = d3.mean(sel, d => d.co2);
        const states = [...new Set(sel.map(d => d.state))].sort();
        el.innerHTML =
          `<strong>${sel.length} data point${sel.length > 1 ? "s" : ""}</strong>` +
          ` (${states.length} state${states.length>1?"s":""}: ${states.join(", ")}) &nbsp;·&nbsp; ` +
          `Avg energy <strong>${d3.format(",.0f")(avgE)} B. Btu</strong> &nbsp;·&nbsp; ` +
          `Avg CO₂ <strong>${d3.format(",.0f")(avgC)} mil. Mt</strong>`;
      }
      applyVisibility();
    }

    const brush = d3.brush()
      .extent([[0,0],[innerW,innerH]])
      .on("brush",  ({selection}) => { if (selection) setBrushInfo(selection); })
      .on("end",    ({selection}) => { if (!selection) setBrushInfo(null); });

    const brushLayer = g.append("g").attr("class","scatter-brush").call(brush);

    brushLayer.select(".selection")
      .style("fill",         "rgba(59,110,165,0.08)")
      .style("stroke",       "#3b6ea5")
      .style("stroke-width", "1.5");

    // Make sure tooltip disappears on brush drag
    brushLayer.on("mousedown.tt", hideTT);

    // Initial state
    applyVisibility();
  } // end renderChart
} // end initScatter
