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
  bar: { fontFamily: "Inter, system-ui, sans-serif", color: "var(--ink)" },
  row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  text: { fontSize: 12.5, color: "var(--ink2)" },
  muted: { fontSize: 12, color: "var(--mute)", lineHeight: 1.55, margin: "8px 0" },
  dotOk: { width: 8, height: 8, borderRadius: "50%", background: "var(--green)", display: "inline-block" },
  dotOff: { width: 8, height: 8, borderRadius: "50%", background: "var(--mute)", display: "inline-block" },
  linkBtn: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 12.5,
    color: "var(--accent)",
    fontWeight: 600,
    textDecoration: "underline",
  },
  form: { background: "var(--neutralBg)", border: "1px solid var(--line)", borderRadius: 6, padding: 14, marginTop: 8 },
  inputs: { display: "flex", gap: 6, flexWrap: "wrap" },
  input: { flex: "1 1 140px", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 4, fontSize: 13, background: "var(--panel2)" },
  primaryBtn: { border: "none", color: "var(--btnInk)", background: "var(--btnBg)", borderRadius: 4, padding: "6px 12px", fontSize: 12.5, fontWeight: 600 },
  secondaryBtn: { border: "1px solid var(--line)", color: "var(--ink)", background: "var(--panel2)", borderRadius: 4, padding: "6px 12px", fontSize: 12.5, fontWeight: 600 },
  msg: { fontSize: 12, color: "var(--red)", marginTop: 8, lineHeight: 1.5 },
};
