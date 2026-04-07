import { useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

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
        sourceNumber: match ? Number(match[1]) : null,
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

function App() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: trimmedQuestion,
          top_k: 5,
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Something went wrong while contacting the API.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  const parsedResult = result ? splitAnswerAndCitations(result.answer) : null;

  return (
    <div className="app-shell">
      <main className="panel">
        <section className="hero">
          <p className="eyebrow">Minimal React UI</p>
          <h1>Tech Fault RAG Bot</h1>
          <p className="hero-copy">
            Ask a troubleshooting question and inspect the retrieved document
            chunks that support the answer.
          </p>
        </section>

        <form className="question-form" onSubmit={handleSubmit}>
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
          <button className="submit-button" disabled={isLoading} type="submit">
            {isLoading ? "Asking..." : "Ask"}
          </button>
        </form>

        {error ? <p className="error-banner">{error}</p> : null}

        {result ? (
          <section className="results-grid">
            <article className="card">
              <div className="card-header">
                <h2>Answer</h2>
              </div>
              <p className="question-summary">Question: {result.question}</p>
              <div className="answer-body">
                {formatAnswerParagraphs(parsedResult.answerText).map((line, index) => (
                  <p key={`${line}-${index}`}>{line || "\u00a0"}</p>
                ))}
              </div>
              {parsedResult.citations.length ? (
                <div className="citations-panel">
                  <div className="citations-header">
                    <h3>Used Sources</h3>
                    <span>{parsedResult.citations.length} cited</span>
                  </div>
                  <div className="citation-list">
                    {parsedResult.citations.map((citation, index) => {
                      const chunk =
                        citation.sourceNumber != null
                          ? result.retrieved_chunks[citation.sourceNumber - 1]
                          : null;

                      return (
                        <div className="citation-item" key={`${citation.label}-${index}`}>
                          <div className="citation-badge">{citation.label}</div>
                          <div className="citation-content">
                            <p>{citation.detail}</p>
                            {chunk ? (
                              <p className="citation-meta">
                                Matches retrieved chunk from {chunk.source}, page{" "}
                                {chunk.page}, chunk {chunk.chunk_index}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </article>

            <article className="card">
              <div className="card-header">
                <h2>Retrieved Chunks</h2>
                <span className="chunk-count">
                  {result.retrieved_chunks.length} sources
                </span>
              </div>
              <div className="chunk-list">
                {result.retrieved_chunks.map((chunk, index) => (
                  <details className="chunk-item" key={`${chunk.source}-${index}`}>
                    <summary>
                      Source {index + 1}: {chunk.source} | page {chunk.page} |
                      {" "}chunk {chunk.chunk_index}
                    </summary>
                    <p>{chunk.text}</p>
                  </details>
                ))}
              </div>
            </article>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;
