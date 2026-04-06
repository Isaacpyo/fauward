export const SPEED_MARK_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg
  viewBox="0 0 40 40"
  xmlns="http://www.w3.org/2000/svg"
  fill="currentColor"
  aria-label="Fauward"
  role="img"
>
  <rect x="6" y="6" width="20" height="5" rx="2"/>
  <rect x="6" y="6" width="5" height="28" rx="2"/>
  <rect x="6" y="18" width="15" height="4" rx="2"/>
  <polygon points="30,4 26,12 28.5,11 28.5,20 31.5,20 31.5,11 34,12"/>
</svg>
`;

export function createSpeedMarkElement(): SVGElement {
  const template = document.createElement('template');
  template.innerHTML = SPEED_MARK_SVG.trim();
  return template.content.firstElementChild as SVGElement;
}