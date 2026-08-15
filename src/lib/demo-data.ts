import type { InterviewReview, Job, Resume, Suggestion } from "./types";

export const jobs: Job[] = [
  {
    id: "job-1", company: "字节跳动", title: "AI 产品经理", location: "上海", salary: "30–45K · 15薪",
    experience: "3–5年", education: "本科", source: "企业官网", publishedAt: "今天", match: 92,
    tags: ["大模型", "产品策略", "数据分析"], description: "负责大模型产品规划、用户研究与商业化落地，推动研发、算法和设计团队协作。",
    applyUrl: "https://jobs.bytedance.com/", saved: true, status: "interview",
  },
  {
    id: "job-2", company: "蚂蚁集团", title: "高级产品经理（智能服务）", location: "杭州", salary: "28–40K · 16薪",
    experience: "3–5年", education: "本科", source: "猎聘", publishedAt: "1天前", match: 88,
    tags: ["AI Agent", "B端产品", "增长"], description: "负责智能服务产品矩阵，完成需求洞察、方案设计、指标建设和跨团队项目推进。",
    applyUrl: "https://www.liepin.com/", saved: true, status: "assessment",
  },
  {
    id: "job-3", company: "小红书", title: "商业产品经理", location: "上海", salary: "25–40K · 14薪",
    experience: "3–5年", education: "本科", source: "智联招聘", publishedAt: "2天前", match: 83,
    tags: ["商业化", "策略产品", "SQL"], description: "围绕品牌客户建设商业产品能力，以数据分析驱动产品迭代和收入增长。",
    applyUrl: "https://www.zhaopin.com/", saved: false,
  },
  {
    id: "job-4", company: "得物App", title: "用户增长产品经理", location: "上海", salary: "25–35K · 14薪",
    experience: "3–5年", education: "本科", source: "前程无忧", publishedAt: "3天前", match: 79,
    tags: ["增长", "A/B测试", "用户运营"], description: "搭建用户增长链路，设计实验并分析关键转化指标。",
    applyUrl: "https://www.51job.com/", saved: true, status: "applied",
  },
  {
    id: "job-5", company: "携程集团", title: "产品经理（国际化）", location: "上海", salary: "22–35K · 14薪",
    experience: "3–5年", education: "本科", source: "公开聚合源", publishedAt: "4天前", match: 76,
    tags: ["国际化", "用户体验", "英语"], description: "负责国际化业务产品体验，协同海外运营和研发完成产品交付。",
    applyUrl: "https://careers.ctrip.com/", saved: false,
  },
];

export const resumes: Resume[] = [
  { id: "resume-1", name: "产品经理简历_2026春招", fileType: "PDF", updatedAt: "今天 09:32", completeness: 92, skills: ["产品规划", "数据分析", "用户研究", "SQL", "Figma"] },
  { id: "resume-2", name: "AI产品方向_英文版", fileType: "DOCX", updatedAt: "8月10日", completeness: 84, skills: ["AI Product", "Prompt Design", "Analytics"] },
];

export const initialSuggestions: Suggestion[] = [
  { id: "s1", section: "工作经历 · 项目成果", original: "负责智能客服产品优化，提升了用户体验。", revised: "主导智能客服核心流程重构，基于 2,400+ 条用户反馈定位高频断点，推动问答命中率提升 18%。", reason: "补充了行动、依据和可验证结果，更贴合 JD 对数据驱动的要求。", impact: "高", state: "pending" },
  { id: "s2", section: "专业技能", original: "熟悉数据分析和原型设计工具。", revised: "数据分析：SQL、Excel、A/B 测试；产品设计：Figma、Axure；能够独立完成指标拆解与实验复盘。", reason: "将笼统描述改为招聘方可检索的关键词。", impact: "中", state: "pending" },
  { id: "s3", section: "个人简介", original: "3年互联网产品经验，沟通能力强。", revised: "3 年 AI 与 B 端产品经验，擅长将复杂业务问题拆解为可验证的产品方案，并推动算法、研发与运营团队交付。", reason: "突出岗位最关注的 AI 场景和跨团队推进能力。", impact: "高", state: "pending" },
];

export const reviews: InterviewReview[] = [
  { id: "r1", company: "字节跳动", role: "AI 产品经理", round: "业务二面", date: "2026-08-11", score: 4, questions: "如何定义大模型产品的北极星指标？\n讲一个从用户研究到上线验证的完整案例。", highlights: "指标拆解较完整；能主动澄清业务阶段。", improvements: "案例中的失败数据准备不够具体。", nextStep: "补齐智能客服项目的周维度指标变化；准备一次产品失败复盘。" },
];

export const journey = [
  { key: "saved", label: "已收藏", count: 18 },
  { key: "preparing", label: "准备投递", count: 4 },
  { key: "applied", label: "已投递", count: 12 },
  { key: "assessment", label: "测评", count: 3 },
  { key: "interview", label: "面试", count: 2 },
  { key: "offer", label: "Offer", count: 1 },
  { key: "closed", label: "结束", count: 5 },
];
