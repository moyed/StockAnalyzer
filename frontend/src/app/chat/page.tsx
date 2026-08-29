"use client";
import { useState, useRef, useEffect, FormEvent } from "react";
import api from "@/lib/api";

type Role = "user" | "assistant";
type Message = { role: Role; text: string; ts: Date; usedWebSearch?: boolean };

const SUGGESTIONS = [
  "What are the top performing companies right now?",
  "Which sector has the highest average score?",
  "Show me Sharia-compliant stocks with high scores",
  "What does today's market briefing say?",
  "Is ENGRO a good investment?",
  "Compare cement sector companies",
];

function TypingDots() {
  return (
    <div className="flex items-center gap-1 h-5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-green-600 opacity-60 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  const formatted = msg.text
    .split("\n")
    .map((line, i) => {
      // Bold: **text**
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((chunk, j) =>
        chunk.startsWith("**") && chunk.endsWith("**") ? (
          <strong key={j}>{chunk.slice(2, -2)}</strong>
        ) : (
          chunk
        )
      );
      return (
        <span key={i} className="block leading-relaxed">
          {parts}
        </span>
      );
    });

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-green-700 text-white text-xs font-bold flex items-center justify-center mr-2 mt-0.5 shrink-0">
          AI
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
          isUser
            ? "bg-green-700 text-white rounded-br-sm"
            : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
        }`}
      >
        <div className="text-sm">{formatted}</div>
        <div className={`flex items-center gap-2 mt-1.5 ${isUser ? "justify-end" : ""}`}>
          {msg.usedWebSearch && (
            <span className="inline-flex items-center gap-1 text-xs text-blue-500 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              Web search used
            </span>
          )}
          <p className={`text-xs ${isUser ? "text-green-200" : "text-gray-400"}`}>
            {msg.ts.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-300 text-gray-600 text-xs font-bold flex items-center justify-center ml-2 mt-0.5 shrink-0">
          You
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", text: question, ts: new Date() },
    ]);
    setInput("");
    setLoading(true);

    try {
      const { data } = await api.post("/chat", { message: question });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.answer ?? "Sorry, I couldn't generate a response.", ts: new Date(), usedWebSearch: data.used_web_search },
      ]);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ??
        "Something went wrong. Please try again.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: msg, ts: new Date() },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const isEmpty = messages.length === 0 && !loading;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
      {/* Header */}
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold text-gray-900">AI Chat</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Ask anything about PSX companies, scores, sectors, or market trends
        </p>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto rounded-2xl bg-gray-50 border border-gray-200 px-4 py-4">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div>
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">💬</span>
              </div>
              <h2 className="text-lg font-semibold text-gray-800">
                Ask the PSX AI Analyst
              </h2>
              <p className="text-sm text-gray-500 mt-1 max-w-sm">
                Get instant answers about Pakistan Stock Exchange companies,
                financial scores, sector trends, and investment insights.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-xl">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-full hover:border-green-500 hover:text-green-700 transition-colors shadow-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <MessageBubble key={i} msg={m} />
            ))}
            {loading && (
              <div className="flex justify-start mb-4">
                <div className="w-8 h-8 rounded-full bg-green-700 text-white text-xs font-bold flex items-center justify-center mr-2 mt-0.5 shrink-0">
                  AI
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="mt-3 shrink-0">
        <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm focus-within:border-green-500 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about a company, sector, or market trend…"
            rows={1}
            disabled={loading}
            className="flex-1 resize-none outline-none text-sm text-gray-800 placeholder-gray-400 bg-transparent max-h-32 overflow-y-auto disabled:opacity-50"
            style={{ lineHeight: "1.5rem" }}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-xl bg-green-700 text-white flex items-center justify-center hover:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            aria-label="Send"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5 ml-1">
          Press Enter to send · Shift+Enter for new line · AI-generated analysis, not financial advice
        </p>
      </form>
    </div>
  );
}
