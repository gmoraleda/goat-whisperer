# 🐐 Goat Whisperer

Goat Whisperer is a Chrome Extension (Manifest V3) + Node.js backend MVP that reads visible questions from the active tab, sends them to an LLM, and displays:

- Question
- Question Snippet
- Options
- Correct Option
- Confidence

This project is tailored for quiz/test flows and can be used for tests on the Testlify platform.

## 🧱 Stack

- Chrome Extension MV3 (TypeScript)
- Node.js + Express (TypeScript)
- OpenAI Responses API (`gpt-5-mini` by default)

## 🗂️ Project Structure

- `extension/` Chrome extension source + manifest + side panel UI
- `backend/` API server with `POST /answer`

## ✅ Prerequisites

- Node.js 20+
- Google Chrome
- OpenAI API key with active billing

## ⚙️ Setup

```bash
npm install
npm run build
```

## 🚀 Run Backend

```bash
export OPENAI_API_KEY="your_key"
export OPENAI_MODEL="gpt-5-mini"
npm run start:backend
```

Backend runs at `http://localhost:3000`.

## 🧩 Load Extension

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select `/Users/gmoraleda/Developer/test-copilot/extension`
5. Click the extension action to open the side panel

## 🧪 How to Use

1. Open a Testlify question page (or any page with visible question/options)
2. Open Goat Whisperer side panel
3. Click `Answer questions`
4. Review the output fields in the panel

## 🔌 API Contract

### 📥 Request

```json
{
  "question": "string",
  "options": ["string"],
  "context": "string"
}
```

### 📤 Response

```json
{
  "answer": "string",
  "selectedOption": "string | null",
  "confidence": "low | medium | high"
}
```

## 📝 Notes

- If no `OPENAI_API_KEY` is present, backend returns conservative mock output.
- Extension reads only visible on-screen content.
- Side panel currently shows extracted question/snippet/options and model selection/confidence output.
