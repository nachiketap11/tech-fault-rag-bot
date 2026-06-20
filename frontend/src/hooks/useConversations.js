import { useEffect, useState } from "react";
import { API_BASE_URL, fetchJson } from "../lib/api.js";

export function useConversations(token, currentUser, onAuthError) {
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!token || !currentUser) return;

    async function bootstrapChats() {
      setIsBootstrapping(true);
      try {
        const data = await fetchJson(`${API_BASE_URL}/conversations`, { token });
        setConversations(data.conversations);
        setActiveConversationId(null);
        setMessages([]);
        setDraftTitle("");
      } catch (error) {
        onAuthError(error);
      } finally {
        setIsBootstrapping(false);
      }
    }

    bootstrapChats();
  }, [token, currentUser]);

  async function loadConversationMessages(authToken, conversationId, conversationSnapshot) {
    setIsLoadingMessages(true);
    try {
      const data = await fetchJson(
        `${API_BASE_URL}/conversations/${conversationId}/messages`,
        { token: authToken },
      );
      setActiveConversationId(conversationId);
      setMessages(data.messages);
      setDraftTitle(data.conversation.title);
      setConversations(
        (conversationSnapshot ?? conversations).map((c) =>
          c.id === conversationId ? data.conversation : c,
        ),
      );
    } catch (error) {
      onAuthError(error);
    } finally {
      setIsLoadingMessages(false);
    }
  }

  async function handleCreateConversation(authToken) {
    try {
      const conversation = await fetchJson(`${API_BASE_URL}/conversations`, {
        method: "POST",
        token: authToken ?? token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New chat" }),
      });
      setConversations((prev) => [conversation, ...prev]);
      setActiveConversationId(conversation.id);
      setMessages([]);
      setDraftTitle(conversation.title);
      return conversation;
    } catch (error) {
      onAuthError(error);
      return null;
    }
  }

  async function renameConversation(conversationId, title) {
    if (!conversationId || isRenaming) return;
    const trimmedTitle = title.trim() || "New chat";
    setIsRenaming(true);
    try {
      const updated = await fetchJson(
        `${API_BASE_URL}/conversations/${conversationId}`,
        {
          method: "PATCH",
          token,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmedTitle }),
        },
      );
      if (updated.id === activeConversationId) setDraftTitle(updated.title);
      setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (error) {
      onAuthError(error);
    } finally {
      setIsRenaming(false);
    }
  }

  async function deleteConversation(conversationId) {
    if (!conversationId || isDeleting) return;
    setIsDeleting(true);
    try {
      await fetchJson(`${API_BASE_URL}/conversations/${conversationId}`, {
        method: "DELETE",
        token,
      });
      const remaining = conversations.filter((c) => c.id !== conversationId);
      setConversations(remaining);

      if (conversationId !== activeConversationId) return;

      setMessages([]);
      if (remaining.length > 0) {
        await loadConversationMessages(token, remaining[0].id, remaining);
      } else {
        setActiveConversationId(null);
        setDraftTitle("");
        await handleCreateConversation();
      }
    } catch (error) {
      onAuthError(error);
    } finally {
      setIsDeleting(false);
    }
  }

  function resetConversationState() {
    setConversations([]);
    setActiveConversationId(null);
    setMessages([]);
    setDraftTitle("");
  }

  return {
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
    isRenaming,
    isDeleting,
    loadConversationMessages,
    handleCreateConversation,
    renameConversation,
    deleteConversation,
    resetConversationState,
  };
}
