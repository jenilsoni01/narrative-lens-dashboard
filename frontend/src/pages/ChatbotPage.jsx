import { useEffect, useMemo, useRef, useState } from "react";
import { apiPost } from "../api/client";

const starterPrompts = [
  "What narrative themes spiked around AI ethics?",
  "Show posts that discuss misinformation and trust.",
  "Which authors were most active in the latest trend?",
  "What shifted after the biggest engagement peak?",
];

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatAnswer(answer) {
  const raw = String(answer || "").trim();
  if (!raw) return [];

  const normalized = raw.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const blocks = [];
  let current = [];

  for (const line of lines) {
    if (!line.trim()) {
      if (current.length) {
        blocks.push(current.join("\n").trim());
        current = [];
      }
      continue;
    }
    current.push(line);
  }

  if (current.length) {
    blocks.push(current.join("\n").trim());
  }

  return blocks.length ? blocks : [raw];
}

function summarizeContextEntry(entry) {
  if (!entry) return null;
  if (typeof entry === "string") {
    const match = entry.match(/^\[@([^\]]+) on ([^\]]+)\]\s*(.*)$/s);
    if (!match) {
      return {
        author: "unknown",
        createdAt: "N/A",
        excerpt: entry,
        likes: null,
      };
    }

    return {
      author: match[1],
      createdAt: match[2],
      excerpt: match[3],
      likes: null,
    };
  }

  return {
    author: entry.author || "unknown",
    createdAt: entry.created_at || entry.createdAt || "N/A",
    excerpt: entry.excerpt || entry.text || "",
    likes: entry.likes ?? null,
  };
}

export default function ChatbotPage() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Ask a question and I’ll retrieve the most relevant posts, then answer using only that context.",
      context: [],
      followups: starterPrompts.slice(0, 3),
      llmAvailable: false,
      status: "done",
    },
  ]);
  const [activeMessageId, setActiveMessageId] = useState("welcome");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  const activeAssistantMessage = useMemo(() => {
    const active = messages.find((message) => message.id === activeMessageId);
    if (active?.role === "assistant") return active;

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return messages[i];
    }

    return messages[0] || null;
  }, [activeMessageId, messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function onAsk(event) {
    event.preventDefault();
    await submitQuestion(question);
  }

  async function submitQuestion(rawQuestion) {
    const normalizedQuestion = String(rawQuestion || "").trim();
    setError("");

    if (normalizedQuestion.length < 3) {
      setError("Question must be at least 3 characters.");
      return;
    }

    const userMessageId = createId();
    const assistantMessageId = createId();

    setQuestion("");
    setLoading(true);
    setMessages((currentMessages) => [
      ...currentMessages,
      { id: userMessageId, role: "user", content: normalizedQuestion },
      {
        id: assistantMessageId,
        role: "assistant",
        content: "Searching for relevant posts and building the answer...",
        context: [],
        followups: [],
        llmAvailable: false,
        status: "loading",
      },
    ]);
    setActiveMessageId(assistantMessageId);

    try {
      const payload = await apiPost("/chat", { question: normalizedQuestion });
      const assistantMessage = {
        id: assistantMessageId,
        role: "assistant",
        content:
          payload.answer ||
          "No answer was returned for this question. Try a broader prompt or follow-up.",
        context: Array.isArray(payload.context) ? payload.context : [],
        followups: Array.isArray(payload.followups) ? payload.followups : [],
        llmAvailable: Boolean(payload.llm_available),
        status: "done",
      };

      setMessages((currentMessages) =>
        currentMessages.map((message) => (message.id === assistantMessageId ? assistantMessage : message))
      );
    } catch (err) {
      const message = err?.message || "Request failed";
      setError(message);
      setMessages((currentMessages) =>
        currentMessages.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: `I could not complete the request. ${message}`,
                status: "error",
              }
            : item
        )
      );
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Ask a question and I’ll retrieve the most relevant posts, then answer using only that context.",
        context: [],
        followups: starterPrompts.slice(0, 3),
        llmAvailable: false,
        status: "done",
      },
    ]);
    setActiveMessageId("welcome");
    setQuestion("");
    setError("");
    setLoading(false);
  }

  function handlePromptClick(prompt) {
    setQuestion(prompt);
    submitQuestion(prompt);
  }

  return (
    <section className="chat-page">
      <div className="overview-header chat-header">
        <div>
          <h2>RAG Chatbot</h2>
          <p className="muted">
            Ask in plain language. The assistant retrieves context, answers from the evidence, and suggests next steps.
          </p>
        </div>
        <div className="chat-header-actions">
          <span className={`status-pill ${loading ? "status-loading" : "status-ready"}`}>
            {loading ? "Thinking" : "Ready"}
          </span>
          <button type="button" className="ghost-button" onClick={clearChat} disabled={loading && messages.length <= 1}>
            New chat
          </button>
        </div>
      </div>

      <div className="chat-shell">
        <article className="chart-card chat-thread">
          <div className="chat-messages" aria-live="polite" aria-relevant="additions text">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-message chat-message-${message.role}`}
                onClick={() => message.role === "assistant" && setActiveMessageId(message.id)}
                role={message.role === "assistant" ? "button" : undefined}
                tabIndex={message.role === "assistant" ? 0 : undefined}
                onKeyDown={(event) => {
                  if (message.role === "assistant" && (event.key === "Enter" || event.key === " ")) {
                    setActiveMessageId(message.id);
                  }
                }}
              >
                <div className="chat-avatar">{message.role === "user" ? "You" : "AI"}</div>
                <div className="chat-bubble-wrap">
                  <div className={`chat-bubble chat-bubble-${message.role}`}>
                    {message.role === "assistant" ? (
                      <div className="chat-answer-body">
                        {formatAnswer(message.content).map((block, index) => {
                          const bulletLines = block
                            .split("\n")
                            .map((line) => line.trim())
                            .filter(Boolean)
                            .filter((line) => /^[-*•]|^\d+[.)]/.test(line));

                          if (bulletLines.length > 0) {
                            return (
                              <ul className="answer-list" key={`${message.id}-block-${index}`}>
                                {bulletLines.map((line) => (
                                  <li key={`${message.id}-${index}-${line}`}>{line.replace(/^[-*•]\s*|^\d+[.)]\s*/, "")}</li>
                                ))}
                              </ul>
                            );
                          }

                          return <p key={`${message.id}-block-${index}`}>{block}</p>;
                        })}
                      </div>
                    ) : (
                      <p>{message.content}</p>
                    )}
                  </div>
                  {message.role === "assistant" && (
                    <div className="chat-message-meta">
                      <span>{message.status === "loading" ? "Retrieving context" : "Assistant reply"}</span>
                      <span>{message.llmAvailable ? "LLM on" : "Fallback mode"}</span>
                      <span>{message.context?.length || 0} source docs</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form onSubmit={onAsk} className="chat-composer">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!loading) onAsk(event);
                }
              }}
              placeholder="Ask about a topic, author, event, or narrative shift..."
              rows={3}
              disabled={loading}
            />
            <div className="chat-composer-actions">
              <p className="muted composer-hint">Enter to send. Shift+Enter for a new line.</p>
              <button type="submit" disabled={loading}>
                {loading ? "Asking..." : "Send"}
              </button>
            </div>
          </form>

          {error && <p className="error chat-error">{error}</p>}
        </article>

        <aside className="chart-card chat-sidebar">
          <div className="chat-sidebar-section">
            <h3>Suggested Prompts</h3>
            <div className="followup-chips">
              {(activeAssistantMessage?.followups?.length ? activeAssistantMessage.followups : starterPrompts).map(
                (prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="chip"
                    onClick={() => handlePromptClick(prompt)}
                    disabled={loading}
                  >
                    {prompt}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="chat-sidebar-section">
            <h3>Retrieved Context</h3>
            {!activeAssistantMessage?.context?.length ? (
              <p className="muted">Retrieved posts will appear here after a response comes back.</p>
            ) : (
              <div className="chat-context-list">
                {activeAssistantMessage.context.map((doc, index) => {
                  const source = summarizeContextEntry(doc);
                  return (
                    <article key={`${activeAssistantMessage.id}-${index}`} className="source-card">
                      <div className="source-header">
                        <span className="source-index">Doc {index + 1}</span>
                        <span className="source-meta">@{source?.author || "unknown"}</span>
                      </div>
                      <div className="source-submeta">
                        <span>{source?.createdAt || "N/A"}</span>
                        {source?.likes !== null && <span>{Number(source.likes).toLocaleString()} likes</span>}
                      </div>
                      <p>{source?.excerpt || "No excerpt available."}</p>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <div className="chat-sidebar-section">
            <h3>Conversation State</h3>
            <p className="muted">
              Messages: {messages.length} | Current source set: {activeAssistantMessage?.context?.length || 0}
            </p>
            <p className="muted">
              {activeAssistantMessage?.llmAvailable ? "LLM available for answers." : "Fallback responses are active."}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
