/** Defensive clean-up before text is spoken: a voice must never read out markdown symbols. */
export function speakable(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [label](url) -> label
    .replace(/`/g, "")
    .replace(/(\*{1,3}|_{2,3})(.+?)\1/g, "$2") // **bold**, *italic*
    .replace(/^\s*(#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)/gm, "") // headings, bullets, numbers
    .replace(/[*#]/g, "")
    .replace(/‑/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
