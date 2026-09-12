import { createClient } from "@supabase/supabase-js";

// Both are baked in at build time. When they are absent the app still works —
// it just stays local to one device, exactly like it did as a Claude artifact.
const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cloudConfigured = Boolean(URL && ANON_KEY);

// Сколько ждать восстановления сессии, прежде чем открыть локальную копию.
const AUTH_WAIT_MS = 6000;

let client = null;
let sessionReady = null;
let session = null;
const listeners = new Set();

export function supabase() {
  if (!cloudConfigured) return null;
  if (!client) {
    client = createClient(URL, ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    // Без сети getSession() уходит обновлять протухший токен и либо отваливается
    // ошибкой, либо висит. Ни то ни другое не должно доходить до чтения данных:
    // локальная копия важнее облачной, и ждать её незачем. Сессия всё равно
    // подхватится позже — через onAuthStateChange.
    sessionReady = Promise.race([
      client.auth
        .getSession()
        .then(({ data }) => {
          session = data.session || null;
          return session;
        })
        .catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), AUTH_WAIT_MS)),
    ]);
    client.auth.onAuthStateChange((_event, next) => {
      session = next || null;
      listeners.forEach((fn) => fn(session));
    });
  }
  return client;
}

// The very first storage read happens before getSession() resolves; without waiting
// for it a signed-in person would silently be served the local copy instead of the cloud one.
export async function authReady() {
  if (!supabase()) return null;
  try {
    await sessionReady;
  } catch (e) {
    // Сессии нет — значит работаем с локальной копией, а не падаем.
  }
  return session;
}

export function currentUser() {
  return (session && session.user) || null;
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function humanAuthError(error) {
  const msg = (error && error.message) || "";
  if (/Invalid login credentials/i.test(msg)) return "Неверная почта или пароль.";
  if (/Email not confirmed/i.test(msg)) return "Почта не подтверждена — откройте письмо от Supabase и перейдите по ссылке.";
  if (/User already registered/i.test(msg)) return "Такая почта уже зарегистрирована — войдите вместо регистрации.";
  if (/Password should be at least/i.test(msg)) return "Пароль слишком короткий — минимум 6 символов.";
  if (/rate limit|too many/i.test(msg)) return "Слишком много попыток подряд — подождите минуту.";
  if (/fetch|network/i.test(msg)) return "Нет связи с сервером — проверьте интернет.";
  return msg || "Неизвестная ошибка.";
}

export async function signIn(email, password) {
  const sb = supabase();
  if (!sb) return { ok: false, error: "Облако не настроено в этой сборке." };
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  return error ? { ok: false, error: humanAuthError(error) } : { ok: true };
}

export async function signUp(email, password) {
  const sb = supabase();
  if (!sb) return { ok: false, error: "Облако не настроено в этой сборке." };
  const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
  if (error) return { ok: false, error: humanAuthError(error) };
  // With email confirmation switched on Supabase returns a user but no session.
  if (!data.session) return { ok: true, needsConfirmation: true };
  return { ok: true };
}

export async function signOut() {
  const sb = supabase();
  if (!sb) return;
  await sb.auth.signOut();
}
