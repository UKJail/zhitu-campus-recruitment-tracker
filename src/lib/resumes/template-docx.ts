import JSZip from "jszip";

export type TextReplacement = { original: string; revised: string };

const decodeXml = (value: string) => value
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, "&");

const encodeXml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

const normalize = (value: string) => value.replace(/\s+/g, "").replace(/[·•]/g, "");

function findNormalizedRange(value: string, target: string) {
  const positions: number[] = [];
  let normalizedValue = "";
  for (let index = 0; index < value.length; index += 1) {
    const part = normalize(value[index]);
    normalizedValue += part;
    for (let offset = 0; offset < part.length; offset += 1) positions.push(index);
  }
  const normalizedTarget = normalize(target);
  const normalizedAt = normalizedValue.indexOf(normalizedTarget);
  if (normalizedAt < 0 || normalizedTarget.length === 0) return null;
  return { start: positions[normalizedAt], end: positions[normalizedAt + normalizedTarget.length - 1] + 1 };
}

const layoutWhitespacePattern = /\t+| {2,}|\u3000{2,}/g;

function preserveLayoutWhitespace(source: string, revised: string) {
  const sourceWhitespace = [...source.matchAll(layoutWhitespacePattern)].map((match) => match[0]);
  const revisedWhitespace = [...revised.matchAll(layoutWhitespacePattern)];
  if (sourceWhitespace.length === 0 || sourceWhitespace.length !== revisedWhitespace.length) return revised;

  let cursor = 0;
  return revised.replace(layoutWhitespacePattern, () => sourceWhitespace[cursor++]);
}

function patchParagraph(paragraphXml: string, replacement: TextReplacement) {
  const textPattern = /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g;
  const nodes = [...paragraphXml.matchAll(textPattern)];
  if (!nodes.length) return null;
  const nodeTexts = nodes.map((match) => decodeXml(match[2]));
  const paragraphText = nodeTexts.join("");
  const originalAt = paragraphText.indexOf(replacement.original);
  const range = originalAt >= 0
    ? { start: originalAt, end: originalAt + replacement.original.length }
    : findNormalizedRange(paragraphText, replacement.original);
  if (!range) return null;
  if (replacement.revised === "" && normalize(paragraphText) === normalize(replacement.original)) return "";
  const sourceText = paragraphText.slice(range.start, range.end);
  const revised = preserveLayoutWhitespace(sourceText, replacement.revised);
  let sourceOffset = 0;
  let revisedOffset = 0;
  let nodeIndex = 0;
  return paragraphXml.replace(textPattern, (full, open: string, _content: string, close: string) => {
    const nodeText = nodeTexts[nodeIndex++];
    const nodeStart = sourceOffset;
    const nodeEnd = nodeStart + nodeText.length;
    sourceOffset = nodeEnd;
    if (nodeEnd <= range.start || nodeStart >= range.end) return full;

    const localStart = Math.max(0, range.start - nodeStart);
    const localEnd = Math.min(nodeText.length, range.end - nodeStart);
    const isLastAffected = nodeEnd >= range.end;
    const replacementLength = isLastAffected ? revised.length - revisedOffset : localEnd - localStart;
    const inserted = revised.slice(revisedOffset, revisedOffset + Math.max(0, replacementLength));
    revisedOffset += inserted.length;
    // Preserve text outside the confirmed replacement in its original run.
    // Redistributing the whole paragraph would move dates or headings into
    // unrelated bold/font/link runs whenever the replacement changes length.
    const next = `${nodeText.slice(0, localStart)}${inserted}${nodeText.slice(localEnd)}`;
    const openWithSpace = /xml:space=/.test(open) || !/^\s|\s$/.test(next) ? open : open.replace(/>$/, ' xml:space="preserve">');
    return `${openWithSpace}${encodeXml(next)}${close}`;
  });
}

export async function patchResumeTemplateDocx(source: Uint8Array, replacements: TextReplacement[]) {
  const zip = await JSZip.loadAsync(source);
  const documentPart = zip.file("word/document.xml");
  if (!documentPart) throw new Error("原始 DOCX 缺少正文结构");
  let xml = await documentPart.async("string");

  for (const replacement of replacements) {
    let replaced = false;
    xml = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
      if (replaced) return paragraph;
      const patched = patchParagraph(paragraph, replacement);
      if (patched !== null) {
        replaced = true;
        return patched;
      }
      return paragraph;
    });
    if (!replaced) {
      throw new Error(`原模板中找不到要替换的文字：${replacement.original.slice(0, 28)}`);
    }
  }

  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
