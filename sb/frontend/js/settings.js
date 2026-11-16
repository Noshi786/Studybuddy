import { S } from "./state.js";
import { $ } from "./utils.js";

export function initSettings() {
  $("k").oninput = (e) => {
    S.k = +e.target.value;
    $("kv").textContent = S.k;
  };
  $("th").oninput = (e) => {
    S.th = +e.target.value;
    $("tv").textContent = S.th.toFixed(2);
  };
  const MH = {
    semantic: "Semantic finds passages by meaning, even if the words differ.",
    hybrid: "Hybrid mixes meaning-based and keyword search.",
  };
  document.querySelectorAll("[data-m]").forEach(
    (b) =>
      (b.onclick = () => {
        S.mode = b.dataset.m;
        document
          .querySelectorAll("[data-m]")
          .forEach((x) => x.classList.toggle("on", x == b));
        $("mh").textContent = MH[S.mode];
      }),
  );
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        document
          .querySelectorAll("[data-tab]")
          .forEach((x) => x.classList.toggle("on", x == b));
        $("tab-tune").classList.toggle("on", b.dataset.tab == "tune");
        $("tab-scores").classList.toggle("on", b.dataset.tab == "scores");
      }),
  );
}
