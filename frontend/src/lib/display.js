export function splitAnswerAndCitations(answer) {
  const marker = /\nCitations\s*\n/i;
  const parts = answer.split(marker);

  if (parts.length < 2) {
    return { answerText: answer.trim(), citations: [] };
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

  return { answerText: answerText.trim(), citations };
}

export function formatAnswerParagraphs(answerText) {
  return answerText
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, all) => line || all[index - 1])
    .map((line) => line || " ");
}

export function getDisplayContent(message) {
  if (message.role !== "assistant") {
    return { answerText: message.content, citations: [] };
  }

  if (message.citations?.length) {
    const parsed = splitAnswerAndCitations(message.content);
    return { answerText: parsed.answerText, citations: message.citations };
  }

  return splitAnswerAndCitations(message.content);
}
