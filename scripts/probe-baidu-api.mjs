const base = "https://talent-offical-static-prod.cdn.bcebos.com/hcm-recruitment/talent-offical-static-prod/client/static/js/";
const files = [
  "Page.624f3ac0.chunk.js", "vendor.4ee190a7.chunk.js", "vendor-three.879779bb.chunk.js",
  "3085675597715898.f290a054.chunk.js", "detail.89c7486d.chunk.js", "2170201793889352.c032d055.chunk.js",
  "center.fbe19b27.chunk.js", "index-fetch.616863ad.chunk.js", "404.38e15ebe.chunk.js", "404-fetch.bae47810.chunk.js",
  "activity-detail.190ca213.chunk.js", "ai-assistant.fb7a045c.chunk.js", "batch-share.475b0c7c.chunk.js",
  "detail-fetch.7908b224.chunk.js", "index.33ceac81.chunk.js", "life.6f4a2e8f.chunk.js",
  "list.39e61a85.chunk.js", "list-fetch.b47b2cf5.chunk.js",
  "resume.80575400.chunk.js", "resume-view.62708e83.chunk.js", "social.08a4b8ac.chunk.js", "trend.5b1e8b52.chunk.js",
  "24.e4f85536.chunk.js", "25.f85b0496.chunk.js", "26.250e2706.chunk.js", "27.8782b3f2.chunk.js",
  "28.4ba49024.chunk.js", "29.631f06e0.chunk.js", "30.bcf50b26.chunk.js", "31.5d0386ea.chunk.js",
  "32.ebcdf3bb.chunk.js", "33.6946071b.chunk.js", "34.9e913f4e.chunk.js", "35.6171a150.chunk.js",
  "36.8195cf71.chunk.js", "37.f366871f.chunk.js",
];

for (const file of files) {
  const response = await fetch(base + file);
  if (!response.ok) continue;
  const text = await response.text();
  const paths = [...text.matchAll(/["'](\/(?:api|httservice)[^"']+)["']/gi)].map((match) => match[1]);
  const modulePosition = text.search(/(?:^|[,])1316\s*:/);
  const requestModulePosition = text.search(/(?:^|[,])69\s*:/);
  if (paths.length || modulePosition >= 0 || requestModulePosition >= 0) {
    console.log(JSON.stringify({ file, modulePosition, requestModulePosition, paths: [...new Set(paths)] }));
    if (modulePosition >= 0) console.log(text.slice(modulePosition, modulePosition + 4_000));
    if (requestModulePosition >= 0) console.log(text.slice(requestModulePosition, requestModulePosition + 8_000));
  }
}
