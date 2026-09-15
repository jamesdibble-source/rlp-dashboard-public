(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RlpBenchmark = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const VERSION = '2026-09-15.1';
  const CURRENT = new Set(['listing', 'under_contract', 'contact_agent']);
  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  function priceOf(lot) {
    if (lot.quote && ['unpriced', 'indicative'].includes(lot.quote.kind)) return null;
    const gross = Number(lot.quote ? lot.quote.value : lot.price);
    if (!(gross > 0)) return null;
    // Only cash price reductions count. Deposit requirements are not rebates.
    const rebate = Number(lot.cash_rebate || 0);
    return rebate > 0 && rebate < gross ? gross - rebate : gross;
  }
  function rateOf(lot) {
    const price = priceOf(lot), size = Number(lot.lot_size);
    return price > 0 && size > 0 ? price / size : null;
  }
  function isUsableCurrent(lot, { minSize = 100, maxSize = 2000 } = {}) {
    const price = priceOf(lot), rate = rateOf(lot), area = Number(lot.lot_size);
    return CURRENT.has(lot.status) && area >= minSize && area <= maxSize
      && price > 0 && price < 5000000 && rate > 0 && rate < 5000
      && !lot.is_outlier && !['EXCLUDED', 'REVIEW_HARD', 'FLAGGED'].includes(lot.qa_status) && lot.house_land_flag !== 'high';
  }
  function summarize(input, options = {}) {
    const minSize = options.minSize ?? 100;
    const maxSize = options.maxSize ?? 2000;
    const minSample = options.minSample ?? 5;
    const asOf = new Date(options.asOf || Date.now()).getTime();
    const maxAgeDays = options.maxAgeDays ?? 30;
    const current = input.filter(l => CURRENT.has(l.status));
    const selected = current.filter(l => Number(l.lot_size) >= minSize && Number(l.lot_size) <= maxSize
      && (!options.greenfieldOnly || (l.comparability && l.comparability.category === 'greenfield'))
      && (!options.availableOnly || l.status === 'listing' || l.status === 'contact_agent'));
    const rows = selected.filter(l => {
      if (!isUsableCurrent(l, {minSize, maxSize})) return false;
      if (options.exactOrRangeOnly && (!l.quote || !['exact', 'range'].includes(l.quote.kind))) return false;
      if (options.requireQuoteDate) {
        const date = Date.parse(l.quote_observed_at || '');
        if (!Number.isFinite(date) || !Number.isFinite(asOf) || date > asOf || asOf - date > maxAgeDays * 86400000) return false;
      }
      return true;
    });
    const prices = rows.map(priceOf), areas = rows.map(l => Number(l.lot_size)), rates = rows.map(rateOf);
    const sum = values => values.reduce((a, b) => a + b, 0);
    const enough = rows.length >= minSample;
    const quoteDates = rows.map(l => l.quote_observed_at).filter(Boolean).sort();
    return {
      version: VERSION, minSize, maxSize, minSample, currentCount: current.length,
      selectedCount: selected.length, sampleCount: rows.length,
      unclassifiedCount: current.filter(l => !l.comparability || l.comparability.category === 'unclassified').length,
      pricedCoverage: selected.length ? rows.length / selected.length : null,
      rangeCount: rows.filter(l => l.quote && l.quote.kind === 'range').length,
      qualifiedCount: rows.filter(l => l.quote && !['exact', 'range'].includes(l.quote.kind)).length,
      status: enough ? 'sample_available' : rows.length ? 'limited_sample' : 'no_comparables',
      oldestQuote: quoteDates[0] || null, newestQuote: quoteDates[quoteDates.length - 1] || null,
      priceLow: enough ? median(rows.map(l => l.quote?.low > 0 ? l.quote.low - (l.cash_rebate || 0) : priceOf(l))) : null,
      priceHigh: enough ? median(rows.map(l => l.quote?.high > 0 ? l.quote.high - (l.cash_rebate || 0) : priceOf(l))) : null,
      minArea: enough ? Math.min(...areas) : null, maxArea: enough ? Math.max(...areas) : null,
      medianPrice: enough ? median(prices) : null,
      medianSize: enough ? median(areas) : null,
      medianRate: enough ? median(rates) : null,
      meanPrice: enough ? sum(prices) / rows.length : null,
      meanSize: enough ? sum(areas) / rows.length : null,
      aggregateRate: enough ? sum(prices) / sum(areas) : null,
      sampleIds: rows.map(l => l.source_id || l.id),
    };
  }
  function greenfieldOptions({ band = 'all', maxSize = 1000, asOf } = {}) {
    const bounds = { all: [180, maxSize], townhouse: [180, 300], standard: [280, 700] }[band] || [180, maxSize];
    return { minSize: bounds[0], maxSize: Math.min(bounds[1], maxSize), minSample: 5, greenfieldOnly: true,
      availableOnly: true, exactOrRangeOnly: true, requireQuoteDate: true, maxAgeDays: 30, asOf };
  }
  return { VERSION, median, priceOf, rateOf, isUsableCurrent, summarize, greenfieldOptions };
});
