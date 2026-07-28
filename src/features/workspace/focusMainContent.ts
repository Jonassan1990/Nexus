/** Focus the primary workspace landmark after navigation. */
export function focusMainContent() {
  if (typeof document === "undefined") {
    return;
  }

  const main = document.getElementById("main-content");

  if (!(main instanceof HTMLElement)) {
    return;
  }

  window.requestAnimationFrame(() => {
    main.focus({ preventScroll: true });
  });
}
