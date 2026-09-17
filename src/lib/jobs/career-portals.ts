export type CareerPortal = {
  key: string;
  name: string;
  industry: string;
  url: string;
  status?: string;
  verifiedAt?: string | null;
  checkedAt?: string | null;
};

export function careerPortalStatus(portal: CareerPortal) {
  switch (portal.status) {
    case "active": return "入口可访问";
    case "seasonal": return "按招聘季开放";
    case "restricted": return "访问受限";
    case "unavailable": return "入口暂不可用";
    default: return "入口待核验";
  }
}

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
