export type CareerPortal = {
  key: string;
  name: string;
  industry: string;
  url: string;
};

export function filterCareerPortals(portals: CareerPortal[], query: string, industry: string) {
  const keyword = query.trim().toLocaleLowerCase("zh-CN");
  return portals.filter((portal) => {
    const matchesKeyword = !keyword || `${portal.name} ${portal.industry}`.toLocaleLowerCase("zh-CN").includes(keyword);
    return matchesKeyword && (industry === "全部行业" || portal.industry === industry);
  });
}

export function careerPortalIndustries(portals: CareerPortal[]) {
  return [...new Set(portals.map((portal) => portal.industry).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));
}
