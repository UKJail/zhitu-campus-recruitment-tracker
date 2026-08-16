export type RoleDirectionOption = {
  label: string;
  aliases: string[];
};

export const ROLE_DIRECTION_OPTIONS: RoleDirectionOption[] = [
  { label: "技术研发", aliases: ["工程师", "软件", "开发", "后端", "前端", "客户端", "算法", "测试开发", "运维", "嵌入式", "java", "c++", "人工智能", "ai", "网络安全", "研发"] },
  { label: "产品", aliases: ["产品经理", "产品策划", "产品运营", "用户研究", "产品助理", "产品"] },
  { label: "数据分析", aliases: ["数据分析", "商业分析", "业务分析", "经营分析", "数据科学", "数据运营", "数据产品", "bi", "建模", "数据治理"] },
  { label: "运营", aliases: ["运营", "内容运营", "用户运营", "社群", "新媒体", "电商运营", "活动运营", "平台运营"] },
  { label: "市场品牌", aliases: ["市场", "品牌", "营销", "公关", "广告", "媒介", "推广", "市场策划"] },
  { label: "金融投资", aliases: ["投资", "投行", "行业研究", "研究员", "交易", "量化", "风控", "资产管理", "金融", "证券", "基金"] },
  { label: "财务审计", aliases: ["财务", "会计", "审计", "税务", "资金管理", "成本管理"] },
  { label: "咨询战略", aliases: ["咨询", "战略", "商业策略", "管理咨询", "战略规划"] },
  { label: "人力行政", aliases: ["人力资源", "人事", "招聘", "行政", "hr", "组织发展"] },
  { label: "法务合规", aliases: ["法务", "法律", "合规", "知识产权", "风控合规"] },
  { label: "设计创意", aliases: ["设计", "视觉", "ui", "ux", "交互", "视频", "剪辑", "动效", "创意"] },
  { label: "销售商务", aliases: ["销售", "商务", "客户经理", "渠道", "大客户", "bd"] },
  { label: "供应链采购", aliases: ["供应链", "采购", "物流", "仓储", "供应商管理"] },
  { label: "制造工程", aliases: ["制造", "工艺", "机械", "电气", "设备", "质量", "生产", "结构工程"] },
  { label: "教育科研", aliases: ["教师", "教研", "科研", "博士后", "实验员", "课程研发"] },
  { label: "管培生", aliases: ["管培", "管理培训生", "储备干部", "培训生"] },
];

const roleAliases = new Map(ROLE_DIRECTION_OPTIONS.map((option) => [option.label.toLocaleLowerCase("zh-CN"), option.aliases]));

function includesVariant(text: string, variant: string) {
  const normalizedVariant = variant.trim().toLocaleLowerCase("zh-CN");
  if (!normalizedVariant) return false;
  if (/^[a-z0-9+#.]{1,3}$/i.test(normalizedVariant)) {
    const escaped = normalizedVariant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(text);
  }
  return text.includes(normalizedVariant);
}

export function rolePreferenceVariants(value: string) {
  const normalized = value.trim().toLocaleLowerCase("zh-CN");
  return roleAliases.get(normalized) || [value];
}

export function matchesRolePreferences(text: string, values: string[]) {
  const normalizedText = text.toLocaleLowerCase("zh-CN");
  return values.some((value) => rolePreferenceVariants(value).some((variant) => includesVariant(normalizedText, variant)));
}

