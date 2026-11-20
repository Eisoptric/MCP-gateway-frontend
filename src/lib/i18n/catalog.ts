import { messageLoaders, type Locale, type Messages } from "@/lib/i18n/messages";

// The languages downloaded so far. Kept free of React and the stores so it runs under node --test.
const loaded: Partial<Record<Locale, Messages>> = {};
const loading: Partial<Record<Locale, Promise<void>>> = {};

export function loadMessages(locale: Locale): Promise<void> {
  loading[locale] ??= messageLoaders[locale]().then(
    (messages) => {
      loaded[locale] = messages;
    },
    (error: unknown) => {
      // Forget the failed attempt so the next call tries the download again.
      delete loading[locale];
      throw error;
    }
  );
  return loading[locale];
}

/**
 * Loads the chosen language, or the other one when the chosen one cannot be downloaded (an old
 * chunk gone after a deploy, say), so the page shows in some language instead of none.
 * Resolves with the language that loaded.
 */
export async function loadEither(
  locale: Locale,
  load: (locale: Locale) => Promise<void> = loadMessages
): Promise<Locale> {
  try {
    await load(locale);
    return locale;
  } catch {
    const other: Locale = locale === "en" ? "zh" : "en";
    await load(other);
    return other;
  }
}

const RELOAD_FLAG = "gateway-i18n-reload";
type FlagStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Reloads the page unless this tab already did so for missing messages. Returns whether it did.
 * The flag stops a reload loop when the fresh page cannot load them either.
 */
export function reloadOnce(storage: () => FlagStorage, reload: () => void): boolean {
  try {
    if (storage().getItem(RELOAD_FLAG)) return false;
    storage().setItem(RELOAD_FLAG, "1");
  } catch {
    // Without storage a second reload cannot be told from the first, so none is tried.
    return false;
  }
  reload();
  return true;
}

/** Messages loaded, so a later failure (after the next deploy) may reload again. */
export function forgetReload(storage: () => FlagStorage) {
  try {
    storage().removeItem(RELOAD_FLAG);
  } catch {
    // Nothing was stored then.
  }
}

export function messagesLoaded(locale: Locale): boolean {
  return loaded[locale] !== undefined;
}

function getPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

/** The message for a key, or undefined when the key is unknown or the language has not loaded. */
export function lookup(locale: Locale, path: string): string | undefined {
  const raw = getPath(loaded[locale], path);
  return typeof raw === "string" ? raw : undefined;
}

export function translate(
  locale: Locale,
  path: string,
  vars?: Record<string, string | number>
) {
  // An unknown key shows as the key. A language that has not loaded yet shows nothing: pages
  // wait for it (see LocaleDocument), so this only keeps a stray early call from printing keys.
  let text = lookup(locale, path) ?? (messagesLoaded(locale) ? path : "");
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${key}}`, String(value));
    }
  }
  return text;
}
