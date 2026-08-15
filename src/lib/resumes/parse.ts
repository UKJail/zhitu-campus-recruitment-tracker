import mammoth from "mammoth";
import { getData } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

PDFParse.setWorker(getData());

export const PDF_MIME = "application/pdf";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const RESUME_MIME_TYPES = [PDF_MIME, DOCX_MIME] as const;
export const MAX_RESUME_BYTES = 10 * 1024 * 1024;

export function validateResumeFile(file: File) {
  if (!RESUME_MIME_TYPES.includes(file.type as (typeof RESUME_MIME_TYPES)[number])) {
    throw new Error("仅支持 PDF 或 DOCX 文件");
  }
  if (file.size < 1 || file.size > MAX_RESUME_BYTES) {
    throw new Error("文件大小必须在 10MB 以内");
  }
}

export async function extractResumeText(file: File) {
  validateResumeFile(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";

  if (file.type === PDF_MIME) {
    const parser = new PDFParse({ data: buffer });
    try {
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else {
    text = (await mammoth.extractRawText({ buffer })).value;
  }

  const normalized = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (normalized.length < 20) {
    throw new Error("未能从简历中提取足够文字，请确认文件不是扫描图片");
  }
  return normalized.slice(0, 100_000);
}
