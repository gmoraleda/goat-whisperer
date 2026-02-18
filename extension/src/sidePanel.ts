type SidePanelResult =
  | {
      ok: true;
      question: string;
      options: string[];
      snippet: string | null;
      selectedOption: string | null;
      confidence: "low" | "medium" | "high";
    }
  | { ok: false; error: string };

const answerBtn = document.getElementById("answerBtn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const questionEl = document.getElementById("question") as HTMLDivElement;
const snippetEl = document.getElementById("snippet") as HTMLDivElement;
const optionsEl = document.getElementById("options") as HTMLDivElement;
const selectedOptionEl = document.getElementById("selectedOption") as HTMLDivElement;
const confidenceEl = document.getElementById("confidence") as HTMLDivElement;

function setIdleUI(): void {
  statusEl.textContent = "Idle";
  questionEl.textContent = "-";
  snippetEl.textContent = "-";
  optionsEl.textContent = "-";
  selectedOptionEl.textContent = "-";
  confidenceEl.textContent = "-";
}

async function getActiveTabId(): Promise<number> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab?.id) {
    throw new Error("No active tab found.");
  }
  return activeTab.id;
}

answerBtn.addEventListener("click", async () => {
  answerBtn.disabled = true;
  statusEl.textContent = "Extracting question from page...";
  questionEl.textContent = "-";
  snippetEl.textContent = "-";
  optionsEl.textContent = "-";
  selectedOptionEl.textContent = "-";
  confidenceEl.textContent = "-";

  try {
    const tabId = await getActiveTabId();

    const result = (await chrome.runtime.sendMessage({
      type: "ANSWER_ACTIVE_TAB",
      tabId,
    })) as SidePanelResult;

    if (!result?.ok) {
      statusEl.textContent = result?.error || "Request failed.";
      return;
    }

    statusEl.textContent = "Answer generated.";
    questionEl.textContent = result.question;
    snippetEl.textContent = result.snippet ?? "(none)";
    optionsEl.textContent = result.options.length > 0 ? result.options.join("\n") : "(none)";
    selectedOptionEl.textContent = result.selectedOption ?? "null";
    confidenceEl.textContent = result.confidence;
  } catch (error) {
    statusEl.textContent = (error as Error).message;
  } finally {
    answerBtn.disabled = false;
  }
});

setIdleUI();
