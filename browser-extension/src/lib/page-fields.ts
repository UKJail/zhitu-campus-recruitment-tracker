export function isEmptyPlaceholder(value: string) {
  return /^(请选择.*|请选.*|select.*|choose.*|pick.*|--.*--|暂无|无)$/i.test(value.replace(/\s+/g, "").trim());
}

export function normalizeDateValue(value: string, inputType = "text") {
  const normalized = value.trim()
    .replace(/[年/.]/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .replace(/-+/g, "-")
    .replace(/-$/, "");
  if (inputType === "month" && /^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized.slice(0, 7);
  if (inputType === "date" && /^\d{4}-\d{2}$/.test(normalized)) return null;
  return normalized;
}

export function choiceMatchScore(option: string, desired: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/[\s\u00a0:：*＊()（）\[\]【】._-]+/g, "").trim();
  const stripRegionSuffix = (value: string) => value.replace(/(壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|省|市|地区)$/u, "");
  const optionValue = normalize(option);
  const desiredValue = normalize(desired);
  if (!optionValue || !desiredValue) return 0;
  if (optionValue === desiredValue) return 100;
  if (stripRegionSuffix(optionValue) === stripRegionSuffix(desiredValue)) return 96;
  if (optionValue.length >= 2 && desiredValue.length >= 2 && (optionValue.includes(desiredValue) || desiredValue.includes(optionValue))) return 82;
  return 0;
}

export function parseDateParts(value: string) {
  const normalized = normalizeDateValue(value);
  const match = normalized?.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: match[3] ? Number(match[3]) : null };
}

export const FIELD_CONTAINER_SELECTOR = ".form-item, .form-group, .ant-form-item, .el-form-item, .ivu-form-item, .arco-form-item, [class*='formItem'], [class*='form-item'], [class*='field-item'], [class*='fieldItem']";
export const QUESTION_SELECTOR = ".ant-form-item-label, .el-form-item__label, .ivu-form-item-label, .arco-form-label-item, [class*='form-label'], [class*='item-label'], [class*='field-label'], label";

function textOf(element: Element | null) {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

export function fieldContainerFor(element: HTMLElement) {
  let current = element.parentElement;
  let fallback: HTMLElement | null = null;
  for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
    if (!current.matches(FIELD_CONTAINER_SELECTOR)) continue;
    fallback ??= current;
    const hasQuestion = [...current.querySelectorAll<HTMLElement>(QUESTION_SELECTOR)].some((candidate) => {
      if (candidate.contains(element)) return false;
      const value = textOf(candidate);
      return Boolean(value && value.length <= 100);
    });
    if (hasQuestion) return current;
  }
  return fallback;
}

export function radioGroupFor(element: HTMLInputElement) {
  if (element.name) {
    const named = [...document.querySelectorAll<HTMLInputElement>(`input[type='radio'][name="${CSS.escape(element.name)}"]`)];
    const fieldContainer = fieldContainerFor(element);
    if (fieldContainer && named.every((radio) => fieldContainer.contains(radio))) return fieldContainer;
    let common = element.parentElement;
    for (let depth = 0; common && depth < 6; depth += 1, common = common.parentElement) {
      if (named.every((radio) => common?.contains(radio))) return common;
    }
    return element.parentElement;
  }
  let current = element.parentElement;
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
    if (current.querySelectorAll("input[type='radio']").length >= 2) return current;
  }
  return element.parentElement;
}

export function radioOptionLabel(element: HTMLInputElement) {
  return textOf(element.closest("label"))
    || element.getAttribute("aria-label")
    || element.value;
}

export function radioQuestionLabel(element: HTMLInputElement) {
  const group = radioGroupFor(element);
  let current: HTMLElement | null = group;
  for (let depth = 0; current && depth < 4; depth += 1, current = current.parentElement) {
    const candidates = [...current.querySelectorAll<HTMLElement>(QUESTION_SELECTOR)];
    const question = candidates.find((candidate) => {
      if (candidate.contains(element) || candidate.querySelector("input[type='radio']")) return false;
      const value = textOf(candidate);
      return Boolean(value && value.length <= 80 && !/^(是|否|yes|no)$/i.test(value));
    });
    if (question) return textOf(question);
    if (current !== group && current.querySelectorAll("input[type='radio']").length > (group?.querySelectorAll("input[type='radio']").length ?? 1)) break;
  }
  return "";
}
