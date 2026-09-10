#!/usr/bin/env node
// Проверка подключения к Supabase: отвечает ли проект, включён ли вход по почте,
// создана ли таблица planner_kv и закрыта ли она политикой RLS.
//
//   node scripts/check-supabase.mjs                # только чтение, ничего не меняет
//   node scripts/check-supabase.mjs --write-probe  # плюс попытка анонимной записи
//   node scripts/check-supabase.mjs --signup почта пароль
//
// Ключи берутся из .env.local, .env.production или из переменных окружения.
import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env.local", ".env.production", ".env"]) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const env = loadEnv();
const URL_ = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;

const ok = (s) => console.log("  \x1b[32m✓\x1b[0m " + s);
const bad = (s) => console.log("  \x1b[31m✗\x1b[0m " + s);
const warn = (s) => console.log("  \x1b[33m!\x1b[0m " + s);
const info = (s) => console.log("    " + s);

if (!URL_ || !KEY) {
  bad("Не найдены VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.");
  info("Скопируйте .env.example в .env.local и подставьте значения.");
  process.exit(1);
}
if (KEY.startsWith("sb_secret_") || KEY.includes("service_role")) {
  bad("В VITE_SUPABASE_ANON_KEY лежит секретный ключ — так нельзя.");
  info("Нужен публичный: sb_publishable_... (или anon public в старых проектах).");
  info("Секретный ключ обходит RLS, а сборка попадает в браузер к пользователю.");
  process.exit(1);
}

const headers = { apikey: KEY, "Content-Type": "application/json" };

async function req(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch (e) {
    /* не JSON — оставляем как есть */
  }
  return { status: res.status, body };
}

console.log(`\nПроект: ${URL_}\n`);

// 1. Вход по почте.
console.log("Вход по почте");
let settings = null;
try {
  const res = await req(`${URL_}/auth/v1/settings`);
  if (res.status !== 200) {
    bad(`сервер авторизации ответил ${res.status}`);
    info(JSON.stringify(res.body).slice(0, 200));
    // Ответ не от Supabase (прокси, файрвол, опечатка в адресе) — дальше проверять нечего.
    if (typeof res.body === "string") {
      info("это не похоже на ответ Supabase — запрос до проекта не дошёл");
      info("проверьте адрес проекта и доступ в интернет с этой машины");
      process.exit(1);
    }
  } else {
    settings = res.body;
    const emailOn = settings.external && settings.external.email;
    if (emailOn) ok("провайдер Email включён");
    else bad("провайдер Email выключен — Authentication → Sign In / Providers → Email");

    if (settings.disable_signup) {
      warn("регистрация новых пользователей закрыта (disable_signup)");
      info("это нормально, если аккаунт уже создан; иначе включите Allow new users to sign up");
    } else ok("регистрация новых пользователей разрешена");

    if (settings.mailer_autoconfirm) {
      ok("подтверждение почты выключено — письма не нужны, аккаунт работает сразу");
    } else {
      warn("подтверждение почты включено: после регистрации придёт письмо со ссылкой");
      info("встроенная почта Supabase жёстко ограничена по числу писем в час;");
      info("для личного приложения проще выключить Confirm email в настройках Email-провайдера");
    }
  }
} catch (e) {
  bad("не удалось связаться с сервером: " + e.message);
  process.exit(1);
}

// 2. Таблица и RLS.
console.log("\nТаблица planner_kv");
const table = await req(`${URL_}/rest/v1/planner_kv?select=key&limit=1`);
if (table.status === 200) {
  ok("таблица существует и доступна по API");
  if (Array.isArray(table.body) && table.body.length > 0) {
    bad("анонимный запрос вернул данные — политика RLS не защищает таблицу!");
    info("выполните SQL из docs/supabase-setup.md, шаг 2");
  } else {
    ok("анонимный запрос данных не вернул (так и должно быть)");
    info("пустой ответ бывает и у пустой таблицы — точную проверку даёт --write-probe");
  }
} else if (table.status === 404 || (table.body && table.body.code === "PGRST205")) {
  bad("таблицы нет — выполните SQL из docs/supabase-setup.md, шаг 2");
} else if ((table.status === 401 || table.status === 403) && table.body && typeof table.body === "object") {
  // Отказ именно от PostgREST приходит объектом с code/message; строка — это чужой ответ.
  ok("доступ анонимному пользователю закрыт (RLS работает)");
} else {
  warn(`неожиданный ответ ${table.status}`);
  info(JSON.stringify(table.body).slice(0, 300));
}

// 3. Необязательная проверка: пускает ли таблица анонимную запись.
if (process.argv.includes("--write-probe")) {
  console.log("\nПопытка анонимной записи");
  const doc_id = "rls-probe-" + Date.now();
  const probe = await req(`${URL_}/rest/v1/planner_kv`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: "00000000-0000-0000-0000-000000000000", key: doc_id, value: "probe" }),
  });
  if (probe.status === 401 || probe.status === 403) {
    ok("запись без входа запрещена — RLS настроен верно");
  } else if (probe.status === 201 || probe.status === 200) {
    bad("запись без входа прошла — таблица открыта всему интернету!");
    info("включите RLS и политику из docs/supabase-setup.md, шаг 2");
    await req(`${URL_}/rest/v1/planner_kv?key=eq.${doc_id}`, { method: "DELETE" });
    info("тестовая строка удалена");
  } else {
    warn(`ответ ${probe.status}: ${JSON.stringify(probe.body).slice(0, 200)}`);
  }
}

// 4. Необязательная проверка: полный цикл регистрации.
const signupIdx = process.argv.indexOf("--signup");
if (signupIdx !== -1) {
  const email = process.argv[signupIdx + 1];
  const password = process.argv[signupIdx + 2];
  console.log("\nРегистрация");
  if (!email || !password) {
    bad("укажите почту и пароль: --signup почта пароль");
  } else {
    const res = await req(`${URL_}/auth/v1/signup`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 200 && res.body.access_token) {
      ok("аккаунт создан, вход выполнен сразу — можно пользоваться");
    } else if (res.status === 200) {
      ok("аккаунт создан");
      warn("сессии нет — ждёт подтверждения почты, проверьте письмо");
    } else {
      bad(`ответ ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`);
      if (/already registered/i.test(JSON.stringify(res.body))) {
        info("такой аккаунт уже есть — это тоже значит, что провайдер работает");
      }
    }
  }
}

console.log("");
