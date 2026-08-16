export {};

const targets = [
  {
    name: "腾讯职位查询",
    url: "https://careers.tencent.com/tencentcareer/api/post/Query?timestamp=0&countryId=&cityId=&bgIds=&productId=&categoryId=&parentCategoryId=&attrId=&keyword=&pageIndex=1&pageSize=10&language=zh-cn&area=cn",
  },
  { name: "京东职位列表", url: "https://zhaopin.jd.com/web/job/job_info_list/3" },
  { name: "百度校园招聘", url: "https://talent.baidu.com/jobs/campus" },
  { name: "百度实习招聘", url: "https://talent.baidu.com/jobs/intern" },
  ...Array.from({ length: 10 }, (_, index) => ({
    name: `腾讯职位属性 ${index + 1}`,
    url: `https://careers.tencent.com/tencentcareer/api/post/Query?timestamp=0&countryId=&cityId=&bgIds=&productId=&categoryId=&parentCategoryId=&attrId=${index + 1}&keyword=&pageIndex=1&pageSize=1&language=zh-cn&area=cn`,
  })),
  ...[1, 2, 3].map((portalType) => ({
    name: `字节跳动职位 portal_type=${portalType}`,
    url: "https://jobs.bytedance.com/api/v1/search/job/posts",
    method: "POST",
    body: JSON.stringify({ job_category_id_list: [], keyword: "", limit: 10, location_code_list: [], offset: 0, portal_type: portalType, portal_entrance: 1, job_function_id_list: [], job_type_id_list: [], storefront_id_list: [] }),
  })),
] as const;

async function main() {
  const results = [];
  for (const target of targets) {
    try {
      const response = await fetch(target.url, { method: "method" in target ? target.method : "GET", body: "body" in target ? target.body : undefined, headers: { Accept: "application/json,text/plain,*/*", "Content-Type": "application/json", "User-Agent": "ZhiTuTracker/0.2 (+official-career-index; public-pages-only)" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
      const text = await response.text();
      let shape: unknown;
      try {
        const value = JSON.parse(text);
        const object = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
        const data = object?.Data && typeof object.Data === "object" ? object.Data as Record<string, unknown> : null;
        shape = Array.isArray(value) ? { type: "array", length: value.length } : { keys: Object.keys(object || {}).slice(0, 20), count: data?.Count, preview: JSON.stringify(value).slice(0, 1200) };
      } catch {
        shape = { preview: text.slice(0, 1200) };
      }
      results.push({ name: target.name, status: response.status, finalUrl: response.url, contentType: response.headers.get("content-type"), bytes: text.length, shape });
    } catch (error) {
      results.push({ name: target.name, error: error instanceof Error ? error.message : "unknown error" });
    }
  }
  console.log(JSON.stringify(results, null, 2));
}

void main();
