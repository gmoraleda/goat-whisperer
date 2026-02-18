import type { QARequest, QAResponse } from "./types";
import { SYSTEM_PROMPT } from "./prompt";

function keyFingerprint(key: string): string {
  if (key.length <= 10) return "[short-key]";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function safeParseLLMJson(raw: string): QAResponse | null {
  try {
    const parsed = JSON.parse(raw) as Partial<QAResponse>;
    if (
      typeof parsed.answer !== "string" ||
      !(parsed.confidence === "low" || parsed.confidence === "medium" || parsed.confidence === "high")
    ) {
      return null;
    }

    const selectedOption =
      parsed.selectedOption === null || typeof parsed.selectedOption === "string"
        ? parsed.selectedOption
        : null;

    return {
      answer: parsed.answer,
      selectedOption,
      confidence: parsed.confidence,
    };
  } catch {
    return null;
  }
}

function extractResponseText(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }

  const top = data as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string; json?: unknown }>;
    }>;
  };

  if (typeof top.output_text === "string" && top.output_text.trim().length > 0) {
    return top.output_text;
  }

  const chunks: string[] = [];
  for (const item of top.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      } else if (content.json !== undefined) {
        chunks.push(JSON.stringify(content.json));
      }
    }
  }

  return chunks.join("\n").trim();
}

function buildMockResponse(input: QARequest): QAResponse {
  const prefix = input.context ? `Context: ${input.context}. ` : "";

  if (input.options && input.options.length > 0) {
    return {
      answer:
        `${prefix}I cannot confidently choose an option from the available page content.` +
        " Please review the options manually.",
      selectedOption: null,
      confidence: "low",
    };
  }

  return {
    answer:
      `${prefix}I do not have enough reliable page information to answer this confidently.` +
      "",
    selectedOption: null,
    confidence: "low",
  };
}

export async function answerWithLLM(input: QARequest): Promise<QAResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[LLM] OPENAI_API_KEY is missing. Using mock response.");
    return buildMockResponse(input);
  }

  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  const project = process.env.OPENAI_PROJECT;
  console.log(`[LLM] Calling OpenAI with model: ${model}`);
  console.log(`[LLM] Using key: ${keyFingerprint(apiKey)} project: ${project || "(default)"}`);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (project) {
    headers["OpenAI-Project"] = project;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: SYSTEM_PROMPT }],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(input),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "qa_answer",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              answer: { type: "string" },
              selectedOption: { type: ["string", "null"] },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["answer", "selectedOption", "confidence"],
          },
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const requestId = response.headers.get("x-request-id") || "(none)";
    console.error(`[LLM] OpenAI error ${response.status} request_id=${requestId}: ${errorBody}`);

    if (response.status === 429 && errorBody.includes("insufficient_quota")) {
      return {
        answer:
          "OpenAI quota exceeded. The backend is connected, but billing/quota must be increased before generating real answers.",
        selectedOption: null,
        confidence: "low",
      };
    }

    return buildMockResponse(input);
  }

  const data = (await response.json()) as unknown;
  const requestId = response.headers.get("x-request-id") || "(none)";
  console.log(`[LLM] OpenAI request succeeded. request_id=${requestId}`);
  const rawText = extractResponseText(data);
  const parsed = safeParseLLMJson(rawText);
  if (!parsed) {
    console.warn("[LLM] Could not parse OpenAI JSON output. Falling back to mock response.");
  }
  return parsed ?? buildMockResponse(input);
}
