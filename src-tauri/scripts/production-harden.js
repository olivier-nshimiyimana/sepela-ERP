(function () {
  const stop = function (e) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  };
  document.addEventListener("contextmenu", stop, { capture: true });
  document.addEventListener(
    "keydown",
    function (e) {
      const m = e.ctrlKey || e.metaKey;
      if (e.key === "F12") return stop(e);
      if (m && e.shiftKey && ["I", "J", "C"].includes(e.key)) return stop(e);
      if (m && !e.shiftKey && (e.key === "U" || e.key === "u")) return stop(e);
    },
    { capture: true }
  );
})();
