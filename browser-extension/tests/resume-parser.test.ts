import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { applyLocalResumeDraft, extractDocxTextFromArrayBuffer } from "../src/lib/resume-parser";
import { createEmptyProfile, type ResumeAsset } from "../src/types/profile";

vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "pdf-worker.js" }));

const resume: ResumeAsset = {
  id: "resume-test",
  name: "脱敏测试简历.docx",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  size: 1024,
  language: "zh-CN",
  tags: [],
  addedAt: "2026-08-23T00:00:00.000Z",
  extractedText: "",
};

describe("local resume parser", () => {
  it("extracts text-box paragraphs that Mammoth can omit", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:drawing><w:txbxContent><w:p><w:r><w:t>项目经历</w:t></w:r></w:p><w:p><w:r><w:t>脱敏项目｜个人项目2026/08</w:t></w:r></w:p></w:txbxContent></w:drawing></w:r></w:p></w:body></w:document>`);
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    await expect(extractDocxTextFromArrayBuffer(buffer)).resolves.toBe("项目经历\n脱敏项目｜个人项目2026/08");
  });

  it("parses summary, education, experiences, projects, skills, certificates and languages", () => {
    const text = [
      "测试同学",
      "电话：13800000000 邮箱：candidate@example.test",
      "教育背景",
      "示例大学｜金融学学士｜中国，深圳2022.09-2026.06",
      "GPA: 3.6/4.0",
      "相关课程：公司金融、数据分析",
      "工作经历",
      "示例银行｜分析实习生｜中国，深圳2025.06-2025.09",
      "财务分析：整理公开数据并完成报告。",
      "示例研究机构｜研究助理｜远程2024.06-2024.08",
      "政策研究：梳理公开政策材料。",
      "项目经历",
      "估值分析平台｜个人开发项目2026/08",
      "平台搭建：实现资料整理功能。",
      "课程论文｜行业政策研究2025/02-2025/05",
      "资料分析：完成课程范围内研究。",
      "自我评价",
      "具备财务分析与项目实践经验。",
      "个人技能",
      "数据分析：使用 SPSS 开展相关性分析",
      "办公工具：使用 Excel、PowerPoint、Word",
      "资格证书：示例资格证书；示例驾驶证",
      "语言及兴趣：普通话（母语）、英语（CET-6）；旅行",
    ].join("\n");
    const parsed = applyLocalResumeDraft(createEmptyProfile(), text, resume);

    expect(parsed.personal.summary).toContain("财务分析");
    expect(parsed.education[0]).toMatchObject({ school: "示例大学", degree: "本科", academicDegree: "学士", field: "金融学", startDate: "2022-09", endDate: "2026-06", gpa: "3.6/4.0" });
    expect(parsed.experiences).toHaveLength(2);
    expect(parsed.experiences[0]).toMatchObject({ organization: "示例银行", role: "分析实习生", type: "internship", location: "中国，深圳" });
    expect(parsed.experiences[0]?.bullets[0]).toContain("财务分析");
    expect(parsed.projects).toHaveLength(2);
    expect(parsed.projects[0]).toMatchObject({ name: "估值分析平台", type: "personal", startDate: "2026-08" });
    expect(parsed.projects[1]).toMatchObject({ name: "课程论文", type: "course", startDate: "2025-02", endDate: "2025-05" });
    expect(parsed.skills.map((item) => item.name)).toEqual(["数据分析", "办公工具"]);
    expect(parsed.certificates).toHaveLength(2);
    expect(parsed.languages.map((item) => [item.name, item.level])).toEqual([["普通话", "母语"], ["英语", "CET-6"]]);
  });

  it("does not overwrite profile sections the user already populated", () => {
    const profile = createEmptyProfile();
    profile.personal.summary = "用户确认的概述";
    profile.skills.push({ id: "kept", name: "用户技能", level: "" });
    const parsed = applyLocalResumeDraft(profile, "自我评价\n新的概述\n个人技能\n数据分析：测试", resume);
    expect(parsed.personal.summary).toBe("用户确认的概述");
    expect(parsed.skills).toEqual(profile.skills);
  });
});
