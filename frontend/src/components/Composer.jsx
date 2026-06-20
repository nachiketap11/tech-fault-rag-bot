export function Composer({ question, setQuestion, isSending, onSubmit, className = "composer" }) {
  function resizeTextarea(textarea) {
    const maxHeight = 144;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  return (
    <form className={className} onSubmit={onSubmit}>
      <div className="composer-inner">
        <textarea
          id="question"
          className="question-input"
          rows="1"
          placeholder="Send a message..."
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            resizeTextarea(e.currentTarget);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit(e);
            }
          }}
        />
        <button className="submit-button" disabled={isSending || !question.trim()} type="submit">
          {isSending ? (
            <div className="loading-spinner" />
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
