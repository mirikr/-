// Результаты, выложенные обновлением приложения — только для своего аккаунта.
//
// У каждого аккаунта есть «код для результатов»: он выводится из id аккаунта
// и виден только самому человеку (раздел «Результаты»). Тот, кто выкладывает
// (через обновление), шифрует результаты этим кодом (tools/publish-results.mjs)
// и кладёт в src/results-feed.json только шифровку и метку, по которой её
// узнать. Сам код в репозиторий не попадает. Открыть запись может лишь тот,
// у кого есть код, — то есть владелец аккаунта.
//
// Шифр — AES-GCM, ключ и метка — SHA-256 от кода с разными приставками.
// Работает и в браузере, и в Node 20+ (globalThis.crypto.subtle).

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без 0/O и 1/I — их путают

function subtle() {
  const c = globalThis.crypto;
  return c && c.subtle ? c.subtle : null;
}

async function sha256(text) {
  const buf = await subtle().digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(buf);
}

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const b64 = (bytes) => {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
};
const unb64 = (text) => Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));

export function normalizeCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Код аккаунта: 20 знаков группами по 4. Один и тот же на всех устройствах.
export async function recipientCode(accountId) {
  if (!accountId || !subtle()) return "";
  const bytes = await sha256("planner-results:" + accountId);
  let out = "";
  for (let i = 0; i < 20; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out.match(/.{4}/g).join("-");
}

export async function tagOf(code) {
  return hex(await sha256("planner-results-tag:" + normalizeCode(code))).slice(0, 32);
}

async function keyOf(code) {
  const raw = await sha256("planner-results-key:" + normalizeCode(code));
  return subtle().importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

// Запись ленты: { tag, iv, data, at } — data — шифровка JSON-массива результатов.
export async function encryptFor(code, results, at = new Date().toISOString()) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(results));
  const data = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, await keyOf(code), plain));
  return { tag: await tagOf(code), iv: b64(iv), data: b64(data), at };
}

// Все результаты из ленты для этого кода. Повреждённые записи пропускаются.
export async function decryptFeed(feed, code) {
  if (!code || !subtle() || !Array.isArray(feed)) return [];
  const tag = await tagOf(code);
  const mine = feed.filter((e) => e && e.tag === tag);
  if (!mine.length) return [];
  const key = await keyOf(code);
  const out = [];
  for (const e of mine) {
    try {
      const plain = await subtle().decrypt({ name: "AES-GCM", iv: unb64(e.iv) }, key, unb64(e.data));
      const list = JSON.parse(new TextDecoder().decode(plain));
      (Array.isArray(list) ? list : [list]).forEach((r, i) => {
        if (r && typeof r === "object") out.push({ ...r, id: r.id || "upd-" + e.at + "-" + i, source: "update", publishedAt: e.at });
      });
    } catch (err) {
      /* не наша или испорченная запись */
    }
  }
  return out;
}
