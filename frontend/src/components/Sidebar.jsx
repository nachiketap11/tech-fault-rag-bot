import { useEffect, useState } from "react";

export function Sidebar({
  currentUser,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onRenameConversation,
  onDeleteConversation,
  onLogout,
  token,
}) {
  const [menuOpenId, setMenuOpenId] = useState(null);

  useEffect(() => {
    if (menuOpenId === null) return;
    function handleOutsideClick() { setMenuOpenId(null); }
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, [menuOpenId]);

  function handleRename(conversation) {
    setMenuOpenId(null);
    const newTitle = prompt("Enter new title:", conversation.title);
    if (newTitle?.trim()) onRenameConversation(conversation.id, newTitle);
  }

  function handleDelete(conversation) {
    setMenuOpenId(null);
    onDeleteConversation(conversation.id);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="new-chat-button" onClick={() => onNewConversation()} type="button">
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
            key={conversation.id}
            className={conversation.id === activeConversationId ? "conversation-row active" : "conversation-row"}
          >
            <button
              className="conversation-item"
              onClick={() => onSelectConversation(token, conversation.id)}
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
                aria-label="Conversation menu"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpenId(menuOpenId === conversation.id ? null : conversation.id);
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </button>
              {menuOpenId === conversation.id && (
                <div className="conversation-menu-dropdown">
                  <button className="conversation-menu-item" onClick={() => handleRename(conversation)} type="button">
                    Edit
                  </button>
                  <button className="conversation-menu-item" onClick={() => handleDelete(conversation)} type="button">
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
          <div className="user-avatar">{currentUser?.email?.charAt(0).toUpperCase()}</div>
          <span className="user-email">{currentUser?.email}</span>
        </div>
        <button className="secondary-button" onClick={onLogout} type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          Log out
        </button>
      </div>
    </aside>
  );
}
