import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { patchResumeTemplateDocx } from "./template-docx";

describe("original DOCX template patching", () => {
  it("只修改文字节点并保留原段落、字体和页面设置", async () => {
    const zip = new JSZip();
    const originalXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p w:rsidR="ABC"><w:pPr><w:spacing w:line="240"/></w:pPr><w:r><w:rPr><w:rFonts w:eastAsia="Arial"/><w:sz w:val="18"/></w:rPr><w:t>负责用户研究与</w:t></w:r><w:r><w:rPr><w:rFonts w:eastAsia="Arial"/><w:b/></w:rPr><w:t>数据分析</w:t></w:r></w:p><w:sectPr><w:pgMar w:top="432" w:right="518"/></w:sectPr></w:body></w:document>`;
    zip.file("word/document.xml", originalXml);
    zip.file("word/styles.xml", "<styles>ORIGINAL-STYLES</styles>");
    const source = await zip.generateAsync({ type: "uint8array" });
    const output = await patchResumeTemplateDocx(source, [{ original: "负责用户研究与数据分析", revised: "负责用户研究、访谈与数据分析" }]);
    const result = await JSZip.loadAsync(output);
    const documentXml = await result.file("word/document.xml")!.async("string");
    const visibleText = [...documentXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join("");
    expect(visibleText).toContain("负责用户研究、访谈与数据分析");
    expect(documentXml).toContain('<w:rFonts w:eastAsia="Arial"/>');
    expect(documentXml).toContain('<w:sz w:val="18"/>');
    expect(documentXml).toContain('<w:pgMar w:top="432" w:right="518"/>');
    expect(await result.file("word/styles.xml")!.async("string")).toBe("<styles>ORIGINAL-STYLES</styles>");
  });

  it("找不到原文时拒绝生成而不是破坏模板", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", '<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>原始文字</w:t></w:r></w:p></w:body></w:document>');
    const source = await zip.generateAsync({ type: "uint8array" });
    await expect(patchResumeTemplateDocx(source, [{ original: "不存在", revised: "新文字" }])).rejects.toThrow("原模板中找不到");
  });

  it("用户确认删除完整要点时移除整个段落而不是留下空项目符号", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", '<w:document xmlns:w="x"><w:body><w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>低相关且重复的完整要点</w:t></w:r></w:p><w:p><w:r><w:t>应保留的内容</w:t></w:r></w:p></w:body></w:document>');
    const source = await zip.generateAsync({ type: "uint8array" });
    const output = await patchResumeTemplateDocx(source, [{ original: "低相关且重复的完整要点", revised: "" }]);
    const result = await JSZip.loadAsync(output);
    const xml = await result.file("word/document.xml")!.async("string");
    expect(xml).not.toContain("低相关且重复的完整要点");
    expect(xml).not.toContain("<w:numPr/>");
    expect(xml).toContain("应保留的内容");
  });
  it("replaces split text when the template only differs in whitespace", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", '<w:document xmlns:w="x"><w:body><w:p><w:r><w:rPr><w:rFonts w:eastAsia="Arial"/></w:rPr><w:t>海外留学教育机构｜教育项目市场与销售专员｜远程线上</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">   2024.01-2024.06</w:t></w:r></w:p></w:body></w:document>');
    const source = await zip.generateAsync({ type: "uint8array" });
    const output = await patchResumeTemplateDocx(source, [{
      original: "海外留学教育机构｜教育项目市场与销售专员｜远程线上\t2024.01-2024.06",
      revised: "海外留学教育机构｜教育项目市场与销售专员（远程）｜线上\t2024.01-2024.06",
    }]);
    const result = await JSZip.loadAsync(output);
    const xml = await result.file("word/document.xml")!.async("string");
    const visibleText = [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join("");
    expect(visibleText).toContain("海外留学教育机构｜教育项目市场与销售专员（远程）｜线上");
    expect(xml).toContain('<w:rFonts w:eastAsia="Arial"/>');
    expect(xml).toContain("<w:b/>");
  });

  it("keeps template alignment whitespace and date formatting when AI returns a tab", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", '<w:document xmlns:w="x"><w:body><w:p><w:r><w:rPr><w:b/><w:rFonts w:ascii="Arial"/></w:rPr><w:t>AI求职追踪与岗位匹配平台｜</w:t></w:r><w:r><w:t xml:space="preserve">个人开发项目 </w:t></w:r><w:r><w:rPr><w:b/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">          </w:t></w:r><w:r><w:rPr><w:b/><w:rFonts w:ascii="Arial"/><w:sz w:val="20"/></w:rPr><w:t>2026/08</w:t></w:r></w:p></w:body></w:document>');
    const source = await zip.generateAsync({ type: "uint8array" });
    const output = await patchResumeTemplateDocx(source, [{
      original: "AI求职追踪与岗位匹配平台｜个人开发项目\t2026/08",
      revised: "AI求职追踪与岗位匹配平台｜个人开发项目\t2026.08",
    }]);
    const result = await JSZip.loadAsync(output);
    const xml = await result.file("word/document.xml")!.async("string");
    const visibleText = [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join("");
    expect(visibleText).toContain("个人开发项目           2026.08");
    expect(xml).not.toContain("个人开发项目\t");
    expect(xml).toContain('<w:rFonts w:ascii="Arial"/><w:sz w:val="20"/></w:rPr><w:t>2026.08</w:t>');
  });
});
