import { useEffect, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const AUTH_STORAGE_KEY = "tech-fault-rag-auth-token";

function splitAnswerAndCitations(answer) {
  const marker = /\nCitations\s*\n/i;
  const parts = answer.split(marker);

  if (parts.length < 2) {
    return {
      answerText: answer.trim(),
      citations: [],
    };
  }

  const [answerText, ...citationParts] = parts;
  const citationsBlock = citationParts.join("\n").trim();
  const citations = citationsBlock
    .split("\n")
    .map((line) => line.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\[Source\s+(\d+)\]\s*(.*)$/i);
      return {
        label: match ? `Source ${match[1]}` : "Source",
        source_number: match ? Number(match[1]) : null,
        detail: match ? match[2] : line,
      };
    });

  return {
    answerText: answerText.trim(),
    citations,
  };
}

function formatAnswerParagraphs(answerText) {
  return answerText
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, allLines) => line || allLines[index - 1])
    .map((line) => line || "\u00a0");
}

function getDisplayContent(message) {
  if (message.role !== "assistant") {
    return {
      answerText: message.content,
      citations: [],
    };
  }

  if (message.citations?.length) {
    const parsed = splitAnswerAndCitations(message.content);
    return {
      answerText: parsed.answerText,
      citations: message.citations,
    };
  }

  return splitAnswerAndCitations(message.content);
}

async function fetchJson(url, options = {}) {
  const { token, ...fetchOptions } = options;
  const headers = {
    ...(fetchOptions.headers ?? {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const errorBody = await response.json();
      if (typeof errorBody.detail === "string") {
        detail = errorBody.detail;
      }
    } catch {
      // Keep fallback detail.
    }

    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function App() {
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_STORAGE_KEY) ?? "");
  const [currentUser, setCurrentUser] = useState(null);
  const [question, setQuestion] = useState("");
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [error, setError] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function restoreSession() {
      if (!token) {
        setIsAuthLoading(false);
        return;
      }

      try {
        const data = await fetchJson(`${API_BASE_URL}/auth/me`, { token });
        setCurrentUser(data.user);
      } catch {
        clearSession();
      } finally {
        setIsAuthLoading(false);
      }
    }

    restoreSession();
  }, []);

  useEffect(() => {
    if (!token || !currentUser) {
      return;
    }

    async function bootstrapChats() {
      setIsBootstrapping(true);
      setError("");

      try {
        const data = await fetchJson(`${API_BASE_URL}/conversations`, { token });
        const loadedConversations = data.conversations;
        setConversations(loadedConversations);

        if (loadedConversations.length > 0) {
          await loadConversationMessages(token, loadedConversations[0].id, loadedConversations);
        } else {
          await handleCreateConversation(token);
        }
      } catch (requestError) {
        handleRequestError(
          requestError,
          "Something went wrong while loading chat history.",
        );
      } finally {
        setIsBootstrapping(false);
      }
    }

    bootstrapChats();
  }, [token, currentUser]);

  function handleRequestError(requestError, fallbackMessage) {
    if (requestError?.status === 401) {
      clearSession();
      setError("Your session expired. Please log in again.");
      return;
    }

    setError(
      requestError instanceof Error ? requestError.message : fallbackMessage,
    );
  }

  function persistSession(nextToken, user) {
    localStorage.setItem(AUTH_STORAGE_KEY, nextToken);
    setToken(nextToken);
    setCurrentUser(user);
    setError("");
  }

  function clearSession() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setToken("");
    setCurrentUser(null);
    setConversations([]);
    setActiveConversationId(null);
    setMessages([]);
    setDraftTitle("");
    setQuestion("");
  }

  async function loadConversationMessages(
    authToken,
    conversationId,
    conversationSnapshot = conversations,
  ) {
    setIsLoadingMessages(true);
    setError("");

    try {
      const data = await fetchJson(
        `${API_BASE_URL}/conversations/${conversationId}/messages`,
        { token: authToken },
      );
      setActiveConversationId(conversationId);
      setMessages(data.messages);
      setDraftTitle(data.conversation.title);
      setConversations(
        conversationSnapshot.map((conversation) =>
          conversation.id === conversationId ? data.conversation : conversation,
        ),
      );
    } catch (requestError) {
      handleRequestError(
        requestError,
        "Something went wrong while loading the conversation.",
      );
    } finally {
      setIsLoadingMessages(false);
    }
  }

  async function handleCreateConversation(authToken = token) {
    setError("");

    try {
      const conversation = await fetchJson(`${API_BASE_URL}/conversations`, {
        method: "POST",
        token: authToken,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "New chat",
        }),
      });

      setConversations((currentConversations) => [conversation, ...currentConversations]);
      setActiveConversationId(conversation.id);
      setMessages([]);
      setDraftTitle(conversation.title);
      setQuestion("");
      return conversation;
    } catch (requestError) {
      handleRequestError(
        requestError,
        "Something went wrong while creating a conversation.",
      );
      return null;
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();

    if (!authForm.email.trim() || !authForm.password) {
      setError("Email and password are required.");
      return;
    }

    setIsSubmittingAuth(true);
    setError("");

    try {
      const data = await fetchJson(`${API_BASE_URL}/auth/${authMode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: authForm.email,
          password: authForm.password,
        }),
      });

      persistSession(data.access_token, data.user);
      setAuthForm({ email: "", password: "" });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Something went wrong during authentication.",
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isSending) {
      return;
    }

    setIsSending(true);
    setError("");

    try {
      let conversationId = activeConversationId;

      if (!conversationId) {
        const conversation = await handleCreateConversation();
        conversationId = conversation?.id ?? null;
      }

      if (!conversationId) {
        throw new Error("Unable to create a conversation.");
      }

      const data = await fetchJson(
        `${API_BASE_URL}/conversations/${conversationId}/messages`,
        {
          method: "POST",
          token,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: trimmedQuestion,
            top_k: 5,
          }),
        },
      );

      setQuestion("");
      setActiveConversationId(conversationId);
      setMessages((currentMessages) => [
        ...currentMessages,
        data.user_message,
        data.assistant_message,
      ]);
      setConversations((currentConversations) => {
        const filteredConversations = currentConversations.filter(
          (conversation) => conversation.id !== data.conversation.id,
        );
        return [data.conversation, ...filteredConversations];
      });
      setDraftTitle(data.conversation.title);
    } catch (requestError) {
      handleRequestError(
        requestError,
        "Something went wrong while sending the message.",
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleRenameConversation(event) {
    event.preventDefault();

    if (!activeConversationId || isRenaming) {
      return;
    }

    const trimmedTitle = draftTitle.trim() || "New chat";
    setIsRenaming(true);
    setError("");

    try {
      const updatedConversation = await fetchJson(
        `${API_BASE_URL}/conversations/${activeConversationId}`,
        {
          method: "PATCH",
          token,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: trimmedTitle,
          }),
        },
      );

      setDraftTitle(updatedConversation.title);
      setConversations((currentConversations) =>
        currentConversations.map((conversation) =>
          conversation.id === updatedConversation.id
            ? updatedConversation
            : conversation,
        ),
      );
    } catch (requestError) {
      handleRequestError(
        requestError,
        "Something went wrong while renaming the conversation.",
      );
    } finally {
      setIsRenaming(false);
    }
  }

  async function handleDeleteConversation() {
    if (!activeConversationId || isDeleting) {
      return;
    }

    setIsDeleting(true);
    setError("");

    try {
      await fetchJson(`${API_BASE_URL}/conversations/${activeConversationId}`, {
        method: "DELETE",
        token,
      });

      const remainingConversations = conversations.filter(
        (conversation) => conversation.id !== activeConversationId,
      );

      setConversations(remainingConversations);
      setMessages([]);
      setQuestion("");

      if (remainingConversations.length > 0) {
        await loadConversationMessages(token, remainingConversations[0].id, remainingConversations);
      } else {
        setActiveConversationId(null);
        setDraftTitle("");
        await handleCreateConversation();
      }
    } catch (requestError) {
      handleRequestError(
        requestError,
        "Something went wrong while deleting the conversation.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );

  if (isAuthLoading) {
    return (
      <div className="app-shell">
        <div className="auth-card">
          <p>Loading your session...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="app-shell auth-shell">
        <section className="auth-card">
          <p className="eyebrow">Multi-User Access</p>
          <h1>Tech Fault RAG Bot</h1>
          <p className="auth-copy">
            Sign in to keep your conversations private and separate from other users.
          </p>

          <div className="auth-toggle">
            <button
              className={authMode === "login" ? "auth-tab active" : "auth-tab"}
              onClick={() => setAuthMode("login")}
              type="button"
            >
              Log in
            </button>
            <button
              className={authMode === "signup" ? "auth-tab active" : "auth-tab"}
              onClick={() => setAuthMode("signup")}
              type="button"
            >
              Sign up
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="title-input"
              onChange={(event) =>
                setAuthForm((current) => ({ ...current, email: event.target.value }))
              }
              type="email"
              value={authForm.email}
            />

            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="title-input"
              onChange={(event) =>
                setAuthForm((current) => ({ ...current, password: event.target.value }))
              }
              type="password"
              value={authForm.password}
            />

            {error ? <p className="error-banner">{error}</p> : null}

            <button className="submit-button auth-submit" disabled={isSubmittingAuth} type="submit">
              {isSubmittingAuth
                ? authMode === "login"
                  ? "Logging in..."
                  : "Creating account..."
                : authMode === "login"
                  ? "Log in"
                  : "Create account"}
            </button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="workspace">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div>
              <p className="eyebrow">Saved Chats</p>
              <h1>Tech Fault RAG Bot</h1>
              <p className="sidebar-user">{currentUser.email}</p>
            </div>
            <div className="sidebar-actions">
              <button
                className="new-chat-button"
                onClick={() => handleCreateConversation()}
                type="button"
              >
                New chat
              </button>
              <button className="secondary-button" onClick={clearSession} type="button">
                Log out
              </button>
            </div>
          </div>

          <div className="conversation-list">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={
                  conversation.id === activeConversationId
                    ? "conversation-item active"
                    : "conversation-item"
                }
                onClick={() => loadConversationMessages(token, conversation.id)}
                type="button"
              >
                <span className="conversation-title">{conversation.title}</span>
                <span className="conversation-meta">
                  {new Date(conversation.updated_at).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="chat-panel">
          <header className="chat-header">
            <div>
              <p className="eyebrow">Conversation</p>
              <h2>{activeConversation?.title ?? "Loading..."}</h2>
            </div>
            <p className="hero-copy">
              Ask troubleshooting questions and keep each answer, citation, and
              retrieved source in your own saved thread.
            </p>
          </header>

          <form className="conversation-toolbar" onSubmit={handleRenameConversation}>
            <div className="toolbar-field">
              <label className="field-label" htmlFor="conversation-title">
                Conversation title
              </label>
              <input
                id="conversation-title"
                className="title-input"
                disabled={!activeConversation || isRenaming || isDeleting}
                onChange={(event) => setDraftTitle(event.target.value)}
                value={draftTitle}
              />
            </div>
            <div className="toolbar-actions">
              <button
                className="secondary-button"
                disabled={!activeConversation || isRenaming || isDeleting}
                type="submit"
              >
                {isRenaming ? "Saving..." : "Rename"}
              </button>
              <button
                className="danger-button"
                disabled={!activeConversation || isDeleting || isRenaming}
                onClick={handleDeleteConversation}
                type="button"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </form>

          {error ? <p className="error-banner">{error}</p> : null}

          <div className="message-thread">
            {isBootstrapping || isLoadingMessages ? (
              <div className="empty-state">
                <p>Loading conversation history...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="empty-state">
                <p>No messages yet. Ask your first troubleshooting question.</p>
              </div>
            ) : (
              messages.map((message) => {
                const display = getDisplayContent(message);

                return (
                  <article
                    className={
                      message.role === "user"
                        ? "message-card user-message"
                        : "message-card assistant-message"
                    }
                    key={message.id}
                  >
                    <div className="message-label">
                      {message.role === "user" ? "You" : "Assistant"}
                    </div>
                    <div className="message-body">
                      {formatAnswerParagraphs(display.answerText).map((line, index) => (
                        <p key={`${message.id}-${index}`}>{line}</p>
                      ))}
                    </div>

                    {message.role === "assistant" && display.citations.length ? (
                      <div className="citations-panel">
                        <div className="citations-header">
                          <h3>Used Sources</h3>
                          <span>{display.citations.length} cited</span>
                        </div>
                        <div className="citation-list">
                          {display.citations.map((citation, index) => {
                            const chunk =
                              citation.source_number != null
                                ? message.retrieved_chunks[citation.source_number - 1]
                                : null;

                            return (
                              <div className="citation-item" key={`${message.id}-${index}`}>
                                <div className="citation-badge">{citation.label}</div>
                                <div className="citation-content">
                                  <p>{citation.detail}</p>
                                  {chunk ? (
                                    <p className="citation-meta">
                                      Matches retrieved chunk from {chunk.source},
                                      {" "}page {chunk.page}, chunk {chunk.chunk_index}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {message.role === "assistant" && message.retrieved_chunks.length ? (
                      <div className="source-section">
                        <div className="citations-header">
                          <h3>Retrieved Chunks</h3>
                          <span>{message.retrieved_chunks.length} sources</span>
                        </div>
                        <div className="chunk-list">
                          {message.retrieved_chunks.map((chunk, index) => (
                            <details className="chunk-item" key={`${message.id}-${index}`}>
                              <summary>
                                Source {index + 1}: {chunk.source} | page {chunk.page} |
                                {" "}chunk {chunk.chunk_index}
                              </summary>
                              <p>{chunk.text}</p>
                            </details>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="question">
              Troubleshooting question
            </label>
            <textarea
              id="question"
              className="question-input"
              rows="4"
              placeholder="Example: Why would a cable modem stay stuck in ranging?"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <button className="submit-button" disabled={isSending} type="submit">
              {isSending ? "Sending..." : "Send"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

export default App;
