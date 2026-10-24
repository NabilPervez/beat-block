export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function canonicalUrl(): string {
  return `${location.origin}/`;
}

export function shareMessage(score: number, ms: number, url = canonicalUrl()): string {
  return `I scored ${score.toLocaleString("en-US")} in BEAT//BLOCK and survived for ${formatTime(ms)}. Can you beat me?\n\nPlay here: ${url}`;
}

export const smsHref = (msg: string) =>
  // iOS uses "&body=", Android accepts "?body="; "?&body=" works on both in practice
  `sms:?&body=${encodeURIComponent(msg)}`;

export const whatsappHref = (msg: string) => `https://wa.me/?text=${encodeURIComponent(msg)}`;

/** Returns "shared" | "cancelled" | "unsupported" | "failed". Never claims a message was sent. */
export async function nativeShare(msg: string): Promise<string> {
  if (!navigator.share) return "unsupported";
  try {
    await navigator.share({ title: "BEAT//BLOCK", text: msg });
    return "shared";
  } catch (e) {
    return (e as DOMException)?.name === "AbortError" ? "cancelled" : "failed";
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
