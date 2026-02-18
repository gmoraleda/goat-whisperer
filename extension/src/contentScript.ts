(() => {
type QARequest = {
  question: string;
  options?: string[];
  context?: string;
};

function isVisibleOnScreen(element: Element): boolean {
  const style = window.getComputedStyle(element as HTMLElement);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitVisibleLines(el: Element): string[] {
  if (!isVisibleOnScreen(el)) return [];
  const raw = el instanceof HTMLElement ? el.innerText : el.textContent ?? "";
  return raw
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .filter((line) => line.length > 0);
}

function cleanOptionText(text: string): string {
  return normalizeText(text.replace(/\s*Press\s+\d+\s*$/i, "").replace(/\bPress\s+\d+\b/gi, ""));
}

function isBoilerplateLine(line: string): boolean {
  const l = line.toLowerCase();
  if (l === "question" || l === "practice round" || l === "select one") return true;
  if (/^question\s+\d+/i.test(line)) return true;
  if (/^press\s+\d+$/i.test(line)) return true;
  return false;
}

function extractOptions(): string[] {
  const options = new Set<string>();

  const choiceInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')
  );

  for (const input of choiceInputs) {
    if (input.id) {
      const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (label && isVisibleOnScreen(label)) {
        const labelLines = splitVisibleLines(label).map(cleanOptionText).filter((v) => v.length > 0);
        for (const line of labelLines) {
          if (!isBoilerplateLine(line)) options.add(line);
        }
      }
    }

    const aria = cleanOptionText(input.getAttribute("aria-label") ?? "");
    if (aria) options.add(aria);

    const wrappedLabel = input.closest("label");
    if (wrappedLabel && isVisibleOnScreen(wrappedLabel)) {
      const wrappedLines = splitVisibleLines(wrappedLabel)
        .map(cleanOptionText)
        .filter((v) => v.length > 0 && !isBoilerplateLine(v));
      for (const line of wrappedLines) options.add(line);
    }
  }

  return Array.from(options).filter((v) => v.length >= 2 && v.length <= 160);
}

function extractQuestion(options: string[]): string {
  const optionSet = new Set(options.map((v) => v.toLowerCase()));

  let containerCandidates: Element[] = [];
  try {
    // Avoid CSS4 case-insensitive selector flags that can throw in some frame contexts.
    containerCandidates = Array.from(
      document.querySelectorAll(
        '[id*="question"], [id*="Question"], [class*="question"], [class*="Question"], main, article, section, form, [role="main"]'
      )
    ).filter((el) => isVisibleOnScreen(el));
  } catch {
    containerCandidates = Array.from(document.querySelectorAll("main, article, section, form, [role=\"main\"]"))
      .filter((el) => isVisibleOnScreen(el));
  }

  const scoreLine = (line: string): number => {
    let score = 0;
    if (line.includes("?")) score += 3;
    if (/fill in the blank|correct option|choose|select/i.test(line)) score += 2;
    if (/\b(question|answer|practice round)\b/i.test(line)) score -= 2;
    if (/\bpress\s+\d+\b/i.test(line)) score -= 4;
    if (optionSet.has(line.toLowerCase())) score -= 5;
    score += Math.min(line.length / 40, 3);
    return score;
  };

  let best = "";
  let bestScore = -Infinity;

  for (const container of containerCandidates) {
    const lines = splitVisibleLines(container)
      .map((line) => normalizeText(line))
      .filter((line) => line.length >= 12)
      .filter((line) => !isBoilerplateLine(line));

    for (const line of lines) {
      const s = scoreLine(line);
      if (s > bestScore) {
        bestScore = s;
        best = line;
      }
    }
  }

  if (best) return best;

  const fallback = Array.from(document.querySelectorAll("h1, h2, h3, h4, legend, label"))
    .filter((el) => isVisibleOnScreen(el))
    .map((el) => normalizeText(el.textContent ?? ""))
    .filter((line) => line.length >= 12 && !isBoilerplateLine(line) && !optionSet.has(line.toLowerCase()));

  return fallback[0] ?? "";
}

function extractContext(question: string): string | undefined {
  const codeBlocks = Array.from(document.querySelectorAll("pre, code"))
    .filter((el) => isVisibleOnScreen(el))
    .map((el) => normalizeText(el.textContent ?? ""))
    .filter((text) => text.length > 0);

  if (codeBlocks.length === 0) return undefined;

  const nearest = codeBlocks.find((block) => block.length > 10 && block !== question);
  return nearest;
}

function extractPayload(): QARequest | null {
  const options = extractOptions();
  const question = extractQuestion(options);
  if (!question) return null;

  const context = extractContext(question);
  return {
    question,
    options: options.length > 0 ? options : undefined,
    context,
  };
}

const LISTENER_FLAG = "__qa_mvp_listener_registered__";
const pageWindow = window as Window & { [LISTENER_FLAG]?: boolean };

if (!pageWindow[LISTENER_FLAG]) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "EXTRACT_QUESTION") return;

    try {
      const payload = extractPayload();
      if (!payload) {
        sendResponse({ ok: false, error: "No visible question found on page." });
        return;
      }
      sendResponse({ ok: true, payload });
    } catch (error) {
      sendResponse({ ok: false, error: (error as Error).message });
    }
  });

  pageWindow[LISTENER_FLAG] = true;
}
})();
