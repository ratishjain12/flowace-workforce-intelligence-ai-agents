/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { sendChatQuery } from "../api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  confidence?: number;
  rowCount?: number;
  dateRange?: string;
  timestamp: Date;
  isGeneralQuery?: boolean;
}

const EXAMPLE_QUERIES = [
  "What was the average productivity rate last week?",
  "How many total hours were worked last month?",
  "What are the top 5 most used applications?",
  "Show productivity trends for the last 7 days",
  "Compare productive vs unproductive time this week",
  "Which team has the highest productivity?",
  "What are the most used apps by Engineering team?",
];

const SESSION_STORAGE_KEY = "chat_session";

export default function Chat() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat session from localStorage on mount
  useEffect(() => {
    const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        const restoredMessages = parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        }));
        setMessages(restoredMessages);
      } catch (error) {
        console.error("Failed to restore chat session:", error);
      }
    }
  }, []);

  // Save chat session to localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(messages));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generateId = () => Math.random().toString(36).substring(7);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    const userMessage = query.trim();
    setQuery("");

    const userMsg: ChatMessage = {
      id: generateId(),
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      // Send query with conversation context (last 10 messages for better context)
      const conversationContext = messages
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await sendChatQuery(userMessage, conversationContext);

      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: response.answer,
        sql: response.explanation?.sql,
        confidence: response.confidence,
        rowCount: response.explanation?.rowCount,
        dateRange: response.explanation?.dateRange,
        timestamp: new Date(),
        isGeneralQuery: response.isGeneralQuery,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: `I encountered an error processing your request. Please try rephrasing your question or try one of the example queries.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
  };

  const handleClearChat = () => {
    if (showClearConfirm) {
      setMessages([]);
      setShowClearConfirm(false);
    } else {
      setShowClearConfirm(true);
    }
  };

  const handleCancelClear = () => {
    setShowClearConfirm(false);
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      return `${hours}h ago`;
    }
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="chat-container">
      <div className="chat-sidebar">
        <div className="sidebar-header">
          <h3>Example Queries</h3>
          <button
            className={`btn-clear ${showClearConfirm ? "confirm-mode" : ""}`}
            onClick={handleClearChat}
            disabled={messages.length === 0}
          >
            {showClearConfirm ? "Confirm?" : "Clear Chat"}
          </button>
          {showClearConfirm && (
            <button className="btn-cancel" onClick={handleCancelClear}>
              Cancel
            </button>
          )}
        </div>
        <ul>
          {EXAMPLE_QUERIES.map((example, i) => (
            <li key={i} onClick={() => handleExampleClick(example)}>
              {example}
            </li>
          ))}
        </ul>
        <div className="sidebar-tips">
          <h4>Tips</h4>
          <ul>
            <li>Ask about productivity, hours, or apps</li>
            <li>Specify time periods (last week, this month)</li>
            <li>Compare teams or time periods</li>
            <li>Ask follow-up questions for more details</li>
            <li>Chat history is preserved automatically</li>
          </ul>
        </div>
      </div>

      <div className="chat-main">
        <div className="messages">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">💬</div>
              <h3>Workforce Intelligence Assistant</h3>
              <p>
                Ask questions about productivity, time tracking, and application
                usage. I can also help with general questions about the platform.
              </p>
              <p className="hint">
                Click an example query or type your own question below.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.role}`}>
              <div className="message-header">
                <span className="message-role">
                  {msg.role === "user" ? "You" : "AI Assistant"}
                </span>
                <span className="message-time">
                  {formatTimestamp(msg.timestamp)}
                </span>
              </div>
              <div className="message-content">
                {msg.role === "assistant" ? (
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
              {msg.sql && !msg.isGeneralQuery && (
                <details className="sql-details">
                  <summary>
                    <span className="sql-toggle">View SQL Query</span>
                    <span className="sql-meta">
                      {msg.rowCount !== undefined && `${msg.rowCount} rows`}
                      {msg.dateRange &&
                        msg.dateRange !== "Not specified" &&
                        ` • ${msg.dateRange}`}
                      {msg.confidence !== undefined &&
                        ` • ${(msg.confidence * 100).toFixed(0)}% confidence`}
                    </span>
                  </summary>
                  <pre>{msg.sql}</pre>
                </details>
              )}
              {msg.isGeneralQuery && (
                <div className="general-query-badge">💬 General Conversation</div>
              )}
            </div>
          ))}

          {loading && (
            <div className="message assistant">
              <div className="message-header">
                <span className="message-role">AI Assistant</span>
              </div>
              <div className="message-content loading">
                <div className="loading-animation">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                Analyzing your question...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="chat-input">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a question about workforce data or say hello..."
            disabled={loading}
            autoComplete="off"
          />
          <button type="submit" disabled={loading || !query.trim()}>
            {loading ? (
              <span className="btn-loading">
                <span className="btn-spinner"></span>
              </span>
            ) : (
              <span className="btn-send">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
