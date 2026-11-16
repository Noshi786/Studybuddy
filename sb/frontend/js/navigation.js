export function initNavigation() {
  // pages
  const PG = ["home", "library", "ask", "learn"];
  function route() {
    const h = location.hash.slice(1),
      p = PG.includes(h) ? h : "home";
    document
      .querySelectorAll(".pg")
      .forEach((e) => e.classList.toggle("on", e.id == "p-" + p));
    document
      .querySelectorAll("[data-go]")
      .forEach((a) => a.classList.toggle("act", a.dataset.go == p));
    scrollTo(0, 0);
  }
  addEventListener("hashchange", route);
  route();
}
