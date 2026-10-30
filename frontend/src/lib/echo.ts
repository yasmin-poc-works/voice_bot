// Barge-in support: while the bot speaks, the microphone also hears the bot's own voice.
// We tell the two apart by comparing what the recognizer heard with what the bot is saying.

const MIN_WORD_LENGTH = 4; // short words ("the", "and") appear everywhere and prove nothing
const ECHO_OVERLAP = 0.6;

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

/** True if what the mic heard is (mostly) the bot's own speech coming back. */
export function isEcho(heard: string, botText: string): boolean {
  const heardWords = words(heard).filter((w) => w.length >= MIN_WORD_LENGTH);
  if (heardWords.length === 0) return false;
  const bot = new Set(words(botText));
  const matches = heardWords.filter((w) => bot.has(w)).length;
  return matches / heardWords.length >= ECHO_OVERLAP;
}

/** True if the interim transcript is clearly the user talking over the bot. */
export function isInterruption(heard: string, botText: string): boolean {
  if (isEcho(heard, botText)) return false;
  // Needs at least one real word that the bot is not saying ("stop", "wait", "question").
  const bot = new Set(words(botText));
  return words(heard).some((w) => w.length >= MIN_WORD_LENGTH && !bot.has(w));
}
