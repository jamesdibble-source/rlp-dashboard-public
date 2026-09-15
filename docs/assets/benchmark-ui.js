/* Shared benchmark presentation; definitions live in retail-benchmark.js. */
let retailMaxArea = 1000, retailSizeBand = 'all';
let displayedRetailBenchmark = null;
function quoteLabel(l) {
  const q = l.quote;
  if (l.status === 'sold' || !q) return fmt(l.price);
  if (q.kind === 'unpriced') return 'POA';
  if (q.kind === 'ambiguous') return 'Price needs review';
  if (q.kind === 'indicative') return 'Indicative ' + fmt(q.value);
  if (q.kind === 'range') return fmt(q.low) + '–' + fmt(q.high);
  if (q.kind === 'lower_bound') return 'From ' + fmt(q.value);
  if (q.kind === 'upper_bound') return 'Up to ' + fmt(q.value);
  return fmt(q.value);
}
function retailOptions() {
  return RlpBenchmark.greenfieldOptions({ band: retailSizeBand, maxSize: retailMaxArea, asOf: R.built });
}
function downloadRetailBenchmark() {
  if (!displayedRetailBenchmark) return;
  const blob = new Blob([JSON.stringify(displayedRetailBenchmark, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'rlp-greenfield-comparables.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function retailBenchmarkPanel(lots, suburb, state) {
  const options = retailOptions();
  const summary = RlpBenchmark.summarize(lots, options);
  const projects = RlpBenchmark.projectSummaries(lots,options);
  const ids = new Set(summary.sampleIds);
  const included = lots.filter(l => ids.has(l.source_id || l.id));
  const compact = l => ({ id: l.source_id || l.id, address: l.address, project: l.comparability?.project || null,
    area: l.lot_size, quote: l.quote, cashRebate: l.cash_rebate || 0, quoteObservedAt: l.quote_observed_at,
    source: l.source_url, classification: l.comparability, assessment:l.assessment });
  displayedRetailBenchmark = { suburb, state, generatedAt: R.built,
    basis: 'Current advertised greenfield evidence; achieved prices and undisclosed site costs are not verified',
    options, summary, comparison800: RlpBenchmark.summarize(lots, { ...options, maxSize: Math.min(800, options.maxSize) }),
    comparables: included.map(compact), projects, inventoryAssessments:lots.map(compact) };
  const bands = [['Townhouse 180–300', 180, 300], ['Standard 280–450', 280, 450], ['Standard >450–700', 450.01, 700]];
  const rows = bands.map(([label, minSize, maxSize]) => {
    const b = RlpBenchmark.summarize(lots, { ...options, minSize, maxSize });
    return '<tr><td style="padding:8px">' + label + ' m²</td><td>' + b.sampleCount + '</td><td>' + fmt(b.meanPrice) + '</td><td>'
      + (b.meanSize ? b.meanSize.toFixed(1) + ' m²' : '—') + '</td><td>' + (b.aggregateRate ? '$' + Math.round(b.aggregateRate).toLocaleString() : '—') + '</td></tr>';
  }).join('');
  const limited = summary.sampleCount < options.minSample;
  return '<section class="v5-card" style="padding:20px;margin-bottom:24px" aria-label="Greenfield comparables">'
    + '<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center"><h2 style="font-size:16px;font-weight:700">Greenfield comparables</h2>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap"><label>Lot mix <select aria-label="Comparable lot mix" onchange="retailSizeBand=this.value;render()">'
    + [['all', 'All sizes'], ['townhouse', 'Townhouse'], ['standard', 'Standard density']].map(([value, label]) => '<option value="' + value + '"' + (retailSizeBand === value ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label>'
    + '<label>Upper limit <select aria-label="Comparable upper area limit" onchange="retailMaxArea=Number(this.value);render()"><option value="1000"' + (retailMaxArea === 1000 ? ' selected' : '') + '>1,000 m²</option><option value="800"' + (retailMaxArea === 800 ? ' selected' : '') + '>800 m²</option></select></label>'
    + '<button onclick="downloadRetailBenchmark()" style="border:1px solid var(--rule);padding:4px 8px">Export comparables</button></div></div>'
    + '<p style="font-size:12px;margin:12px 0">' + summary.sampleCount + ' qualifying priced lots from ' + summary.selectedCount + ' identified greenfield candidates in this size band. ' + summary.assessmentCount + ' of ' + summary.assessmentScopeCount + ' lots in the comparable area range assessed; ' + summary.pendingCount + ' awaiting checks; ' + summary.reviewCount + ' checked but requiring stronger project evidence.</p>'
    + (!summary.benchmarkReady && (summary.pendingCount || summary.reviewCount) ? '<p role="status" style="font-size:12px;color:#7c4951">Suburb benchmark withheld until outstanding assessments and project evidence are resolved. The individual listing evidence remains available in the export.</p>' : '')
    + (limited ? '<p role="status" style="font-size:12px;color:#7c4951">Insufficient comparable evidence for headline averages. At least five qualifying lots are required; this threshold is a display safeguard, not a valuation confidence rating.</p>' : '')
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin:16px 0">'
    + metric('Average lot price', fmt(summary.meanPrice), 'same qualifying lots')
    + metric('Average lot size', summary.meanSize ? summary.meanSize.toFixed(1) + ' m²' : '—', 'same qualifying lots')
    + metric('Aggregate $/m²', summary.aggregateRate ? '$' + Math.round(summary.aggregateRate).toLocaleString() : '—', 'total asking prices ÷ total lot area') + '</div>'
    + '<p style="font-size:11px;line-height:1.6">Advertised asks observed within 30 days; under-contract lots excluded. Price ranges use midpoints with bounds retained. Explicit cash rebates are deducted once. ' + summary.rangeCount + ' range quotes. Oldest qualifying quote: ' + attrEscape(summary.oldestQuote ? summary.oldestQuote.slice(0, 10) : 'unavailable') + '.</p>'
    + '<div style="overflow-x:auto"><table style="width:100%;font-size:11px;text-align:left;margin:12px 0"><thead><tr><th>Lot size mix</th><th>Lots</th><th>Average ask</th><th>Average area</th><th>Aggregate $/m²</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + (projects.length ? '<h3 style="font-size:13px;margin-top:16px">Checked lots by project</h3><p style="font-size:11px">These samples cover explicitly identified project members. They do not establish complete project inventory or a whole-suburb benchmark.</p><div style="overflow-x:auto"><table style="width:100%;font-size:11px;text-align:left;margin:12px 0"><thead><tr><th>Project</th><th>Priced lots</th><th>Average ask</th><th>Average area</th><th>Aggregate $/m²</th></tr></thead><tbody>' + projects.map(p=>'<tr><td style="padding:8px">'+attrEscape(p.project)+'</td><td>'+p.summary.sampleCount+'</td><td>'+fmt(p.summary.meanPrice)+'</td><td>'+(p.summary.meanSize ? p.summary.meanSize.toFixed(1)+' m²':'—')+'</td><td>'+(p.summary.aggregateRate ? '$'+Math.round(p.summary.aggregateRate).toLocaleString():'—')+'</td></tr>').join('')+'</tbody></table></div>' : '')
    + '<p style="font-size:11px;line-height:1.6">Includes explicit new-release or subdivision evidence, including verified membership of a currently advertised new estate. Other product types remain below for review. Advertising may omit slope, site costs or incentives. These are asking-price comparables, not verified achieved values. Townhouse and standard bands overlap at 280–300 m² and should not be added together.</p></section>';
}
