import { supabase, authReady, currentUser, cloudConfigured, onAuthChange } from "./supabase.js";

// Offline-first key/value storage. Every write lands in localStorage immediately, so the
// app keeps working on the train and in aeroplane mode; the cloud copy is a best-effort
// mirror on top. The same key/value shape the app used with window.storage is preserved,
// which is why the whole planner state and every homework attachment fit without a schema.
const LOCAL_PREFIX = "planner:";
const TABLE = "planner_kv";

export { onAuthChange, cloudConfigured };

function localRead(key) {
  try {
    const raw = localStorage.getItem(LOCAL_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.value === "string") {
      return { value: parsed.value, updatedAt: Number(parsed.updatedAt) || 0 };
    }
    return null;
  } catch (e) {
    return null;
  }
}

function localWrite(key, value, updatedAt) {
  try {
    localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify({ value, updatedAt }));
    return true;
  } catch (e) {
    return false; // out of quota — most likely a large homework attachment
  }
}

function localRemove(key) {
  try {
    localStorage.removeItem(LOCAL_PREFIX + key);
  } catch (e) {
    /* nothing to do */
  }
}

async function cloudUserId() {
  if (!cloudConfigured) return null;
  await authReady();
  const user = currentUser();
  return user ? user.id : null;
}

export async function cloudAvailable() {
  return Boolean(await cloudUserId());
}

async function cloudRead(key, userId) {
  const { data, error } = await supabase()
    .from(TABLE)
    .select("value, updated_at")
    .eq("user_id", userId)
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { value: data.value, updatedAt: Date.parse(data.updated_at) || 0 };
}

async function cloudWrite(key, value, updatedAt, userId) {
  const { error } = await supabase()
    .from(TABLE)
    .upsert(
      { user_id: userId, key, value, updated_at: new Date(updatedAt).toISOString() },
      { onConflict: "user_id,key" }
    );
  if (error) throw error;
}

async function cloudRemove(key, userId) {
  const { error } = await supabase().from(TABLE).delete().eq("user_id", userId).eq("key", key);
  if (error) throw error;
}

function describe(error) {
  const msg = (error && (error.message || String(error))) || "неизвестная ошибка";
  if (/fetch|network|Failed to fetch/i.test(msg)) return "нет связи с облаком — работаю с копией на этом устройстве";
  return msg;
}

// Returns { value, updatedAt, source, warning } or null when the key was never written.
// Когда обе стороны расходятся и передан mergeFn, они сливаются поэлементно;
// без него остаётся прежнее правило «свежая копия побеждает целиком».
export async function get(key, mergeFn) {
  const local = localRead(key);
  const userId = await cloudUserId();
  if (!userId) return local ? { ...local, source: "local", warning: "" } : null;

  let cloud = null;
  let warning = "";
  try {
    cloud = await cloudRead(key, userId);
  } catch (e) {
    warning = describe(e);
  }

  if (local && cloud && mergeFn && local.value !== cloud.value) {
    const merged = mergeFn(local.value, cloud.value);
    if (merged) {
      const updatedAt = Math.max(local.updatedAt, cloud.updatedAt, Date.now());
      localWrite(key, merged, updatedAt);
      cloudWrite(key, merged, updatedAt, userId).catch(() => {});
      return { value: merged, updatedAt, source: "merged", warning };
    }
  }

  if (cloud && (!local || cloud.updatedAt > local.updatedAt)) {
    localWrite(key, cloud.value, cloud.updatedAt);
    return { ...cloud, source: "cloud", warning };
  }

  if (local && (!cloud || local.updatedAt > cloud.updatedAt) && !warning) {
    // This device is ahead (offline edits, or the very first upload after signing in).
    cloudWrite(key, local.value, local.updatedAt, userId).catch(() => {});
  }

  return local ? { ...local, source: "local", warning } : null;
}

// Returns { ok, local, cloud, error } — ok means the value survived somewhere.
export async function set(key, value) {
  const updatedAt = Date.now();
  const local = localWrite(key, value, updatedAt);
  const userId = await cloudUserId();
  if (!userId) {
    return { ok: local, local, cloud: null, error: local ? "" : "не хватило места в памяти браузера" };
  }
  try {
    await cloudWrite(key, value, updatedAt, userId);
    return { ok: true, local, cloud: true, error: "" };
  } catch (e) {
    return { ok: local, local, cloud: false, error: describe(e) };
  }
}

export async function remove(key) {
  localRemove(key);
  const userId = await cloudUserId();
  if (!userId) return;
  try {
    await cloudRemove(key, userId);
  } catch (e) {
    /* the local copy is gone; the cloud row will be overwritten or cleaned up later */
  }
}
