import { useEffect, useRef } from "react";
import { AuthScreen } from "./components/AuthScreen.jsx";
import { Composer } from "./components/Composer.jsx";
import { MessageThread } from "./components/MessageThread.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { useAuth } from "./hooks/useAuth.js";
import { useChatStream } from "./hooks/useChatStream.js";
import { useConversations } from "./hooks/useConversations.js";

const CONFIGURED_INACTIVITY_MINUTES = Number(
  import.meta.env.VITE_INACTIVITY_TIMEOUT_MINUTES ?? 30,
);
const INACTIVITY_LOGOUT_MINUTES =
  Number.isFinite(CONFIGURED_INACTIVITY_MINUTES) && CONFIGURED_INACTIVITY_MINUTES > 0
    ? CONFIGURED_INACTIVITY_MINUTES
    : 30;
const INACTIVITY_LOGOUT_MS = INACTIVITY_LOGOUT_MINUTES * 60 * 1000;

function useInactivityLogout(token, currentUser, onLogout) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!token || !currentUser) return;

    const events = ["click", "keydown", "mousemove", "scroll", "touchstart", "focus"];

    function reset() {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(onLogout, INACTIVITY_LOGOUT_MS);
    }

    reset();
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [token, currentUser, onLogout]);
}

export default function App() {
  const { token, currentUser, isAuthLoading, persistSession, clearSession } = useAuth();

  function handleAuthError(error) {
    if (error?.status === 401) {
      clearSession();
      resetConversationState();
    }
  }

  const {
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    messages,
    setMessages,
    draftTitle,
    setDraftTitle,
    isBootstrapping,
    isLoadingMessages,
    loadConversationMessages,
    handleCreateConversation,
    renameConversation,
    deleteConversation,
    resetConversationState,
  } = useConversations(token, currentUser, handleAuthError);

  const { question, setQuestion, isSending, handleSubmit } = useChatStream({
    token,
    activeConversationId,
    setMessages,
    setConversations,
    setDraftTitle,
    handleCreateConversation,
    onError: () => {},
    onAuthError: handleAuthError,
  });

  useInactivityLogout(token, currentUser, () => {
    clearSession();
    resetConversationState();
  });

  // Reset textarea height when question is cleared
  useEffect(() => {
    if (question) return;
    document.querySelectorAll(".question-input").forEach((el) => {
      el.style.height = "";
      el.style.overflowY = "hidden";
    });
  }, [question]);

  if (isAuthLoading) {
    return (
      <div className="app-shell auth-shell">
        <div className="auth-card">
          <div className="loading-spinner" />
          <p style={{ marginTop: "12px" }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthScreen
        onSuccess={(accessToken, user) => {
          persistSession(accessToken, user);
        }}
      />
    );
  }

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  return (
    <div className="app-shell">
      <Sidebar
        currentUser={currentUser}
        conversations={conversations}
        activeConversationId={activeConversationId}
        token={token}
        onSelectConversation={loadConversationMessages}
        onNewConversation={() => handleCreateConversation(token)}
        onRenameConversation={renameConversation}
        onDeleteConversation={deleteConversation}
        onLogout={() => {
          clearSession();
          resetConversationState();
        }}
      />

      <main className="chat-panel">
        <header className="chat-header">
          <h2>{activeConversation?.title ?? "New Chat"}</h2>
        </header>

        <div className="message-thread">
          <MessageThread
            messages={messages}
            isBootstrapping={isBootstrapping}
            isLoadingMessages={isLoadingMessages}
            emptySlot={
              <Composer
                question={question}
                setQuestion={setQuestion}
                isSending={isSending}
                onSubmit={handleSubmit}
              />
            }
          />
        </div>

        {messages.length > 0 && !isBootstrapping && !isLoadingMessages ? (
          <Composer
            question={question}
            setQuestion={setQuestion}
            isSending={isSending}
            onSubmit={handleSubmit}
            className="composer docked-composer"
          />
        ) : null}
      </main>
    </div>
  );
}
