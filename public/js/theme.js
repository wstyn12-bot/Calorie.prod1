// Applies the saved theme before first paint (avoids a light flash in dark mode).
(function () {
  try {
    var t = localStorage.getItem("cp_theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {
    /* storage unavailable */
  }
})();
