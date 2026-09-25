import React, { useState } from "react";
import AutoGrow from "./auto-grow.jsx";
import { eventTime, eventLinks, hasDetails, linkLabel, splitLinks } from "./event-details.js";

// Подробности под событием: время, место, ссылки, описание — строкой, а по
// «подробности» — поля для правки. Правится та же запись, что и в
// расписании, если событие оттуда: время экзамена меняется и там.
export default function EventDetails({ event, onUpdate, fromSchedule }) {
  const [open, setOpen] = useState(false);
  const time = eventTime(event);
  const links = eventLinks(event);
  const any = hasDetails(event);

  return (
    <div style={S.wrap}>
      {any && (
        <div style={S.summary} data-event-details={event.id}>
          {time && (
            <span style={S.item}>
              <ClockIcon />
              <b style={S.time}>{time}</b>
            </span>
          )}
          {event.place && (
            <span style={S.item}>
              <PinIcon />
              <span>{event.place}</span>
            </span>
          )}
          {links.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer noopener" className="lesson-link" style={S.link}>
              <LinkIcon />
              {linkLabel(url)}
            </a>
          ))}
        </div>
      )}
      {event.note && (
        <div style={S.note}>
          {splitLinks(event.note).map((part, i) =>
            part.url ? (
              <a key={i} href={part.url} target="_blank" rel="noreferrer noopener" className="lesson-link" style={S.inlineLink}>
                {part.label}
              </a>
            ) : (
              <React.Fragment key={i}>{part.text}</React.Fragment>
            )
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={S.toggle}
        aria-expanded={open}
        aria-label={(open ? "Скрыть подробности: " : "Подробности: ") + (event.name || "событие")}
      >
        {open ? "▴ готово" : any ? "✎ подробности" : "+ время, место, ссылка"}
      </button>
      {open && (
        <div style={S.panel}>
          <label style={S.field}>
            <span style={S.label}>Время{fromSchedule ? " — оно же в расписании" : ""}</span>
            <span style={S.timeRow}>
              <input
                type="time"
                value={event.start || ""}
                onChange={(e) => onUpdate({ start: e.target.value })}
                style={S.timeInput}
                aria-label="Начало"
              />
              <span style={S.dash}>–</span>
              <input
                type="time"
                value={event.end || ""}
                onChange={(e) => onUpdate({ end: e.target.value })}
                style={S.timeInput}
                aria-label="Конец"
              />
              {(event.start || event.end) && (
                <button type="button" onClick={() => onUpdate({ start: "", end: "" })} style={S.clear}>
                  без времени
                </button>
              )}
            </span>
          </label>
          <label style={S.field}>
            <span style={S.label}>Место</span>
            <AutoGrow
              value={event.place || ""}
              onChange={(e) => onUpdate({ place: e.target.value })}
              placeholder="Например: лицей, ауд. 401"
              style={S.input}
            />
          </label>
          <label style={S.field}>
            <span style={S.label}>Ссылки — можно несколько, через пробел</span>
            <AutoGrow
              value={event.url || ""}
              onChange={(e) => onUpdate({ url: e.target.value })}
              placeholder="Регистрация, задания, результаты"
              style={S.input}
              inputMode="url"
            />
          </label>
          <label style={S.field}>
            <span style={S.label}>Описание</span>
            <AutoGrow
              multiline
              value={event.note || ""}
              onChange={(e) => onUpdate({ note: e.target.value })}
              placeholder="Что взять с собой, что повторить, когда итоги"
              style={{ ...S.input, minHeight: 54 }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  );
}

const S = {
  wrap: { flexBasis: "100%", minWidth: 0, marginTop: 2, display: "flex", flexDirection: "column", gap: 4 },
  summary: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 14px", fontSize: 12.5, color: "var(--ink2)" },
  item: { display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, overflowWrap: "anywhere" },
  time: { fontWeight: 700, color: "var(--ink)" },
  link: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--accent)", fontWeight: 600 },
  inlineLink: { color: "var(--accent)", fontWeight: 600, overflowWrap: "anywhere" },
  note: { fontSize: 12.5, color: "var(--ink2)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.45 },
  toggle: {
    alignSelf: "flex-start", border: "none", background: "none", padding: "2px 0", fontSize: 11.5,
    color: "var(--ink3)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2,
  },
  panel: {
    display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", marginTop: 2,
    border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel2)",
  },
  field: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 },
  label: { fontSize: 11.5, color: "var(--ink3)", fontWeight: 600 },
  timeRow: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  timeInput: { padding: "5px 6px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, background: "var(--panel)", color: "var(--ink)" },
  dash: { color: "var(--mute)" },
  clear: { border: "none", background: "none", padding: 0, fontSize: 11.5, color: "var(--ink3)", textDecoration: "underline", cursor: "pointer" },
  input: {
    width: "100%", boxSizing: "border-box", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 10,
    fontSize: 13, background: "var(--panel)", color: "var(--ink)",
  },
};
