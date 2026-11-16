import { $ } from "./utils.js";

export function initEffects() {
  // owl eyes follow the pointer
  addEventListener("pointermove", (e) =>
    document.querySelectorAll(".pf").forEach((p) => {
      const r = p.ownerSVGElement.getBoundingClientRect(),
        dx = e.clientX - (r.left + r.width / 2),
        dy = e.clientY - (r.top + r.height / 2),
        d = Math.hypot(dx, dy) || 1;
      p.style.transform = `translate(${(dx / d) * 3}px,${(dy / d) * 3}px)`;
    }),
  );
  // home demo loop
  const DM = [
    [
      "How much attendance do I need?",
      "You need at least 75% attendance in every course to sit the final exam. [1] Attendance Policy",
    ],
    [
      "What is the pass mark?",
      "You must score at least 50% overall to pass. [1] CS101 Course Outline",
    ],
  ];
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    let i = 0;
    while (1) {
      const [q, a] = DM[i++ % 2];
      $("da").textContent = "";
      $("dq").textContent = "";
      for (const c of q) {
        $("dq").textContent += c;
        await sl(35);
      }
      await sl(500);
      for (const c of a) {
        $("da").textContent += c;
        await sl(18);
      }
      await sl(2600);
    }
  })();
}
