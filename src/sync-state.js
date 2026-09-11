// Слияние правок с двух устройств.
//
// Раньше всё состояние было одним куском JSON, и при расхождении побеждала копия
// с более поздней меткой времени — целиком. Писали конспект в лицее без сети, дома
// правили расписание — одна сторона затирала другую.
//
// Здесь метка времени живёт у каждого элемента (поле `__u`), а удаления оставляют
// «надгробия» (`__deleted`), иначе удалённое на телефоне воскресало бы с ноутбука.
// Метки проставляются не в каждом обработчике, а один раз при сохранении: состояние
// сравнивается с последним сохранённым снимком, и обновляется только изменившееся.

const STAMP = "__u";
const TOMBSTONES = "__deleted";
const SCALAR_STAMPS = "__scalars";

// Поля, которые меняются целиком и не разбиваются на элементы.
const SCALAR_FIELDS = ["budget", "subjectColors", "showSunday", "hiddenSubjects"];

// Настройки интерфейса у каждого устройства свои — их не сливаем, берём локальные.
const LOCAL_ONLY_FIELDS = ["openSections"];

const ID_COLLECTIONS = ["journal", "events", "customSubjects", "lyceumSchedule", "homework"];

const TOMBSTONE_TTL_MS = 120 * 24 * 60 * 60 * 1000; // 4 месяца: дольше расхождение не живёт

function isObject(value) {
  return value !== null && typeof value === "object";
}

function sameContent(a, b) {
  // Сравниваем без метки времени, иначе каждое сохранение считалось бы правкой.
  const strip = (item) => {
    if (!isObject(item)) return item;
    const copy = { ...item };
    delete copy[STAMP];
    return copy;
  };
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

function byId(list) {
  const map = new Map();
  (list || []).forEach((item) => {
    if (item && item.id !== undefined) map.set(String(item.id), item);
  });
  return map;
}

// --- проставление меток ----------------------------------------------------

function stampList(prevList, nextList, path, tombstones, now) {
  const prevMap = byId(prevList);
  const nextMap = byId(nextList);

  prevMap.forEach((item, id) => {
    if (!nextMap.has(id)) tombstones[path + "|" + id] = now;
  });

  return (nextList || []).map((item) => {
    if (!isObject(item) || item.id === undefined) return item;
    const id = String(item.id);
    // Вложенные списки (заметки урока, ветки блока) метятся своими метками.
    const nested = nestedListKey(item);
    let next = item;
    if (nested) {
      const prevNested = prevMap.get(id) ? prevMap.get(id)[nested] : [];
      next = { ...item, [nested]: stampList(prevNested, item[nested], path + "/" + id + "/" + nested, tombstones, now) };
    }
    const prev = prevMap.get(id);
    if (prev && sameContent(prev, next) && prev[STAMP]) return { ...next, [STAMP]: prev[STAMP] };
    delete tombstones[path + "|" + id]; // элемент вернулся — надгробие больше не действует
    return { ...next, [STAMP]: now };
  });
}

function nestedListKey(item) {
  if (Array.isArray(item.notes)) return "notes";
  if (Array.isArray(item.branches)) return "branches";
  return null;
}

export function stampState(prevState, nextState, now = Date.now()) {
  const prev = prevState || {};
  const out = { ...nextState };
  const tombstones = { ...(prev[TOMBSTONES] || {}) };
  const scalars = { ...(prev[SCALAR_STAMPS] || {}) };

  ID_COLLECTIONS.forEach((key) => {
    if (!Array.isArray(nextState[key])) return;
    out[key] = stampList(prev[key], nextState[key], key, tombstones, now);
  });

  if (isObject(nextState.data)) {
    const data = {};
    Object.keys(nextState.data).forEach((subjectId) => {
      const prevSubject = (prev.data && prev.data[subjectId]) || {};
      const nextSubject = nextState.data[subjectId] || {};
      data[subjectId] = {
        ...nextSubject,
        topics: stampList(prevSubject.topics, nextSubject.topics, "data/" + subjectId + "/topics", tombstones, now),
        custom: stampList(prevSubject.custom, nextSubject.custom, "data/" + subjectId + "/custom", tombstones, now),
      };
    });
    out.data = data;
  }

  if (isObject(nextState.notebooks)) {
    const notebooks = {};
    Object.keys(nextState.notebooks).forEach((owner) => {
      notebooks[owner] = stampList(
        (prev.notebooks || {})[owner],
        nextState.notebooks[owner],
        "notebooks/" + owner,
        tombstones,
        now
      );
    });
    out.notebooks = notebooks;
  }

  SCALAR_FIELDS.forEach((field) => {
    if (nextState[field] === undefined) return;
    const changed = JSON.stringify(prev[field]) !== JSON.stringify(nextState[field]);
    scalars[field] = changed || !scalars[field] ? now : scalars[field];
  });

  // Старые надгробия чистим: расхождение в четыре месяца всё равно нежизнеспособно.
  Object.keys(tombstones).forEach((key) => {
    if (now - tombstones[key] > TOMBSTONE_TTL_MS) delete tombstones[key];
  });

  out[TOMBSTONES] = tombstones;
  out[SCALAR_STAMPS] = scalars;
  return out;
}

// --- слияние ---------------------------------------------------------------

function mergeTombstones(a, b) {
  const out = { ...(a || {}) };
  Object.keys(b || {}).forEach((key) => {
    if (!out[key] || b[key] > out[key]) out[key] = b[key];
  });
  return out;
}

function mergeList(listA, listB, path, tombstones) {
  const mapA = byId(listA);
  const mapB = byId(listB);
  const ids = [];
  (listA || []).forEach((item) => item && item.id !== undefined && ids.push(String(item.id)));
  (listB || []).forEach((item) => {
    const id = item && item.id !== undefined ? String(item.id) : null;
    if (id && !ids.includes(id)) ids.push(id);
  });

  const out = [];
  ids.forEach((id) => {
    const a = mapA.get(id);
    const b = mapB.get(id);
    const buried = tombstones[path + "|" + id];
    const newest = !a ? b : !b ? a : (b[STAMP] || 0) > (a[STAMP] || 0) ? b : a;
    // Удаление побеждает, только если оно позже последней правки элемента.
    if (buried && buried >= (newest[STAMP] || 0)) return;

    const nested = nestedListKey(newest);
    if (nested && a && b) {
      out.push({
        ...newest,
        [nested]: mergeList(a[nested], b[nested], path + "/" + id + "/" + nested, tombstones),
      });
      return;
    }
    out.push(newest);
  });
  return out;
}

function pickScalar(stateA, stateB, field) {
  const tsA = (stateA[SCALAR_STAMPS] || {})[field] || 0;
  const tsB = (stateB[SCALAR_STAMPS] || {})[field] || 0;
  if (stateB[field] === undefined) return stateA[field];
  if (stateA[field] === undefined) return stateB[field];
  return tsB > tsA ? stateB[field] : stateA[field];
}

// Сливает два состояния поэлементно. Первое считается «своим»: из него берутся
// настройки интерфейса, которые у каждого устройства свои.
export function mergeStates(localState, remoteState) {
  if (!remoteState) return localState;
  if (!localState) return remoteState;

  const tombstones = mergeTombstones(localState[TOMBSTONES], remoteState[TOMBSTONES]);
  const out = { ...remoteState, ...localState };

  ID_COLLECTIONS.forEach((key) => {
    if (!Array.isArray(localState[key]) && !Array.isArray(remoteState[key])) return;
    out[key] = mergeList(localState[key], remoteState[key], key, tombstones);
  });

  const subjects = new Set([...Object.keys(localState.data || {}), ...Object.keys(remoteState.data || {})]);
  const data = {};
  subjects.forEach((subjectId) => {
    const a = (localState.data || {})[subjectId] || {};
    const b = (remoteState.data || {})[subjectId] || {};
    data[subjectId] = {
      ...b,
      ...a,
      topics: mergeList(a.topics, b.topics, "data/" + subjectId + "/topics", tombstones),
      custom: mergeList(a.custom, b.custom, "data/" + subjectId + "/custom", tombstones),
    };
  });
  if (subjects.size) out.data = data;

  const owners = new Set([...Object.keys(localState.notebooks || {}), ...Object.keys(remoteState.notebooks || {})]);
  const notebooks = {};
  owners.forEach((owner) => {
    notebooks[owner] = mergeList(
      (localState.notebooks || {})[owner],
      (remoteState.notebooks || {})[owner],
      "notebooks/" + owner,
      tombstones
    );
  });
  if (owners.size) out.notebooks = notebooks;

  SCALAR_FIELDS.forEach((field) => {
    const value = pickScalar(localState, remoteState, field);
    if (value !== undefined) out[field] = value;
  });

  LOCAL_ONLY_FIELDS.forEach((field) => {
    if (localState[field] !== undefined) out[field] = localState[field];
  });

  const scalars = { ...(remoteState[SCALAR_STAMPS] || {}) };
  Object.keys(localState[SCALAR_STAMPS] || {}).forEach((field) => {
    const ts = localState[SCALAR_STAMPS][field];
    if (!scalars[field] || ts > scalars[field]) scalars[field] = ts;
  });

  out[TOMBSTONES] = tombstones;
  out[SCALAR_STAMPS] = scalars;
  return out;
}

// Для хранилища: обе стороны приходят строками JSON.
export function mergeSerialized(localJson, remoteJson) {
  try {
    return JSON.stringify(mergeStates(JSON.parse(localJson), JSON.parse(remoteJson)));
  } catch (e) {
    return null; // испорченный JSON — пусть решает обычное «свежее побеждает»
  }
}
