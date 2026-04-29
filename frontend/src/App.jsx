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
  const [menuOpenId, setMenuOpenId] = useState(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClick() {
      setMenuOpenId(null);
    }
    if (menuOpenId !== null) {
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
    }
  }, [menuOpenId]);

  async function renameConversation(conversationId, title) {
    if (!conversationId || isRenaming) {
      return;
    }

    const trimmedTitle = title.trim() || "New chat";
    setIsRenaming(true);
    setError("");

    try {
      const updatedConversation = await fetchJson(
        `${API_BASE_URL}/conversations/${conversationId}`,
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

      if (updatedConversation.id === activeConversationId) {
        setDraftTitle(updatedConversation.title);
      }
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

  async function deleteConversation(conversationId) {
    if (!conversationId || isDeleting) {
      return;
    }

    setIsDeleting(true);
    setError("");

    try {
      await fetchJson(`${API_BASE_URL}/conversations/${conversationId}`, {
        method: "DELETE",
        token,
      });

      const remainingConversations = conversations.filter(
        (conversation) => conversation.id !== conversationId,
      );

      setConversations(remainingConversations);

      if (conversationId !== activeConversationId) {
        return;
      }

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

  function handleRenameConversationMenu(conversation) {
    setMenuOpenId(null);
    const newTitle = prompt("Enter new title:", conversation.title);
    if (newTitle && newTitle.trim()) {
      renameConversation(conversation.id, newTitle);
    }
  }

  function handleDeleteConversationMenu(conversation) {
    setMenuOpenId(null);
    deleteConversation(conversation.id);
  }

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
        // Do NOT auto-load any conversation. Just show empty state.
        setActiveConversationId(null);
        setMessages([]);
        setDraftTitle("");
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
    await renameConversation(activeConversationId, draftTitle);
  }

  async function handleDeleteConversation() {
    await deleteConversation(activeConversationId);
  }

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );

  function renderComposer(className = "composer") {
    return (
      <form className={className} onSubmit={handleSubmit}>
        <div className="composer-inner">
          <textarea
            id="question"
            className="question-input"
            rows="1"
            placeholder="Send a message..."
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSubmit(event);
              }
            }}
          />
          <button 
            className="submit-button" 
            disabled={isSending || !question.trim()} 
            type="submit"
          >
            {isSending ? (
              <div className="loading-spinner"></div>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            )}
          </button>
        </div>
      </form>
    );
  }

  if (isAuthLoading) {
    return (
      <div className="app-shell auth-shell">
        <div className="auth-card">
          <div className="loading-spinner"></div>
          <p style={{ marginTop: '12px' }}>Loading...</p>
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
      <aside className="sidebar">
        <div className="sidebar-header">
          <button
            className="new-chat-button"
            onClick={() => handleCreateConversation()}
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New chat
          </button>
        </div>

        <div className="conversation-list">
          <div className="sidebar-section-title">Recent</div>
          {conversations.map((conversation) => (
            <div
              className={
                conversation.id === activeConversationId
                  ? "conversation-row active"
                  : "conversation-row"
              }
              key={conversation.id}
            >
              <button
                className="conversation-item"
                onClick={() => loadConversationMessages(token, conversation.id)}
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span className="conversation-title">{conversation.title}</span>
              </button>
              <div className="conversation-menu">
                <button
                  className="conversation-menu-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(menuOpenId === conversation.id ? null : conversation.id);
                  }}
                  aria-label="Conversation menu"
                  type="button"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                  </svg>
                </button>
                {menuOpenId === conversation.id && (
                  <div className="conversation-menu-dropdown">
                    <button className="conversation-menu-item" onClick={() => handleRenameConversationMenu(conversation)} type="button">
                      Edit
                    </button>
                    <button className="conversation-menu-item" onClick={() => handleDeleteConversationMenu(conversation)} type="button">
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user-info">
            <div className="user-avatar">
              {currentUser?.email?.charAt(0).toUpperCase()}
            </div>
            <span className="user-email">{currentUser?.email}</span>
          </div>
          <button className="secondary-button" onClick={clearSession} type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Log out
          </button>
        </div>
      </aside>

      <main className="chat-panel">
        <header className="chat-header">
          <h2>{activeConversation?.title ?? "New Chat"}</h2>
        </header>
          {error ? <p className="error-banner">{error}</p> : null}

        <div className="message-thread">
          {isBootstrapping || isLoadingMessages ? (
            <div className="empty-state">
              <div className="loading-spinner"></div>
              <p>Loading...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-chat">
              <div className="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <h3>How can I help you today?</h3>
                <p>Ask me anything about technical troubleshooting.</p>
              </div>
              {renderComposer()}
            </div>
          ) : (
            <>
              {messages.map((message) => {
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
                    <div className="message-icon">
                      {message.role === "user" ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
                          <path d="M12 6v6l4 2" />
                        </svg>
                      )}
                    </div>
                    <div className="message-content">
                      <div className="message-label">
                        {message.role === "user" ? "You" : "Tech Fault RAG Bot"}
                      </div>
                      <div className="message-body">
                        {formatAnswerParagraphs(display.answerText).map((line, index) => (
                          <p key={`${message.id}-${index}`}>{line}</p>
                        ))}
                      </div>
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
              })}
            </>
          )}
        </div>
        {messages.length > 0 && !isBootstrapping && !isLoadingMessages
          ? renderComposer("composer docked-composer")
          : null}
        </main>
      </div>
    );
  }

export default App;
