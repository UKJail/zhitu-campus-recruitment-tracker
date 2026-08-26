import { browser } from "wxt/browser";
import type { FieldDescriptor, FieldKind, FieldMatch } from "../src/lib/field-matcher";
import {
  QUESTION_SELECTOR,
  choiceMatchScore,
  fieldContainerFor,
  isEmptyPlaceholder,
  normalizeDateValue,
  parseDateParts,
  radioGroupFor,
  radioOptionLabel,
  radioQuestionLabel,
} from "../src/lib/page-fields";

type PageMessage =
  | { type: "ZHITU_SCAN" }
  | { type: "ZHITU_FILL"; matches: FieldMatch[] }
  | { type: "ZHITU_MARK"; matches: FieldMatch[] }
  | { type: "ZHITU_CLEAR_MARKS" };

declare global {
  interface Window {
    __zhituAutofillCleanup?: () => void;
  }
}

export default defineUnlistedScript({
  globalName: true,
  main() {
    // A tab can outlive an extension reload. Reconnect it to the current
    // extension context instead of keeping listeners from the invalid one.
    try { window.__zhituAutofillCleanup?.(); } catch { /* stale context */ }
    window.__zhituAutofillCleanup = undefined;

    document.getElementById("zhitu-autofill-style")?.remove();

    const style = document.createElement("style");
    style.id = "zhitu-autofill-style";
    style.textContent = `
      [data-zhitu-fill-state="filled"] { outline: 3px solid #43d19e !important; outline-offset: 2px !important; }
      [data-zhitu-fill-state="review"] { outline: 3px solid #ffd84d !important; outline-offset: 2px !important; }
      [data-zhitu-fill-state="error"] { outline: 3px solid #f17474 !important; outline-offset: 2px !important; }
      [data-zhitu-debug-state="high"] { outline: 2px dashed #24a978 !important; outline-offset: 3px !important; }
      [data-zhitu-debug-state="review"] { outline: 2px dashed #d69b00 !important; outline-offset: 3px !important; }
      [data-zhitu-debug-state="existing"] { outline: 2px dashed #78879c !important; outline-offset: 3px !important; }
      [data-zhitu-debug-state="skipped"] { outline: 2px dashed #d4473f !important; outline-offset: 3px !important; }
      #zhitu-debug-overlay { position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; font-family: Inter, "Microsoft YaHei", sans-serif; }
      #zhitu-debug-overlay .zhitu-debug-legend { position: fixed; top: 14px; right: 14px; padding: 8px 11px; border: 1px solid #afbdd0; border-radius: 5px; background: #102d57ee; color: white; box-shadow: 0 8px 24px #102d5738; font-size: 12px; font-weight: 700; letter-spacing: .01em; }
      #zhitu-debug-overlay .zhitu-debug-legend i { display: inline-block; width: 7px; height: 7px; margin: 0 3px 0 8px; border-radius: 50%; }
      #zhitu-debug-overlay .zhitu-debug-marker { position: fixed; width: 25px; height: 22px; padding: 0; border: 2px solid white; border-radius: 4px; color: #0d213e; box-shadow: 0 2px 9px #102d5750; font: 800 10px/18px ui-monospace, Consolas, monospace; text-align: center; cursor: pointer; pointer-events: auto; }
      #zhitu-debug-overlay .zhitu-debug-marker[data-state="high"] { background: #54dda9; }
      #zhitu-debug-overlay .zhitu-debug-marker[data-state="review"] { background: #ffd84d; }
      #zhitu-debug-overlay .zhitu-debug-marker[data-state="existing"] { background: #aeb9c8; }
      #zhitu-debug-overlay .zhitu-debug-marker[data-state="skipped"] { background: #ff8179; }
      #zhitu-debug-overlay .zhitu-debug-marker:hover, #zhitu-debug-overlay .zhitu-debug-marker:focus-visible { transform: scale(1.12); outline: 3px solid #173f79; }
    `;
    document.documentElement.append(style);

    function visible(element: Element) {
      const html = element as HTMLElement;
      const rect = html.getBoundingClientRect();
      const computed = getComputedStyle(html);
      return computed.display !== "none" && computed.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }

    let markerContainer: HTMLDivElement | null = null;
    let dispose: () => void = () => undefined;

    function extensionContextInvalid(error: unknown) {
      return /extension context invalidated|context invalidated/i.test(error instanceof Error ? error.message : String(error));
    }

    function sendRuntimeMessage(message: Record<string, unknown>) {
      try {
        void browser.runtime.sendMessage(message).catch((error: unknown) => {
          if (extensionContextInvalid(error)) dispose();
        });
      } catch (error) {
        // Accessing browser.runtime itself throws synchronously after Chrome
        // reloads the extension while this page remains open.
        if (extensionContextInvalid(error)) dispose();
      }
    }

    function markerState(match: FieldMatch) {
      if (match.reason.includes("网页中已有内容")) return "existing";
      if (match.confidence === "skipped") return "skipped";
      if (match.confidence === "medium" || match.reviewRequired) return "review";
      return "high";
    }

    function clearMarkers() {
      markerContainer?.remove();
      markerContainer = null;
      document.querySelectorAll<HTMLElement>("[data-zhitu-debug-state]").forEach((element) => {
        delete element.dataset.zhituDebugState;
      });
    }

    function updateMarkerPositions() {
      if (!markerContainer) return;
      markerContainer.querySelectorAll<HTMLButtonElement>(".zhitu-debug-marker").forEach((marker) => {
        const token = marker.dataset.token;
        const element = token ? document.querySelector<HTMLElement>(`[data-zhitu-autofill-token="${CSS.escape(token)}"]`) : null;
        if (!element || !visible(element)) {
          marker.hidden = true;
          return;
        }
        marker.hidden = false;
        const rect = element.getBoundingClientRect();
        marker.style.left = `${Math.max(4, Math.min(window.innerWidth - 29, rect.right - 27))}px`;
        marker.style.top = `${Math.max(4, Math.min(window.innerHeight - 26, rect.top + 3))}px`;
      });
    }

    function mark(matches: FieldMatch[]) {
      clearMarkers();
      markerContainer = document.createElement("div");
      markerContainer.id = "zhitu-debug-overlay";
      markerContainer.innerHTML = `<div class="zhitu-debug-legend">字段标记 ${matches.length}<i style="background:#54dda9"></i>可靠<i style="background:#ffd84d"></i>复核<i style="background:#aeb9c8"></i>已有<i style="background:#ff8179"></i>跳过</div>`;
      matches.forEach((match, index) => {
        const element = document.querySelector<HTMLElement>(`[data-zhitu-autofill-token="${CSS.escape(match.token)}"]`);
        if (!element) return;
        const state = markerState(match);
        element.dataset.zhituDebugState = state;
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "zhitu-debug-marker";
        marker.dataset.token = match.token;
        marker.dataset.state = state;
        marker.textContent = String(index + 1).padStart(2, "0");
        marker.title = `${index + 1}. ${match.label} · ${match.reason}`;
        marker.setAttribute("aria-label", `定位字段 ${index + 1}：${match.label}`);
        marker.addEventListener("click", () => {
          sendRuntimeMessage({ type: "ZHITU_MARKER_SELECTED", token: match.token });
        });
        markerContainer?.append(marker);
      });
      document.documentElement.append(markerContainer);
      updateMarkerPositions();
      return { marked: markerContainer.querySelectorAll(".zhitu-debug-marker").length };
    }

    window.addEventListener("scroll", updateMarkerPositions, true);
    window.addEventListener("resize", updateMarkerPositions);

    function textOf(element: Element | null) {
      return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    }

    function labelFor(element: HTMLElement) {
      const parts: string[] = [];
      if (element instanceof HTMLInputElement && element.type === "radio") parts.push(radioQuestionLabel(element));
      if (element.id) {
        try { parts.push(textOf(document.querySelector(`label[for="${CSS.escape(element.id)}"]`))); } catch { /* invalid legacy id */ }
      }
      parts.push(textOf(element.closest("label")));
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy) labelledBy.split(/\s+/).forEach((id) => parts.push(textOf(document.getElementById(id))));
      parts.push(
        element.getAttribute("aria-label") ?? "",
        element.getAttribute("placeholder") ?? "",
        element.getAttribute("name") ?? "",
        element.id,
      );
      const group = fieldContainerFor(element);
      if (group) parts.push(textOf(group.querySelector(QUESTION_SELECTOR)));
      return [...new Set(parts.map((part) => part.trim()).filter(Boolean))];
    }

    function sectionFor(element: HTMLElement) {
      const fieldset = element.closest("fieldset");
      if (fieldset) return textOf(fieldset.querySelector("legend"));
      let current: HTMLElement | null = element.parentElement;
      for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
        const heading = current.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > [class*='title']");
        const value = textOf(heading);
        if (value && value.length <= 80) return value;
        const labels = [...current.querySelectorAll<HTMLElement>(QUESTION_SELECTOR)].map(textOf).join(" ");
        const fieldCount = current.querySelectorAll("input, textarea, select, [role='combobox']").length;
        if (fieldCount >= 2 && fieldCount <= 24) {
          if (/(项目名称|项目描述|项目职务)/.test(labels)) return "项目经历";
          if (/(企业名称|公司名称|工作描述|职位名称)/.test(labels)) return "实习工作经历";
          if (/(毕业学校|学历类型|所在院系|主修课程)/.test(labels)) return "教育经历";
        }
      }
      return "";
    }

    function kindFor(element: HTMLElement): FieldKind | null {
      if (element instanceof HTMLSelectElement) return "select";
      if (element instanceof HTMLTextAreaElement) return "textarea";
      if (element.isContentEditable) return "contenteditable";
      if (element.getAttribute("role") === "combobox") return "combobox";
      if (element instanceof HTMLInputElement) {
        if (["hidden", "password", "submit", "reset", "button", "image", "file"].includes(element.type)) return null;
        if (element.type === "radio") return "radio";
        if (element.type === "checkbox") return "checkbox";
        return "input";
      }
      return null;
    }

    function componentHintFor(element: HTMLElement) {
      const classes: string[] = [];
      let current: HTMLElement | null = element;
      for (let depth = 0; current && depth < 3; depth += 1, current = current.parentElement) {
        classes.push(...[...current.classList].filter((name) => /(ant|el-|ivu|arco|atsx|select|picker|date|radio|input|cascad)/i.test(name)));
      }
      if (classes.length > 0) return [...new Set(classes)].slice(0, 8).join(" ").slice(0, 180);
      if (element.getAttribute("role") === "combobox") return "aria-combobox";
      return element.tagName.toLowerCase();
    }

    function scan(): FieldDescriptor[] {
      const selectors = "input, textarea, select, [contenteditable='true'], [role='combobox']";
      const elements = [...document.querySelectorAll<HTMLElement>(selectors)].filter(visible);
      const seenRadioGroups = new Set<HTMLElement>();
      const fields: FieldDescriptor[] = [];
      elements.forEach((element) => {
        const kind = kindFor(element);
        if (!kind || element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return;
        if (kind === "radio" && element instanceof HTMLInputElement) {
          const group = radioGroupFor(element);
          if (group && seenRadioGroups.has(group)) return;
          if (group) seenRadioGroups.add(group);
        }
        const token = element.dataset.zhituAutofillToken || crypto.randomUUID();
        element.dataset.zhituAutofillToken = token;
        const signals = labelFor(element);
        const label = signals[0] || "未命名字段";
        let options: string[] = [];
        if (element instanceof HTMLSelectElement) {
          options = [...element.options].map((option) => option.text.trim()).filter(Boolean);
        } else if (kind === "radio" && element instanceof HTMLInputElement) {
          const group = radioGroupFor(element);
          const radios = group ? [...group.querySelectorAll<HTMLInputElement>("input[type='radio']")] : [element];
          options = radios.map(radioOptionLabel).filter(Boolean);
        }
        const rawCurrentValue = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
          ? (kind === "radio" && element instanceof HTMLInputElement
            ? ([...(radioGroupFor(element)?.querySelectorAll<HTMLInputElement>("input[type='radio']") ?? [element])].find((radio) => radio.checked)?.value ?? "")
            : kind === "checkbox" && element instanceof HTMLInputElement
              ? (element.checked ? element.value : "")
              : element.value)
          : element.textContent ?? "";
        const currentValue = isEmptyPlaceholder(rawCurrentValue) ? "" : rawCurrentValue;
        fields.push({
          token,
          kind,
          label,
          signals,
          section: sectionFor(element),
          options,
          currentValue,
          required: element.hasAttribute("required") || element.getAttribute("aria-required") === "true",
          inputType: element instanceof HTMLInputElement ? element.type : undefined,
          readOnly: element instanceof HTMLInputElement ? element.readOnly : undefined,
          componentHint: componentHintFor(element),
        });
      });
      return fields;
    }

    function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(element, value);
      else element.value = value;
    }

    function dispatchValue(element: HTMLInputElement | HTMLTextAreaElement, value: string, pressEnter = false) {
      element.focus();
      setNativeValue(element, value);
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      if (pressEnter) element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter" }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      if (pressEnter) element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter" }));
      element.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      element.blur();
    }

    function dispatchSearchValue(element: HTMLInputElement, value: string) {
      element.focus();
      setNativeValue(element, value);
      element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, inputType: "insertText", data: value }));
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: value.at(-1) ?? "", code: "" }));
    }

    function clickControl(element: HTMLElement) {
      element.scrollIntoView({ block: "nearest" });
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", isPrimary: true }));
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", isPrimary: true }));
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      element.click();
    }

    function textMatchesOneOf(element: HTMLElement, values: string[]) {
      const candidates = [textOf(element), element.title, element.dataset.value, element.dataset.date, element.getAttribute("aria-label") ?? ""].filter((candidate): candidate is string => Boolean(candidate));
      return values.some((value) => candidates.some((candidate) => choiceMatchScore(candidate, value) >= 96));
    }

    function visibleCalendarElements(selectors: string) {
      return [...document.querySelectorAll<HTMLElement>(selectors)].filter(visible);
    }

    async function chooseDateFromOpenCalendar(value: string) {
      const parts = parseDateParts(value);
      if (!parts) return false;
      const exactValues = [
        `${parts.year}-${String(parts.month).padStart(2, "0")}${parts.day ? `-${String(parts.day).padStart(2, "0")}` : ""}`,
        `${parts.year}/${String(parts.month).padStart(2, "0")}${parts.day ? `/${String(parts.day).padStart(2, "0")}` : ""}`,
      ];
      const exact = visibleCalendarElements([
        ".ant-picker-dropdown [title]", ".el-picker-panel [data-date]", ".atsx-picker-dropdown [data-date]",
        "[class*='calendar'] [data-date]", "[class*='calendar'] [data-value]", "[class*='picker'] [title]",
      ].join(", ")).find((item) => textMatchesOneOf(item, exactValues));
      if (exact) { clickControl(exact); return true; }

      const yearHeaders = visibleCalendarElements([
        ".ant-picker-year-btn", ".el-date-picker__header-label", ".atsx-calendar-year-select",
        "[class*='calendar'] [class*='year-select']", "[class*='picker'] [class*='year-btn']",
      ].join(", "));
      const yearHeader = yearHeaders.find((item) => /\d{4}/.test(textOf(item))) ?? yearHeaders[0];
      if (yearHeader) {
        clickControl(yearHeader);
        await new Promise((resolve) => setTimeout(resolve, 140));
        const yearOption = visibleCalendarElements([
          ".ant-picker-year-panel .ant-picker-cell-inner", ".ant-calendar-year-panel-year", ".el-year-table .cell", ".atsx-calendar-year-panel td",
          "[class*='year-panel'] [class*='cell']", "[class*='year-table'] td", "[role='option']",
        ].join(", ")).find((item) => textMatchesOneOf(item, [String(parts.year), `${parts.year}年`]));
        if (yearOption) { clickControl(yearOption); await new Promise((resolve) => setTimeout(resolve, 160)); }
      }

      const monthHeaders = visibleCalendarElements([
        ".ant-picker-month-btn", ".ant-calendar-month-select", ".el-date-picker__header-label", ".atsx-calendar-month-select",
        "[class*='calendar'] [class*='month-select']", "[class*='picker'] [class*='month-btn']",
      ].join(", "));
      const monthHeader = monthHeaders.find((item) => /月|month/i.test(textOf(item))) ?? monthHeaders[0];
      if (monthHeader && visibleCalendarElements(".ant-calendar-month-panel-month, .ant-picker-month-panel .ant-picker-cell-inner, .el-month-table .cell, [class*='month-panel'] [class*='cell']").length === 0) {
        clickControl(monthHeader);
        await new Promise((resolve) => setTimeout(resolve, 140));
      }
      const monthValues = [`${parts.month}月`, `${String(parts.month).padStart(2, "0")}月`, String(parts.month), String(parts.month).padStart(2, "0")];
      const monthOption = visibleCalendarElements([
        ".ant-picker-month-panel .ant-picker-cell-inner", ".ant-calendar-month-panel-month", ".el-month-table .cell", ".atsx-calendar-month-panel td",
        "[class*='month-panel'] [class*='cell']", "[class*='month-table'] td", "[role='option']",
      ].join(", ")).find((item) => textMatchesOneOf(item, monthValues));
      if (monthOption) { clickControl(monthOption); await new Promise((resolve) => setTimeout(resolve, 180)); }
      if (!parts.day) return Boolean(monthOption);

      const dayValues = [String(parts.day), String(parts.day).padStart(2, "0")];
      const dayOption = visibleCalendarElements([
        ".ant-picker-date-panel .ant-picker-cell-in-view .ant-picker-cell-inner", ".ant-calendar-cell:not(.ant-calendar-last-month-cell):not(.ant-calendar-next-month-btn-day) .ant-calendar-date", ".el-date-table td.available .cell",
        ".atsx-calendar-date-panel td", "[class*='date-panel'] td", "[class*='date-table'] td",
      ].join(", ")).find((item) => textMatchesOneOf(item, dayValues));
      if (dayOption) { clickControl(dayOption); return true; }
      return false;
    }

    function dateVariants(value: string, inputType: string) {
      const normalized = normalizeDateValue(value, inputType);
      if (!normalized) return [];
      const values = [normalized];
      if (/^\d{4}-\d{2}$/.test(normalized) && inputType !== "month") {
        values.push(normalized.replace("-", "/"), `${normalized.slice(0, 4)}年${normalized.slice(5, 7)}月`);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(normalized) && inputType !== "date") {
        values.push(normalized.replaceAll("-", "/"), `${normalized.slice(0, 4)}年${normalized.slice(5, 7)}月${normalized.slice(8, 10)}日`);
      }
      return [...new Set(values)];
    }

    async function closeTransientPopup(element: HTMLElement) {
      const init = { bubbles: true, key: "Escape", code: "Escape" };
      element.dispatchEvent(new KeyboardEvent("keydown", init));
      document.dispatchEvent(new KeyboardEvent("keydown", init));
      element.dispatchEvent(new KeyboardEvent("keyup", init));
      element.blur();
      await new Promise((resolve) => setTimeout(resolve, 70));
    }

    function isDateControl(element: HTMLInputElement, label: string) {
      const context = [element.type, element.placeholder, element.getAttribute("aria-label") ?? "", element.className, element.parentElement?.className ?? "", label].join(" ");
      return /(date|month|year|日期|时间|年月|picker)/i.test(context);
    }

    async function fillDateControl(element: HTMLInputElement, value: string, label: string) {
      const variants = dateVariants(value, element.type);
      if (variants.length === 0) throw new Error("资料只有年月，但网页要求完整日期");
      const dateParts = parseDateParts(variants[0]!);
      const calendarValue = dateParts && dateParts.day === null
        ? `${dateParts.year}-${String(dateParts.month).padStart(2, "0")}-${String(/(结束|毕业|离职|到期)/.test(label) ? new Date(dateParts.year, dateParts.month, 0).getDate() : 1).padStart(2, "0")}`
        : variants[0]!;
      const wasReadOnly = element.readOnly;
      const trigger = element.closest<HTMLElement>(".ant-picker, .el-date-editor, .atsx-date-picker, [class*='date-picker'], [class*='picker']") ?? element;
      clickControl(trigger);
      await new Promise((resolve) => setTimeout(resolve, 180));
      const exactValues = [calendarValue, calendarValue.slice(0, 7)];
      const calendarCell = [...document.querySelectorAll<HTMLElement>("[title], [data-date], [data-value], [aria-label]")]
        .filter(visible)
        .find((item) => exactValues.some((target) => [item.title, item.dataset.date, item.dataset.value, item.getAttribute("aria-label")].filter(Boolean).some((candidate) => candidate === target)));
      if (calendarCell) {
        clickControl(calendarCell);
        return;
      }
      if (await chooseDateFromOpenCalendar(calendarValue)) return;
      if (wasReadOnly) element.removeAttribute("readonly");
      try {
        for (const candidate of [calendarValue, ...variants]) {
          dispatchValue(element, candidate, true);
          await new Promise((resolve) => setTimeout(resolve, 140));
          if (element.value.trim() && !isEmptyPlaceholder(element.value)) return;
        }
        throw new Error("日期选择器没有接受该日期");
      } finally {
        if (wasReadOnly) element.setAttribute("readonly", "");
        await closeTransientPopup(element);
      }
    }

    function customOptionsNear(element: HTMLElement) {
      const anchor = element.getBoundingClientRect();
      const selectors = [
        "[role='option']", "[role='treeitem']", ".ant-select-item-option", ".el-select-dropdown__item", ".arco-select-option", ".ivu-select-item",
        ".atsx-select-dropdown-menu-item", ".atsx-cascader-menu-item", "[class*='dropdown-menu-item']", "[class*='select-menu-item']",
        "[class*='cascader-menu-item']", "[class*='dropdown'] li", "[class*='select'] li", "[class*='menu'] li", "[class*='option']", "[class*='tree-node']", "li",
      ].join(", ");
      return [...document.querySelectorAll<HTMLElement>(selectors)]
        .filter(visible)
        .filter((item) => {
          const text = textOf(item);
          if (!text || text.length > 100) return false;
          const rect = item.getBoundingClientRect();
          return rect.right >= anchor.left - 240 && rect.left <= anchor.right + 240;
        });
    }

    function matchingCustomOption(element: HTMLElement, value: string) {
      const ranked = customOptionsNear(element)
        .map((item) => ({ item, text: textOf(item), score: choiceMatchScore(textOf(item), value) }))
        .filter(({ score }) => score > 0)
        .sort((left, right) => right.score - left.score || left.text.length - right.text.length);
      return ranked[0]?.item;
    }

    function hierarchicalRegionParts(value: string) {
      const parts = value.match(/[^省市区县州盟]+(?:省|市|自治区|特别行政区|区|县|州|盟)/gu) ?? [];
      return parts.length >= 2 ? parts : [value];
    }

    async function waitForCustomOption(element: HTMLElement, value: string, timeoutMs: number) {
      const deadline = Date.now() + timeoutMs;
      do {
        const option = matchingCustomOption(element, value);
        if (option) return option;
        await new Promise((resolve) => setTimeout(resolve, 120));
      } while (Date.now() < deadline);
      return undefined;
    }

    async function chooseCustomOption(option: HTMLElement) {
      clickControl(option);
      await new Promise((resolve) => setTimeout(resolve, 180));
    }

    function customTriggerFor(element: HTMLElement) {
      return element.closest<HTMLElement>(".ant-select, .el-select, .arco-select, .ivu-select, .atsx-select, .atsx-cascader, [class*='select-wrapper'], [class*='select-wrap'], [class*='cascader']") ?? element;
    }

    function searchableInputFor(element: HTMLElement) {
      const trigger = customTriggerFor(element);
      const candidates = [...document.querySelectorAll<HTMLInputElement>([
        ".atsx-select-dropdown input", ".ant-select-dropdown input", ".el-select-dropdown input", ".arco-select-popup input",
        "[class*='dropdown'] input", "[class*='popup'] input", "[role='listbox'] input", "input[role='combobox']",
      ].join(", "))].filter(visible);
      if (element instanceof HTMLInputElement && !element.readOnly) candidates.unshift(element);
      const triggerRect = trigger.getBoundingClientRect();
      return candidates
        .filter((input) => !input.disabled && !input.readOnly)
        .sort((left, right) => {
          const leftRect = left.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          const leftDistance = Math.abs(leftRect.left - triggerRect.left) + Math.abs(leftRect.top - triggerRect.bottom);
          const rightDistance = Math.abs(rightRect.left - triggerRect.left) + Math.abs(rightRect.top - triggerRect.bottom);
          return leftDistance - rightDistance;
        })[0];
    }

    async function pickCustomOption(element: HTMLElement, value: string) {
      await closeTransientPopup(element);
      const trigger = customTriggerFor(element);
      clickControl(trigger);
      await new Promise((resolve) => setTimeout(resolve, 160));
      const targets = hierarchicalRegionParts(value);
      let completedHierarchy = true;
      for (const target of targets) {
        const option = await waitForCustomOption(element, target, 1200);
        if (!option) { completedHierarchy = false; break; }
        await chooseCustomOption(option);
      }
      if (completedHierarchy) {
        await closeTransientPopup(element);
        return true;
      }
      const searchInput = searchableInputFor(element) ?? element.querySelector<HTMLInputElement>("input");
      let option: HTMLElement | undefined;
      const searchValue = targets.at(-1) ?? value;
      if (searchInput && !searchInput.readOnly) {
        dispatchSearchValue(searchInput, searchValue);
        option = await waitForCustomOption(element, searchValue, 3200);
      }
      if (option) {
        await chooseCustomOption(option);
        await closeTransientPopup(element);
        return true;
      }
      await closeTransientPopup(element);
      return false;
    }

    function visibleDialog() {
      const dialogs = [...document.querySelectorAll<HTMLElement>("[role='dialog'], .ant-modal, [class*='modal-content'], [class*='dialog-content']")].filter(visible);
      return dialogs.at(-1);
    }

    async function pickDialogOption(element: HTMLInputElement, value: string) {
      clickControl(element);
      await new Promise((resolve) => setTimeout(resolve, 220));
      const dialog = visibleDialog();
      if (!dialog) return false;
      const search = [...dialog.querySelectorAll<HTMLInputElement>("input")].filter(visible).find((input) => !input.disabled && !input.readOnly);
      if (search) {
        dispatchSearchValue(search, value);
        await new Promise((resolve) => setTimeout(resolve, 420));
      }
      const deadline = Date.now() + 3200;
      let option: HTMLElement | undefined;
      do {
        option = [...dialog.querySelectorAll<HTMLElement>("[role='option'], [role='treeitem'], li, td, a, [class*='item'], [class*='category']")]
          .filter(visible)
          .map((item) => ({ item, score: choiceMatchScore(textOf(item), value) }))
          .filter(({ score }) => score > 0)
          .sort((left, right) => right.score - left.score || textOf(left.item).length - textOf(right.item).length)[0]?.item;
        if (!option) await new Promise((resolve) => setTimeout(resolve, 140));
      } while (!option && Date.now() < deadline);
      if (!option) return false;
      clickControl(option);
      await new Promise((resolve) => setTimeout(resolve, 160));
      const confirm = [...dialog.querySelectorAll<HTMLButtonElement>("button")].filter(visible).find((button) => /^(选择|确定|确认)$/u.test(textOf(button)) && !button.disabled);
      if (!confirm) return false;
      clickControl(confirm);
      await new Promise((resolve) => setTimeout(resolve, 180));
      return true;
    }

    async function fillOne(match: FieldMatch) {
      const element = document.querySelector<HTMLElement>(`[data-zhitu-autofill-token="${CSS.escape(match.token)}"]`);
      if (!element) return { token: match.token, ok: false, message: "字段已从页面消失" };
      const kind = kindFor(element);
      const rawCurrent = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
        ? (kind === "checkbox" && element instanceof HTMLInputElement ? (element.checked ? element.value : "") : element.value)
        : element.textContent ?? "";
      const current = isEmptyPlaceholder(rawCurrent) ? "" : rawCurrent;
      if (current.trim()) return { token: match.token, ok: false, message: "字段已有内容" };
      try {
        if (kind === "select" && element instanceof HTMLSelectElement) {
          const normalized = match.value.replace(/\s+/g, "").toLowerCase();
          const option = [...element.options].find((item) => {
            const text = item.text.replace(/\s+/g, "").toLowerCase();
            return text === normalized || text.includes(normalized) || normalized.includes(text);
          });
          if (!option) throw new Error("下拉框没有对应选项");
          element.value = option.value;
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (kind === "radio" && element instanceof HTMLInputElement) {
          const radios = [...(radioGroupFor(element)?.querySelectorAll<HTMLInputElement>("input[type='radio']") ?? [element])];
          const normalized = match.value.replace(/\s+/g, "").toLowerCase();
          const radio = radios.find((item) => {
            const label = radioOptionLabel(item).replace(/\s+/g, "").toLowerCase();
            return label.includes(normalized) || normalized.includes(label) || item.value.toLowerCase() === normalized;
          });
          if (!radio) throw new Error("单选项中没有对应值");
          radio.click();
        } else if (kind === "checkbox" && element instanceof HTMLInputElement) {
          const label = labelFor(element).join(" ").replace(/\s+/g, "").toLowerCase();
          const normalized = match.value.replace(/\s+/g, "").toLowerCase();
          if (!label.includes(normalized) && !normalized.includes(label)) throw new Error("多选项与资料值不一致");
          if (!element.checked) element.click();
        } else if (kind === "combobox") {
          const picked = await pickCustomOption(element, match.value);
          if (!picked) throw new Error("下拉框中没有与资料值对应的选项");
        } else if (element instanceof HTMLInputElement && isDateControl(element, match.label)) {
          await fillDateControl(element, match.value, match.label);
        } else if (element instanceof HTMLInputElement && /(请选择.*(专业|学校)|选择专业|选择学校)/.test(`${match.label} ${element.placeholder}`)) {
          const picked = await pickDialogOption(element, match.value);
          if (!picked) throw new Error("弹窗中没有找到与资料一致的选项");
        } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          dispatchValue(element, match.value);
        } else if (element.isContentEditable) {
          element.focus();
          element.textContent = match.value;
          element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: match.value }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          element.blur();
        } else {
          throw new Error("暂不支持这个控件");
        }
        element.dataset.zhituFillState = match.reviewRequired ? "review" : "filled";
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        return { token: match.token, ok: true, message: match.reviewRequired ? "已填写，请复核" : "已填写" };
      } catch (error) {
        await closeTransientPopup(element);
        element.dataset.zhituFillState = "error";
        return { token: match.token, ok: false, message: error instanceof Error ? error.message : "填写失败" };
      }
    }

    async function fill(matches: FieldMatch[]) {
      const eligible = matches.filter((match) => match.confidence !== "skipped" && match.value && match.profilePath);
      const results = [];
      for (const match of eligible) results.push(await fillOne(match));
      return results;
    }

    const pageMessageListener = (message: PageMessage) => {
      if (message.type === "ZHITU_SCAN") return Promise.resolve({ fields: scan(), url: location.href, title: document.title });
      if (message.type === "ZHITU_FILL") return fill(message.matches);
      if (message.type === "ZHITU_MARK") return Promise.resolve(mark(message.matches));
      if (message.type === "ZHITU_CLEAR_MARKS") { clearMarkers(); return Promise.resolve({ cleared: true }); }
      return undefined;
    };
    browser.runtime.onMessage.addListener(pageMessageListener);

    let mutationTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      clearTimeout(mutationTimer);
      mutationTimer = setTimeout(() => {
        updateMarkerPositions();
        sendRuntimeMessage({ type: "ZHITU_PAGE_CHANGED", url: location.href });
      }, 700);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    const cleanup = () => {
      observer.disconnect();
      if (mutationTimer) clearTimeout(mutationTimer);
      window.removeEventListener("scroll", updateMarkerPositions, true);
      window.removeEventListener("resize", updateMarkerPositions);
      clearMarkers();
      try { browser.runtime.onMessage.removeListener(pageMessageListener); } catch { /* stale context */ }
      if (window.__zhituAutofillCleanup === cleanup) window.__zhituAutofillCleanup = undefined;
    };
    dispose = cleanup;
    window.__zhituAutofillCleanup = cleanup;
    return { ready: true, reused: false };
  },
});
