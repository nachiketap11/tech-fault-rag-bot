import { useState } from "react";
import { API_BASE_URL, createTemporaryId, readNdjsonStream } from "../lib/api.js";

export function useChatStream({
  token,
  activeConversationId,
  setMessages,
  setConversations,
  setDraftTitle,
  handleCreateConversation,
  onError,
  onAuthError,
}) {
  const [isSending, setIsSending] = useState(false);
  const [question, setQuestion] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isSending) return;

    setIsSending(true);
    onError("");

    let didStartStream = false;
    let didCompleteStream = false;
    const temporaryUserMessageId = createTemporaryId("user");
    const temporaryAssistantMessageId = createTemporaryId("assistant");

    try {
      let conversationId = activeConversationId;

      if (!conversationId) {
        const conversation = await handleCreateConversation(token);
        conversationId = conversation?.id ?? null;
      }

      if (!conversationId) throw new Error("Unable to create a conversation.");

      setQuestion("");
      setMessages((prev) => [
        ...prev,
        {
          id: temporaryUserMessageId,
          role: "user",
          content: trimmedQuestion,
          citations: [],
          retrieved_chunks: [],
          created_at: new Date().toISOString(),
        },
        {
          id: temporaryAssistantMessageId,
          role: "assistant",
          content: "",
          citations: [],
          retrieved_chunks: [],
          created_at: new Date().toISOString(),
          isStreaming: true,
        },
      ]);

      const response = await fetch(
        `${API_BASE_URL}/conversations/${conversationId}/messages/stream`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ question: trimmedQuestion, top_k: 5 }),
        },
      );

      if (!response.ok) {
        let detail = `Request failed with status ${response.status}`;
        try {
          const errorBody = await response.json();
          if (typeof errorBody.detail === "string") detail = errorBody.detail;
        } catch {
          // keep fallback detail
        }
        const error = new Error(detail);
        error.status = response.status;
        throw error;
      }

      await readNdjsonStream(response, (streamEvent) => {
        if (streamEvent.type === "start") {
          didStartStream = true;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === temporaryUserMessageId) return streamEvent.user_message;
              if (m.id === temporaryAssistantMessageId)
                return { ...m, retrieved_chunks: streamEvent.retrieved_chunks ?? [] };
              return m;
            }),
          );
          setConversations((prev) => {
            const filtered = prev.filter((c) => c.id !== streamEvent.conversation.id);
            return [streamEvent.conversation, ...filtered];
          });
          setDraftTitle(streamEvent.conversation.title);
          return;
        }

        if (streamEvent.type === "delta") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === temporaryAssistantMessageId
                ? { ...m, content: `${m.content}${streamEvent.delta}` }
                : m,
            ),
          );
          return;
        }

        if (streamEvent.type === "done") {
          didCompleteStream = true;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === temporaryAssistantMessageId ? streamEvent.assistant_message : m,
            ),
          );
          setConversations((prev) => {
            const filtered = prev.filter((c) => c.id !== streamEvent.conversation.id);
            return [streamEvent.conversation, ...filtered];
          });
          setDraftTitle(streamEvent.conversation.title);
          return;
        }

        if (streamEvent.type === "error") {
          throw new Error(streamEvent.detail);
        }
      });
    } catch (error) {
      setMessages((prev) =>
        prev
          .filter((m) => didStartStream || m.id !== temporaryUserMessageId)
          .map((m) => {
            if (m.id !== temporaryAssistantMessageId) return m;
            if (didCompleteStream) return m;
            return { ...m, content: m.content || "The response was interrupted.", isStreaming: false };
          }),
      );
      onAuthError(error);
    } finally {
      setIsSending(false);
    }
  }

  return { question, setQuestion, isSending, handleSubmit };
}
