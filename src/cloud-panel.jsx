import React, { useEffect, useState } from "react";
import { cloudConfigured, currentUser, onAuthChange, authReady, signIn, signUp, signOut } from "./supabase.js";

// Sign-in bar for cross-device sync. Deliberately compact: when the account is connected
// it is a single line, because the planner itself is what the person came here for.
export default function CloudPanel() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!cloudConfigured);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    authReady().then(() => {
      if (!alive) return;
      setUser(currentUser());
      setReady(true);
    });
    const off = onAuthChange((session) => {
      setUser((session && session.user) || null);
      setBusy(false);
      setOpen(false);
      setPassword("");
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  async function submit(mode) {
    if (!email.trim() || !password) {
      setMsg("Введите почту и пароль.");
      return;
    }
    setBusy(true);
    setMsg("");
    const res = mode === "up" ? await signUp(email, password) : await signIn(email, password);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    if (res.needsConfirmation) {
      setMsg("Аккаунт создан. Подтвердите почту по ссылке из письма, потом войдите.");
      return;
    }
    setMsg("");
  }

  if (!cloudConfigured) {
    return (
      <div style={{ ...styles.bar, ...styles.row }}>
        <span style={styles.dotOff} />
        <span style={{ ...styles.text, flex: 1 }}>Данные только на этом устройстве — облако не подключено в этой сборке</span>
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={styles.bar}>
        <span style={styles.muted}>Проверяю вход…</span>
      </div>
    );
  }

  if (user) {
    return (
      <div style={styles.bar}>
        <span style={styles.dotOk} />
        <span style={styles.text}>
          Синхронизация включена · <b>{user.email}</b>
        </span>
        <button onClick={() => signOut()} style={styles.linkBtn}>
          Выйти
        </button>
      </div>
    );
  }

  return (
    <div style={styles.bar}>
      <div style={styles.row}>
        <span style={styles.dotOff} />
        <span style={styles.text}>Данные только на этом устройстве</span>
        <button onClick={() => setOpen(!open)} style={styles.linkBtn}>
          {open ? "Скрыть" : "Войти для синхронизации"}
        </button>
      </div>
      {open && (
        <div style={styles.form}>
          <p style={styles.muted}>
            Один аккаунт на все устройства: войдите здесь и на телефоне — записи, расписание и домашние задания
            будут одни и те же. Первый раз — «Зарегистрироваться».
          </p>
          <div style={styles.inputs}>
            <input
              type="email"
              autoComplete="email"
              placeholder="почта"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit("in")}
              style={styles.input}
            />
            <button onClick={() => submit("in")} disabled={busy} style={styles.primaryBtn}>
              {busy ? "…" : "Войти"}
            </button>
            <button onClick={() => submit("up")} disabled={busy} style={styles.secondaryBtn}>
              Зарегистрироваться
            </button>
          </div>
          {msg && <div style={styles.msg}>{msg}</div>}
        </div>
      )}
    </div>
  );
}

const styles = {
  bar: {
    fontFamily: "Inter, system-ui, sans-serif",
    maxWidth: 880,
    margin: "0 auto",
    padding: "10px 20px 0",
    color: "#2B2822",
  },
  row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  text: { fontSize: 12.5, color: "#5A5347" },
  muted: { fontSize: 12, color: "#8A8370", lineHeight: 1.55, margin: "8px 0" },
  dotOk: { width: 8, height: 8, borderRadius: "50%", background: "#3F6E52", display: "inline-block" },
  dotOff: { width: 8, height: 8, borderRadius: "50%", background: "#B9B2A0", display: "inline-block" },
  linkBtn: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 12.5,
    color: "#8C7326",
    fontWeight: 600,
    textDecoration: "underline",
  },
  form: { background: "#F7F4EC", border: "1px solid #DCD5C4", borderRadius: 6, padding: 14, marginTop: 8 },
  inputs: { display: "flex", gap: 6, flexWrap: "wrap" },
  input: { flex: "1 1 140px", padding: "6px 8px", border: "1px solid #C9C1AC", borderRadius: 4, fontSize: 13, background: "#fff" },
  primaryBtn: { border: "none", color: "#fff", background: "#2B2822", borderRadius: 4, padding: "6px 12px", fontSize: 12.5, fontWeight: 600 },
  secondaryBtn: { border: "1px solid #C9C1AC", color: "#2B2822", background: "#fff", borderRadius: 4, padding: "6px 12px", fontSize: 12.5, fontWeight: 600 },
  msg: { fontSize: 12, color: "#8B4A4A", marginTop: 8, lineHeight: 1.5 },
};
