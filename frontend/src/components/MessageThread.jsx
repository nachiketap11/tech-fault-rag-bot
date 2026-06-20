import { formatAnswerParagraphs, getDisplayContent } from "../lib/display.js";

function CitationsPanel({ citations, retrievedChunks, messageId }) {
  return (
    <div className="citations-panel">
      <div className="citations-header">
        <h3>Used Sources</h3>
        <span>{citations.length} cited</span>
      </div>
      <div className="citation-list">
        {citations.map((citation, index) => {
          const chunk =
            citation.source_number != null ? retrievedChunks[citation.source_number - 1] : null;
          return (
            <div className="citation-item" key={`${messageId}-${index}`}>
              <div className="citation-badge">{citation.label}</div>
              <div className="citation-content">
                <p>{citation.detail}</p>
                {chunk ? (
                  <p className="citation-meta">
                    Matches retrieved chunk from {chunk.source}, page {chunk.page}, chunk{" "}
                    {chunk.chunk_index}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RetrievedChunksPanel({ chunks, messageId }) {
  return (
    <div className="source-section">
      <div className="citations-header">
        <h3>Retrieved Chunks</h3>
        <span>{chunks.length} sources</span>
      </div>
      <div className="chunk-list">
        {chunks.map((chunk, index) => (
          <details className="chunk-item" key={`${messageId}-${index}`}>
            <summary>
              Source {index + 1}: {chunk.source} | page {chunk.page} | chunk {chunk.chunk_index}
            </summary>
            <p>{chunk.text}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

function MessageCard({ message }) {
  const display = getDisplayContent(message);
  const isUser = message.role === "user";

  return (
    <article className={isUser ? "message-card user-message" : "message-card assistant-message"}>
      <div className="message-icon">
        {isUser ? (
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
        <div className="message-label">{isUser ? "You" : "Tech Fault RAG Bot"}</div>
        <div className="message-body">
          {message.isStreaming && !display.answerText ? (
            <p className="streaming-placeholder">Thinking...</p>
          ) : (
            formatAnswerParagraphs(display.answerText).map((line, index) => (
              <p key={`${message.id}-${index}`}>{line}</p>
            ))
          )}
          {message.isStreaming && display.answerText ? (
            <span className="streaming-cursor" aria-hidden="true" />
          ) : null}
        </div>
      </div>

      {!isUser && display.citations.length ? (
        <CitationsPanel
          citations={display.citations}
          retrievedChunks={message.retrieved_chunks}
          messageId={message.id}
        />
      ) : null}

      {!isUser && message.retrieved_chunks.length ? (
        <RetrievedChunksPanel chunks={message.retrieved_chunks} messageId={message.id} />
      ) : null}
    </article>
  );
}

export function MessageThread({ messages, isBootstrapping, isLoadingMessages, emptySlot }) {
  if (isBootstrapping || isLoadingMessages) {
    return (
      <div className="empty-state">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="empty-chat">
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <h3>How can I help you today?</h3>
          <p>Ask me anything about technical troubleshooting.</p>
        </div>
        {emptySlot}
      </div>
    );
  }

  return (
    <>
      {messages.map((message) => (
        <MessageCard key={message.id} message={message} />
      ))}
    </>
  );
}
