import type { QARequest, QAResponse } from "./types";

const BACKEND_URL = "http://localhost:3000/answer";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});

type ExtractResponse =
  | { ok: true; payload: QARequest }
  | { ok: false; error: string };

type AnswerActiveTabMessage = {
  type: "ANSWER_ACTIVE_TAB";
  tabId: number;
};

type SidePanelResult =
  | ({ ok: true } & QAResponse & { question: string; options: string[]; snippet: string | null })
  | { ok: false; error: string };

async function injectContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["dist/contentScript.js"],
  });
}

async function extractQuestion(tabId: number): Promise<QARequest> {
  const send = async (frameId?: number): Promise<ExtractResponse> => {
    if (frameId === undefined) {
      return (await chrome.tabs.sendMessage(tabId, {
        type: "EXTRACT_QUESTION",
      })) as unknown as ExtractResponse;
    }

    return (await chrome.tabs.sendMessage(
      tabId,
      { type: "EXTRACT_QUESTION" },
      { frameId }
    )) as unknown as ExtractResponse;
  };

  const frameIds: number[] = [0];
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    for (const frame of frames ?? []) {
      if (typeof frame.frameId === "number" && !frameIds.includes(frame.frameId)) {
        frameIds.push(frame.frameId);
      }
    }
  } catch {
    // If frame enumeration fails, continue with main frame only.
  }

  let lastError = "No visible question found on page.";

  for (const frameId of frameIds) {
    let extraction: ExtractResponse;
    try {
      extraction = await send(frameId);
    } catch {
      try {
        await new Promise((resolve) => setTimeout(resolve, 80));
        extraction = await send(frameId);
      } catch {
        continue;
      }
    }

    if (extraction?.ok) {
      return extraction.payload;
    }

    if (extraction?.error) {
      lastError = extraction.error;
    }
  }

  throw new Error(lastError || "Could not extract a question from this page.");
}

async function callBackend(payload: QARequest): Promise<QAResponse> {
  const response = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`);
  }

  return (await response.json()) as QAResponse;
}

chrome.runtime.onMessage.addListener((message: AnswerActiveTabMessage, _sender, sendResponse) => {
  if (message?.type !== "ANSWER_ACTIVE_TAB") {
    return;
  }

  (async () => {
    try {
      await injectContentScript(message.tabId);
      const payload = await extractQuestion(message.tabId);
      const answer = await callBackend(payload);

      sendResponse({
        ok: true,
        question: payload.question,
        options: payload.options ?? [],
        snippet: payload.context ?? null,
        answer: answer.answer,
        selectedOption: answer.selectedOption,
        confidence: answer.confidence,
      } satisfies SidePanelResult);
    } catch (error) {
      sendResponse({
        ok: false,
        error: (error as Error).message,
      } satisfies SidePanelResult);
    }
  })();

  return true;
});
