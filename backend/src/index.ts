import cors from "cors";
import express from "express";
import { answerWithLLM } from "./llm";
import type { QARequest, QAResponse } from "./types";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: "200kb" }));

function isValidRequest(body: unknown): body is QARequest {
  if (!body || typeof body !== "object") {
    return false;
  }

  const candidate = body as Partial<QARequest>;
  if (typeof candidate.question !== "string" || candidate.question.trim().length < 3) {
    return false;
  }

  if (
    candidate.options !== undefined &&
    (!Array.isArray(candidate.options) ||
      candidate.options.some((item) => typeof item !== "string" || item.trim().length === 0))
  ) {
    return false;
  }

  if (candidate.context !== undefined && typeof candidate.context !== "string") {
    return false;
  }

  return true;
}

app.post("/answer", async (req, res) => {
  if (!isValidRequest(req.body)) {
    return res.status(400).json({
      error: "Invalid request body",
      expected: {
        question: "string",
        options: "string[] (optional)",
        context: "string (optional)",
      },
    });
  }

  const payload: QARequest = {
    question: req.body.question.trim(),
    options: req.body.options,
    context: req.body.context?.trim() || undefined,
  };

  console.log("[POST /answer] Received question:");
  console.log(`- question: ${payload.question}`);
  if (payload.options && payload.options.length > 0) {
    console.log(`- options: ${JSON.stringify(payload.options)}`);
  } else {
    console.log("- options: []");
  }

  try {
    const result = await answerWithLLM(payload);
    const response: QAResponse = {
      answer: result.answer,
      selectedOption: result.selectedOption,
      confidence: result.confidence,
    };

    return res.json(response);
  } catch {
    const fallback: QAResponse = {
      answer: "Unable to generate a reliable answer right now.",
      selectedOption: null,
      confidence: "low",
    };
    return res.status(200).json(fallback);
  }
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
  console.log(`[Startup] OPENAI_API_KEY present: ${Boolean(process.env.OPENAI_API_KEY)}`);
  console.log(`[Startup] OPENAI_MODEL: ${process.env.OPENAI_MODEL || "gpt-5-mini"}`);
});
