// Lossless public transport. The hydrated API remains publicMarket.scopes and
// askingSold.cells; only repeated aggregate objects/period points get references.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RlpMarketWire=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const DIMS=['state','suburb','corridor','lga','estate','source','bandMin','bandMax'];
  const GEO=['state','suburb','corridor','lga','estate','source'];
  const ROWS=['corridors','lgas','estates','suburbs','topRate','bottomRate'];
  const keyOf=c=>JSON.stringify(DIMS.map(k=>k.startsWith('band')?null:c[k]??null));
  // Only a producer that has finished every mathematical/protected consumer
  // opts into consumption. The ordinary library API keeps its input unchanged.
  function createMarketPacker(){
    let metricKeys=null;
    const points=[],series=[],cohorts=[],scopeIndex={},seen=new WeakMap(),pointMap=new Map(),seriesMap=new Map(),cohortKey=Symbol('packed-market-cohort');
    const internPoint=p=>{const key=JSON.stringify(p);if(!pointMap.has(key)){pointMap.set(key,points.length);points.push(p);}return pointMap.get(key);};
    const internSeries=a=>{const refs=(a||[]).map(internPoint),key=JSON.stringify(refs);if(!seriesMap.has(key)){seriesMap.set(key,series.length);series.push(refs);}return seriesMap.get(key);};
    const packTS=ts=>({...ts,sold:internSeries(ts.sold),listed:internSeries(ts.listed),soldMonthly:internSeries(ts.soldMonthly),listedMonthly:internSeries(ts.listedMonthly),corridorSeries:Object.fromEntries(Object.entries(ts.corridorSeries||{}).map(([k,a])=>[k,internSeries(a)])),corridorMonthlySeries:Object.fromEntries(Object.entries(ts.corridorMonthlySeries||{}).map(([k,a])=>[k,internSeries(a)])),suburbSeries:Object.fromEntries(Object.entries(ts.suburbSeries||{}).map(([k,a])=>[k,internSeries(a)]))});
    const metric=o=>metricKeys.map(k=>o[k]??null);
    function aggregate(a){const out={...a,totals:metric(a.totals)};for(const key of ROWS)out[key]=(a[key]||[]).map(r=>[metric(r),Object.fromEntries(Object.entries(r).filter(([k])=>!metricKeys.includes(k)))]);return out;}
    function consumeScope(c){
      if(metricKeys===null)metricKeys=Object.keys(c.data?.totals||{});
      if(!seen.has(c.data)){const id=cohorts.length;seen.set(c.data,id);cohorts.push({views:Object.fromEntries(Object.entries(c.views).map(([v,a])=>[v,aggregate(a)])),capitalGrowth:c.capitalGrowth,movers:c.movers,ts:packTS(c.ts),regional:c.regional?{...c.regional,ts:packTS(c.regional.ts)}:null,benchmarks:c.benchmarks,scatterDensity:c.scatterDensity});}
      // Only these fields are used between mathematical assembly and transport:
      // benchmark compatibility and the later protected-movers projection.
      return {filters:c.filters,benchmarks:c.benchmarks,movers:c.movers,[cohortKey]:seen.get(c.data)};
    }
    function finish(market,globalTime,{consume=false}={}){
      for(const key of Object.keys(market.scopes)){
        const c=market.scopes[key],streamed=Object.prototype.hasOwnProperty.call(c,cohortKey),packed=streamed?c:consumeScope(c),id=packed[cohortKey];
        scopeIndex[key]=id;
        // Movers may be replaced with the locked marker after packing. Apply
        // that final producer decision to every already packed cohort too.
        if(streamed)cohorts[id].movers=c.movers;
        if(consume)delete market.scopes[key];
      }
      const packedTime=globalTime?{ts:packTS(globalTime.ts),stateTS:Object.fromEntries(Object.entries(globalTime.stateTS||{}).map(([s,ts])=>[s,packTS(ts)]))}:null;
      pointMap.clear();seriesMap.clear();
      return {version:1,metricKeys:metricKeys||[],points,series,cohorts,scopeIndex,globalTime:packedTime};
    }
    return {consumeScope,finish};
  }
  function packMarket(market,globalTime,options={}){
    return createMarketPacker().finish(market,globalTime,options);
  }
  function packComparisons(comparison,scopeIndex,{consume=false}={}){
    const owners=new Map(),groups=new Map();
    const cells=comparison.cells||[];
    for(let i=0;i<cells.length;i++){const c=cells[i],key=keyOf(c),id=scopeIndex[key];if(id==null)throw new Error('Comparison scope missing from exact public index');if(!owners.has(id))owners.set(id,key);if(owners.get(id)===key){if(!groups.has(id))groups.set(id,[]);groups.get(id).push(Object.fromEntries(Object.entries(c).filter(([k])=>!GEO.includes(k))));}if(consume)cells[i]=null;}
    if(consume)cells.length=0;
    return {version:1,groups:[...groups].map(([cohort,cells])=>({cohort,cells}))};
  }
  function hydrate(data,wire,comparisonWire){
    if(!wire||wire.version!==1)throw new Error('Unsupported canonical public wire version');
    const metrics=a=>Object.fromEntries(wire.metricKeys.map((k,i)=>[k,a[i]]));
    const arrays=wire.series.map(refs=>refs.map(id=>wire.points[id]));
    const unpackTS=ts=>({...ts,sold:arrays[ts.sold],listed:arrays[ts.listed],soldMonthly:arrays[ts.soldMonthly],listedMonthly:arrays[ts.listedMonthly],corridorSeries:Object.fromEntries(Object.entries(ts.corridorSeries||{}).map(([k,id])=>[k,arrays[id]])),corridorMonthlySeries:Object.fromEntries(Object.entries(ts.corridorMonthlySeries||{}).map(([k,id])=>[k,arrays[id]])),suburbSeries:Object.fromEntries(Object.entries(ts.suburbSeries||{}).map(([k,id])=>[k,arrays[id]]))});
    function aggregate(a){const out={...a,totals:metrics(a.totals)};for(const key of ROWS)out[key]=(a[key]||[]).map(([m,extra])=>({...metrics(m),...extra}));return out;}
    const cohorts=wire.cohorts.map(c=>{const views=Object.fromEntries(Object.entries(c.views).map(([v,a])=>[v,aggregate(a)]));return {...c,data:views.listing,views,ts:unpackTS(c.ts),regional:c.regional?{...c.regional,ts:unpackTS(c.regional.ts)}:null};});
    data.publicMarket.scopes=Object.fromEntries(Object.entries(wire.scopeIndex).map(([key,id])=>[key,{...cohorts[id],filters:Object.fromEntries(DIMS.map((k,i)=>[k,JSON.parse(key)[i]]))}]));
    if(wire.globalTime){data.ts=unpackTS(wire.globalTime.ts);data.stateTS=Object.fromEntries(Object.entries(wire.globalTime.stateTS).map(([s,ts])=>[s,unpackTS(ts)]));}
    if(comparisonWire){if(comparisonWire.version!==1)throw new Error('Unsupported comparison wire version');const groups=new Map(comparisonWire.groups.map(g=>[g.cohort,g.cells]));data.askingSold.cells=[];for(const [key,id] of Object.entries(wire.scopeIndex)){const filters=Object.fromEntries(DIMS.map((k,i)=>[k,JSON.parse(key)[i]]));for(const cell of groups.get(id)||[])data.askingSold.cells.push({...cell,...Object.fromEntries(GEO.map(k=>[k,filters[k]]))});}}
    return data;
  }
  function decodeArtifact(artifact){if(!Object.prototype.hasOwnProperty.call(artifact,'encoding'))return artifact;if(artifact.encoding!=='rlp-market-wire-v1')throw new Error('Unsupported canonical artifact encoding');return hydrate(artifact,artifact.marketWire,artifact.comparisonWire);}
  return {packMarket,packComparisons,hydrate,decodeArtifact,createMarketPacker};
});

window.RlpMarketWire.hydrate(window.__RLP_DATA__,window.__RLP_WIRE__,window.__RLP_COMPARE_WIRE__);delete window.__RLP_WIRE__;delete window.__RLP_COMPARE_WIRE__;
