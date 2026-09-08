
function chatBlockKey(block) {
  return JSON.stringify(block);
}

function mergeChatHistory(previous, incoming) {
  if (!incoming.length) return previous;
  if (!previous.length) return incoming.slice();
  const previousOffset = Math.max(0, previous.length - incoming.length);
  const previousKeys = previous.slice(previousOffset).map(chatBlockKey);
  const incomingKeys = incoming.map(chatBlockKey);
  const maxOverlap = Math.min(previousKeys.length, incomingKeys.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const previousStart = previousKeys.length - overlap;
    let matches = true;
    for (let index = 0; index < overlap; index += 1) {
      if (previousKeys[previousStart + index] !== incomingKeys[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return previous.concat(incoming.slice(overlap));
  }
  return previous.concat(incoming);
}

function mergeChatPages(previous, incoming, { prepend = false } = {}) {
  if (!previous.length) return incoming.slice();
  if (!incoming.length) return previous.slice();
  const sequenced = [...previous, ...incoming]
    .every((block) => Number.isSafeInteger(Number(block?.sequence)));
  if (sequenced) {
    const bySequence = new Map();
    for (const block of (prepend ? [...incoming, ...previous] : [...previous, ...incoming])) {
      bySequence.set(Number(block.sequence), block);
    }
    return [...bySequence.values()]
      .sort((left, right) => Number(left.sequence) - Number(right.sequence));
  }
  return prepend
    ? mergeChatHistory(incoming, previous)
    : mergeChatHistory(previous, incoming);
}

function rawChatKey(blocks) {
  if (!blocks.length) return "0";
  return `${blocks.length}|${chatBlockKey(blocks[0])}|${chatBlockKey(blocks[blocks.length - 1])}`;
}

export { chatBlockKey, mergeChatHistory, mergeChatPages, rawChatKey };
