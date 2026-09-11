// Определение устройства. Нужно в двух местах — установка приложения и подписка
// на календарь, — и в обоих ответ один и тот же, поэтому живёт отдельно.

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true
  );
}

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // На iPadOS Safari прикидывается макбуком, поэтому смотрим ещё и на касания.
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

export function isAndroid() {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent || "");
}

export function isHandheld() {
  if (typeof window === "undefined") return false;
  return (window.matchMedia && window.matchMedia("(max-width: 820px)").matches) || navigator.maxTouchPoints > 0;
}

// Safari на маке ставит приложение в Dock, но про beforeinstallprompt не знает.
export function isDesktopSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /safari/i.test(ua) && !/chrome|chromium|edg\//i.test(ua);
}

// Какую инструкцию показывать: у каждого семейства свой путь к подписке.
export function platform() {
  if (isIOS()) return "ios";
  if (isAndroid()) return "android";
  return "desktop";
}
