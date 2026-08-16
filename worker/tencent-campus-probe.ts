export {};

const pages = [
  "https://join.qq.com/",
  "https://join.qq.com/post_detail.html?postid=1282707375417304064",
];

async function main() {
  const results = [];
  for (const url of pages) {
    const response = await fetch(url, { headers: { "User-Agent": "ZhiTuTracker/0.2 (+official-career-index; public-pages-only)" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    const html = await response.text();
    results.push({
      url,
      status: response.status,
      finalUrl: response.url,
      bytes: html.length,
      title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim(),
      scripts: [...html.matchAll(/<script\b[^>]*src=["']([^"']+)/gi)].map((match) => new URL(match[1], response.url).toString()).slice(-20),
      apiHints: [...new Set([...html.matchAll(/["']([^"']*(?:api|post|position|recruit)[^"']*)["']/gi)].map((match) => match[1]).filter((value) => value.length < 300))].slice(0, 30),
      hydrationHints: ["__NEXT_DATA__", "__NUXT__", "postid", "postId"].filter((hint) => html.includes(hint)),
      htmlPreview: html.slice(0, 2600),
    });
  }
  const assetUrls = [
    "https://cdn.multilingualres.hr.tencent.com/joinqq/static2/js/p_zh-cn_index.build.js",
    "https://cdn.multilingualres.hr.tencent.com/joinqq/static2/js/p_zh-cn_post_detail.build.js",
  ];
  for (const url of assetUrls) {
    const response = await fetch(url, { headers: { Accept: "*/*", Referer: "https://join.qq.com/", "User-Agent": "Mozilla/5.0 (compatible; ZhiTuTracker/0.2; public-career-index)" }, signal: AbortSignal.timeout(20_000) });
    const source = await response.text();
    results.push({
      url,
      status: response.status,
      bytes: source.length,
      endpointHints: [...new Set([...source.matchAll(/["']([^"']*(?:api|post|position|recruit|query)[^"']*)["']/gi)].map((match) => match[1]).filter((value) => value.length < 400))].slice(0, 100),
    });
  }
  console.log(JSON.stringify(results, null, 2));
}

void main();
