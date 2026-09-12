import React, { useMemo, useState } from "react";
import Collapsible from "./collapsible.jsx";
import { KT_EXAMS, KT_GROUPS, buildExams } from "./lyceum-exams-10.js";

// График контрольных тестов рядом с готовым расписанием: даты те же для всех,
// а вот предметы у каждого свои — тест пишут учебные группы по предмету.
export default function ExamPreset({ picked, onPicked, onApply, onClear, appliedCount, locked, onSignIn }) {
  const [open, setOpen] = useState(false);
  const chosen = picked || [];
  const preview = useMemo(() => buildExams(chosen), [chosen]);

  function toggle(id) {
    onPicked(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.head}>
        <button onClick={() => setOpen(!open)} style={styles.headBtn}>
          <span style={styles.chevron}>{open ? "▾" : "▸"}</span>
          Контрольные тесты КТ1
        </button>
        <span style={styles.mutedSmall}>
          {locked
            ? "нужен вход в аккаунт"
            : appliedCount > 0
            ? `в расписании ${appliedCount} из графика`
            : "3 курс · сентябрь"}
        </span>
      </div>

      <Collapsible open={open}>
        {locked ? (
          <div style={styles.body}>
            <p style={styles.muted}>
              График тестов, как и готовое расписание, привязан к аккаунту. Войдите — и выбранные предметы останутся
              при вас на всех устройствах.
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
              Тесты встанут в расписание экзаменами — с датой, временем и местом, и попадут в отсчёт наверху и в
              календарь телефона. Время окончания в графике не указано, стоит ориентировочное — поправьте в карточке.
            </p>

            {KT_GROUPS.map((g) => {
              const items = KT_EXAMS.filter((e) => e.group === g.id);
              if (!items.length) return null;
              return (
                <div key={g.id} style={styles.field}>
                  <div style={styles.label}>{g.title}</div>
                  {g.hint && <div style={styles.hint}>{g.hint}</div>}
                  <div style={styles.pills}>
                    {items.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => toggle(e.id)}
                        title={[e.place, e.note].filter(Boolean).join(" · ")}
                        style={chosen.includes(e.id) ? styles.pillOn : styles.pill}
                      >
                        {e.name.replace(" · КТ1", "")}
                        <span style={styles.when}>{dateLabel(e.date)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            <div style={styles.summary}>{preview.length} тестов в расписании</div>
            <div style={styles.actions}>
              <button onClick={() => onApply(preview)} style={styles.apply} disabled={!preview.length}>
                {appliedCount > 0 ? "Обновить тесты" : "Добавить в расписание"}
              </button>
              {appliedCount > 0 && (
                <button onClick={onClear} style={styles.clear}>
                  Убрать тесты
                </button>
              )}
            </div>
          </div>
        )}
      </Collapsible>
    </div>
  );
}

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
function dateLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  return " · " + d.getDate() + " " + MONTHS[d.getMonth()];
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
  hint: { fontSize: 11.5, color: "var(--mute)", lineHeight: 1.45 },
  pills: { display: "flex", flexWrap: "wrap", gap: 6 },
  pill: pillBase,
  pillOn: { ...pillBase, background: "var(--btnBg)", color: "var(--btnInk)", borderColor: "var(--btnBg)" },
  when: { opacity: 0.65, fontWeight: 500 },
  summary: { fontSize: 12.5, color: "var(--ink2)", fontWeight: 600 },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  apply: { border: "none", color: "var(--btnInk)", background: "var(--btnBg)", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600 },
  clear: { border: "1px solid var(--line)", background: "var(--panel2)", color: "var(--ink2)", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600 },
};
