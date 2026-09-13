import React, { useMemo, useState } from "react";
import Collapsible from "./collapsible.jsx";
import { voshMonths, buildOlympiads, humanDate, VOSH_START } from "./lyceum-olympiads.js";

// Школьный этап ВсОШ рядом с готовым расписанием: даты общие для всех, а вот
// на какие предметы идти — дело личное, поэтому ничего не отмечено заранее.
export default function OlympiadPreset({ picked, onPicked, onApply, onClear, appliedCount, locked, onSignIn }) {
  const [open, setOpen] = useState(false);
  const chosen = picked || [];
  const preview = useMemo(() => buildOlympiads(chosen), [chosen]);
  const months = useMemo(() => voshMonths(), []);

  function toggle(id) {
    onPicked(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.head}>
        <button onClick={() => setOpen(!open)} style={styles.headBtn}>
          <span style={styles.chevron}>{open ? "▾" : "▸"}</span>
          Олимпиады ВсОШ, школьный этап
        </button>
        <span style={styles.mutedSmall}>
          {locked
            ? "нужен вход в аккаунт"
            : appliedCount > 0
            ? `в расписании ${appliedCount} из графика`
            : "сентябрь — октябрь"}
        </span>
      </div>

      <Collapsible open={open}>
        {locked ? (
          <div style={styles.body}>
            <p style={styles.muted}>
              График олимпиад, как и готовое расписание, привязан к аккаунту. Войдите — и отмеченные предметы
              останутся при вас на всех устройствах.
            </p>
            <div style={styles.actions}>
              <button onClick={onSignIn} style={styles.apply}>
                Войти или зарегистрироваться
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.body}>
            <p style={styles.muted}>
              Отметьте те, на которые идёте. Они встанут в расписание олимпиадами, появятся в отсчёте наверху и в
              календаре телефона. Начало у всех в {VOSH_START}, место — Лицей КЭО; отмеченные «Сириус.Курсы» пишут на
              платформе. Продолжительности в графике нет, стоит ориентировочная — поправьте в карточке.
            </p>

            {months.map((group) => (
              <div key={group.month} style={styles.field}>
                <div style={styles.label}>{group.title}</div>
                <div style={styles.pills}>
                  {group.items.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => toggle(o.id)}
                      title={o.results ? o.place + " · итоги " + humanDate(o.results) : o.place}
                      style={chosen.includes(o.id) ? styles.pillOn : styles.pill}
                    >
                      {o.name}
                      <span style={styles.when}> · {humanDate(o.date)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div style={styles.summary}>
              {preview.length ? preview.length + " в расписании" : "пока ничего не отмечено"}
            </div>
            <div style={styles.actions}>
              <button onClick={() => onApply(preview)} style={styles.apply} disabled={!preview.length}>
                {appliedCount > 0 ? "Обновить олимпиады" : "Добавить в расписание"}
              </button>
              {appliedCount > 0 && (
                <button onClick={onClear} style={styles.clear}>
                  Убрать олимпиады
                </button>
              )}
            </div>
          </div>
        )}
      </Collapsible>
    </div>
  );
}

const pillBase = {
  border: "1px solid var(--line)",
  background: "var(--panel2)",
  color: "var(--ink2)",
  borderRadius: 999,
  padding: "5px 11px",
  fontSize: 12.5,
  fontWeight: 600,
  textAlign: "left",
};

const styles = {
  wrap: {
    border: "1px solid var(--line)",
    background: "var(--panel2)",
    borderRadius: 11,
    padding: "10px 14px",
    marginBottom: 12,
  },
  head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  headBtn: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 13.5,
    fontWeight: 700,
    color: "var(--ink)",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  chevron: { color: "var(--mute)", fontSize: 11 },
  body: { paddingTop: 10, display: "flex", flexDirection: "column", gap: 12 },
  muted: { fontSize: 12.5, color: "var(--ink3)", lineHeight: 1.55, margin: 0 },
  mutedSmall: { fontSize: 12, color: "var(--mute)" },
  field: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
  label: { fontSize: 12, fontWeight: 700, color: "var(--ink2)" },
  pills: { display: "flex", flexWrap: "wrap", gap: 6 },
  pill: pillBase,
  pillOn: { ...pillBase, background: "var(--btnBg)", color: "var(--btnInk)", borderColor: "var(--btnBg)" },
  when: { opacity: 0.65, fontWeight: 500 },
  summary: { fontSize: 12.5, color: "var(--ink2)", fontWeight: 600 },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  apply: { border: "none", color: "var(--btnInk)", background: "var(--btnBg)", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600 },
  clear: { border: "1px solid var(--line)", background: "var(--panel2)", color: "var(--ink2)", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600 },
};
