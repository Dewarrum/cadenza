// About screen: what Cadenza is and whose work it plays. The music credits are built from the
// piece catalogue (each piece file records its Mutopia page, engraver and license); the piano,
// type and code credits are static in index.html.
import type { PieceInfo } from "../pieces.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// "CC BY-SA 4.0" -> its deed on creativecommons.org; any other license stays plain text.
function licenseUrl(license: string): string | null {
  const cc = /^CC ([A-Z]+(?:-[A-Z]+)*) (\d\.\d)$/.exec(license);
  return cc && `https://creativecommons.org/licenses/${cc[1].toLowerCase()}/${cc[2]}/`;
}

const text = (tag: string, className: string, content: string) => Object.assign(document.createElement(tag), { className, textContent: content });
const link = (href: string, content: string) => Object.assign(document.createElement("a"), { href, textContent: content, target: "_blank", rel: "noopener" });

export function aboutScreen(pieces: PieceInfo[], back: () => void) {
  $("credits").replaceChildren(
    ...pieces.map((p) => {
      const url = licenseUrl(p.license);
      const license = url ? Object.assign(link(url, p.license), { className: "license" }) : text("span", "license", p.license);
      const source = text("p", "source", `${p.opus} · engraved by ${p.engraver} for the `);
      source.append(link(p.page, "Mutopia Project"));
      const terms = text("p", "source", "License ");
      terms.append(license);
      const item = text("li", "credit", "");
      item.append(text("p", "composer", p.composer), text("p", "work", p.title), source, terms);
      return item;
    }),
  );
  $("version").textContent = `Version ${__APP_VERSION__}`;
  $("about-back").addEventListener("click", back);

  return {
    key(e: KeyboardEvent): void {
      if (e.code === "Escape") back();
    },
  };
}
