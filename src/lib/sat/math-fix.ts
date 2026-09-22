"use client";

// College Board question HTML leans on MathML elements that browsers render
// inconsistently. Ported from ScoreClimb, which found each of these the hard way:
//
// - <mfenced> (parentheses/brackets around math) renders with NO delimiters in
//   some engines — silently dropping brackets. Rewritten as explicit <mo>s.
// - <menclose notation="top"> (line-segment bars) only has "radical" in
//   Chromium, so it draws nothing. Rewritten as a text-decorated <mrow>.
// - An overline <mover> accent isn't stretchy, so the bar covers part of the
//   base. Rewritten the same way; other accents are left native.
//
// Call once, right after question HTML is injected — never from a
// document-wide MutationObserver, which ScoreClimb found makes MathML thrash.

const MATHML_NS = "http://www.w3.org/1998/Math/MathML";

const MENCLOSE_CSS: Record<string, string> = {
  top: "overline",
  bottom: "underline",
  underline: "underline",
  overline: "overline",
  horizontalstrike: "line-through",
  strike: "line-through",
};

const OVERLINE_ACCENTS = new Set(["¯", "‾"]); // macron, overline

const mkMo = (s: string) => {
  const m = document.createElementNS(MATHML_NS, "mo");
  m.textContent = s;
  return m;
};

function fixMfenced(el: Element) {
  const open = el.hasAttribute("open") ? el.getAttribute("open")! : "(";
  const close = el.hasAttribute("close") ? el.getAttribute("close")! : ")";
  const sepAttr = el.getAttribute("separators");
  const seps = sepAttr !== null ? sepAttr.replace(/\s+/g, "").split("") : [","];
  const kids = Array.from(el.childNodes).filter(
    (n) => n.nodeType === 1 || (n.nodeType === 3 && (n.textContent ?? "").trim() !== ""),
  );
  const mrow = document.createElementNS(MATHML_NS, "mrow");
  if (open) mrow.appendChild(mkMo(open));
  kids.forEach((kid, i) => {
    mrow.appendChild(kid);
    if (i < kids.length - 1) {
      const sep = seps[Math.min(i, seps.length - 1)];
      if (sep) mrow.appendChild(mkMo(sep));
    }
  });
  if (close) mrow.appendChild(mkMo(close));
  el.replaceWith(mrow);
}

function fixMenclose(el: Element) {
  const notations = (el.getAttribute("notation") || "longdiv").trim().split(/\s+/);
  const decorations = notations.map((n) => MENCLOSE_CSS[n]).filter(Boolean);
  if (!decorations.length) return;
  const mrow = document.createElementNS(MATHML_NS, "mrow");
  mrow.setAttribute("style", `text-decoration: ${decorations.join(" ")};`);
  Array.from(el.childNodes).forEach((kid) => mrow.appendChild(kid));
  el.replaceWith(mrow);
}

function fixMover(el: Element) {
  const kids = Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1);
  if (kids.length < 2) return;
  const accentEl = kids[kids.length - 1];
  const accentChar = accentEl.tagName.toLowerCase() === "mo" ? (accentEl.textContent ?? "").trim() : "";
  if (!OVERLINE_ACCENTS.has(accentChar)) return;
  const baseEl = kids[0];
  const mrow = document.createElementNS(MATHML_NS, "mrow");
  mrow.setAttribute("style", "text-decoration: overline;");
  const baseChildren = baseEl.tagName.toLowerCase() === "mrow" ? Array.from(baseEl.childNodes) : [baseEl];
  baseChildren.forEach((c) => mrow.appendChild(c));
  el.replaceWith(mrow);
}

export function fixMathHTML(container: Element | null) {
  if (!container) return;
  container.querySelectorAll("mfenced").forEach(fixMfenced);
  container.querySelectorAll("menclose").forEach(fixMenclose);
  container.querySelectorAll("mover").forEach(fixMover);
}
