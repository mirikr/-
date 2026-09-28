import React, { useEffect, useMemo, useState } from "react";
import Collapsible from "./collapsible.jsx";
import {
  SCHOOLS,
  SPECS,
  variantsForSchool,
  buildSchedule,
  tierOfOption,
  tiersForSchool,
  variantVisible,
  BELLS,
  PE_DAYS,
  PE_LESSONS,
  peChoice,
  peSummary,
  togglePeCell,
} from "./lyceum-schedule-10.js";

const PE_DAY_NAME = { tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт" };

// Готовое расписание лицея вместо ручного ввода сорока уроков.
//
// В сетке лицея каждый час — развилка: у математиков алгебра, у юристов история,
// седьмым уроком идут спецкурсы по записи. Поэтому здесь спрашивается только то,
// что отличает одного ученика от другого: школа, группы и спецкурсы. Всё
// остальное выводится из сетки.
//
// Собранные уроки помечаются меткой набора, и «Применить» заменяет только их:
// то, что вы завели руками, остаётся на месте.
export default function SchedulePreset({ choices, onChoices, onApply, onClear, appliedCount, locked, onSignIn, openRequest }) {
  const [open, setOpen] = useState(false);
  // Из окна «Расписание лицея изменилось» → «Выбрать»: панель раскрывается сама.
  useEffect(() => {
    if (openRequest) setOpen(true);
  }, [openRequest]);
  const school = choices.school || "";
  const groups = choices.groups || {};
  const specs = choices.specs || [];

  const tiers = choices.tiers || {};
  const pe = peChoice(choices);
  // Каждое изменение выбора сохраняет физкультуру уже днями: прежняя запись
  // группой (groups.pe) переводится в дни один раз и больше не нужна. Иначе
  // смена школы, которая пересобирает группы, потеряла бы её.
  const save = (next) => {
    const { pe: _old, ...restGroups } = next.groups || {};
    onChoices({ ...next, groups: restGroups, pe: next.pe || pe });
  };
  const variants = useMemo(
    () => variantsForSchool(school).filter((v) => variantVisible(v, tiers)),
    [school, tiers]
  );
  const preview = useMemo(
    () => (school ? buildSchedule({ school, groups, specs, tiers, pe }) : []),
    // pe пересобирается на каждой отрисовке — сравниваем по содержимому.
    [school, groups, specs, tiers, pe.at.join(","), pe.group]
  );

  // Группу, которой у школы нет, спрашивать незачем — но и хранить тоже:
  // иначе смена школы оставит в выборе алгебру от прежней.
  function pickSchool(id) {
    const allowed = variantsForSchool(id).map((v) => v.id);
    const kept = {};
    allowed.forEach((k) => {
      if (groups[k]) kept[k] = groups[k];
    });
    // Профильной математики у юристов нет — уровень от прежней школы не переносим.
    const nextTiers = {};
    variantsForSchool(id).forEach((v) => {
      const was = tiers[v.id];
      if (was && tiersForSchool(v, id).some((t) => t.id === was)) nextTiers[v.id] = was;
    });
    variantsForSchool(id).forEach((v) => {
      if (!variantVisible(v, nextTiers)) delete kept[v.id];
    });
    save({ ...choices, school: id, groups: kept, tiers: nextTiers });
  }

  function pickGroup(variantId, optionId) {
    const next = { ...groups };
    if (next[variantId] === optionId) delete next[variantId];
    else next[variantId] = optionId;
    save({ ...choices, groups: next });
  }

  // Уровень английского запоминается отдельно: он выбирается раньше
  // преподавателя, и список групп зависит от него.
  function pickTier(variant, tierId) {
    const next = { ...(choices.tiers || {}) };
    const groupsNext = { ...groups };
    if (next[variant.id] === tierId) {
      delete next[variant.id];
      delete groupsNext[variant.id];
    } else {
      next[variant.id] = tierId;
      // Преподаватель из другого уровня больше не подходит.
      if (tierOfOption(variant, groupsNext[variant.id]) !== tierId) delete groupsNext[variant.id];
    }
    // Уровень решает, какие группы вообще спрашиваются: выбор по спрятанной
    // строке ушёл бы в расписание незаметно для человека.
    variantsForSchool(school).forEach((v) => {
      if (!variantVisible(v, next)) delete groupsNext[v.id];
    });
    save({ ...choices, tiers: next, groups: groupsNext });
  }

  function toggleSpec(id) {
    const next = specs.includes(id) ? specs.filter((s) => s !== id) : [...specs, id];
    save({ ...choices, specs: next });
  }

  function pickPeCell(cell) {
    save({ ...choices, pe: togglePeCell(pe, cell) });
  }

  function pickPeGroup(group) {
    save({ ...choices, pe: { ...pe, group: pe.group === group ? "" : group } });
  }

  // Уровень без своих групп (профильная математика) закрывается алгеброй и
  // геометрией — отдельными строками ниже, так что сам он не «невыбранный».
  const missing = variants
    .filter((v) => {
      if (groups[v.id]) return false;
      if (!v.tiers) return true;
      const tier = tiers[v.id];
      return !tier || (v.tiers.find((t) => t.id === tier) || { options: [] }).options.length > 0;
    })
    .map((v) => v.name)
    .concat(pe.at.length ? [] : ["Физкультура"]);

  return (
    <div style={styles.wrap}>
      <div style={styles.head}>
        <button onClick={() => setOpen(!open)} style={styles.headBtn}>
          <span style={styles.chevron}>{open ? "▾" : "▸"}</span>
          Готовое расписание лицея
        </button>
        <span style={styles.mutedSmall}>
          {locked
            ? "нужен вход в аккаунт"
            : appliedCount > 0
            ? `в расписании ${appliedCount} уроков из набора`
            : "3 курс · 10 класс · сетка с 28 сентября"}
        </span>
      </div>

      <Collapsible open={open}>
        {locked ? (
          <div style={styles.body}>
            <p style={styles.muted}>
              Готовое расписание привязано к аккаунту, а не к устройству: войдите — и выбранная школа с группами
              останутся при вас на телефоне и на компьютере. Без входа записи живут только в памяти этого браузера
              и пропадут вместе с ней.
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
            Выберите свою академическую школу и группы — уроки расставятся сами, по звонкам и кабинетам.
            Добавленное вручную останется на месте: «Применить» меняет только уроки из этого набора.
          </p>

          <div style={styles.field}>
            <div style={styles.label}>Академическая школа</div>
            <div style={styles.pills}>
              {SCHOOLS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => pickSchool(s.id)}
                  style={s.id === school ? styles.pillOn : styles.pill}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {school && (
            <>
              {variants.map((v) => {
                const tier = v.tiers ? tiers[v.id] || tierOfOption(v, groups[v.id]) : null;
                const options = v.tiers ? (v.tiers.find((t) => t.id === tier) || { options: [] }).options : v.options;
                return (
                  <div key={v.id} style={styles.field}>
                    <div style={styles.label}>{v.name}</div>
                    {v.tiers && (
                      <div style={styles.pills}>
                        {tiersForSchool(v, school).map((t) => (
                          <button
                            key={t.id}
                            onClick={() => pickTier(v, t.id)}
                            style={tier === t.id ? styles.pillOn : styles.pill}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {v.tiers && !tier ? (
                      <div style={styles.hint}>Сначала уровень — от него зависит, какие группы и сколько уроков в неделю.</div>
                    ) : options.length === 0 ? null : (
                      <div style={styles.pills}>
                        {options.map((o) => (
                          <button
                            key={o.id}
                            onClick={() => pickGroup(v.id, o.id)}
                            style={groups[v.id] === o.id ? styles.pillOn : styles.pill}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <div style={styles.field} role="group" aria-label="Физкультура">
                <div style={styles.label}>
                  Физкультура
                  {pe.at.length > 0 && <span style={styles.labelNote}> · {peSummary(pe)}</span>}
                </div>
                <div style={styles.hint}>
                  Отметьте, когда занимаетесь: два дня по уроку или один день двумя уроками — не больше двух часов в неделю.
                  Третья отметка снимает самую раннюю.
                </div>
                <div style={styles.peGrid}>
                  <span />
                  {PE_DAYS.map((d) => (
                    <span key={d} style={styles.peHead}>
                      {PE_DAY_NAME[d]}
                    </span>
                  ))}
                  {PE_LESSONS.map((n) => (
                    <React.Fragment key={n}>
                      <span style={styles.peRow}>
                        {n} урок
                        <span style={styles.peTime}>{BELLS[n][0]}</span>
                      </span>
                      {PE_DAYS.map((d) => {
                        const cell = d + "#" + n;
                        const on = pe.at.includes(cell);
                        return (
                          <button
                            key={cell}
                            type="button"
                            onClick={() => pickPeCell(cell)}
                            aria-pressed={on}
                            aria-label={`Физкультура: ${PE_DAY_NAME[d]}, ${n} урок`}
                            style={on ? styles.peCellOn : styles.peCell}
                          >
                            {on ? "✓" : ""}
                          </button>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
                <div style={styles.pills}>
                  <span style={styles.hint} title="Нужно только чтобы подставить преподавателя">Преподаватель:</span>
                  {[
                    ["f", "девочки"],
                    ["m", "мальчики"],
                  ].map(([id, label]) => (
                    <button key={id} type="button" onClick={() => pickPeGroup(id)} style={pe.group === id ? styles.pillOn : styles.pill}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.field}>
                <div style={styles.label}>Олимпиадные треки</div>
                <div style={styles.hint}>Отмечайте те, на которые ходите: они встанут седьмым-восьмым уроком, вечером и в субботу, а если трек идёт в учебные часы — рядом с уроком.</div>
                <div style={styles.pills}>
                  {SPECS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => toggleSpec(s.id)}
                      style={specs.includes(s.id) ? styles.pillOn : styles.pill}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.summary}>
                {preview.length} уроков в неделю
                {missing.length > 0 && <span style={styles.warn}> · не выбрано: {missing.join(", ")}</span>}
              </div>

              <div style={styles.actions}>
                <button onClick={() => onApply(preview)} style={styles.apply}>
                  {appliedCount > 0 ? "Обновить расписание" : "Применить расписание"}
                </button>
                {appliedCount > 0 && (
                  <button onClick={onClear} style={styles.clear}>
                    Убрать уроки набора
                  </button>
                )}
              </div>
            </>
          )}
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
  hint: { fontSize: 11.5, color: "var(--mute)", lineHeight: 1.45, alignSelf: "center" },
  labelNote: { fontWeight: 600, color: "var(--mute)" },
  peGrid: { display: "grid", gridTemplateColumns: "max-content repeat(4, minmax(0, 56px))", justifyContent: "start", gap: 6, alignItems: "center" },
  peHead: { fontSize: 12, fontWeight: 700, color: "var(--ink2)", textAlign: "center" },
  peRow: { fontSize: 12, color: "var(--ink2)", fontWeight: 600, display: "flex", flexDirection: "column", lineHeight: 1.25, paddingRight: 4 },
  peTime: { fontSize: 11, color: "var(--mute)", fontWeight: 400 },
  peCell: { height: 36, border: "1px solid var(--line)", background: "var(--panel2)", color: "var(--btnInk)", borderRadius: 9, fontSize: 15, fontWeight: 700 },
  peCellOn: { height: 36, border: "1px solid var(--btnBg)", background: "var(--btnBg)", color: "var(--btnInk)", borderRadius: 9, fontSize: 15, fontWeight: 700 },
  pills: { display: "flex", flexWrap: "wrap", gap: 6 },
  pill: pillBase,
  pillOn: { ...pillBase, background: "var(--btnBg)", color: "var(--btnInk)", borderColor: "var(--btnBg)" },
  summary: { fontSize: 12.5, color: "var(--ink2)", fontWeight: 600 },
  warn: { color: "var(--red)", fontWeight: 600 },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  apply: { border: "none", color: "var(--btnInk)", background: "var(--btnBg)", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600 },
  clear: { border: "1px solid var(--line)", background: "var(--panel2)", color: "var(--ink2)", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600 },
};
