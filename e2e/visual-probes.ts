/**
 * Sondas executadas dentro da página (como texto, porque o tsconfig dos scripts não tem a lib DOM).
 * Cada uma devolve uma lista de achados; lista vazia = nada a corrigir.
 */

/** Texto com contraste menor que 4,5:1 (3:1 para texto grande), contra o fundo realmente pintado. */
export const SONDA_CONTRASTE = `(() => {
  const num = (s) => Number.parseFloat(s);
  function parse(c) {
    let m = c.match(/^rgba?\\(([^)]+)\\)$/);
    if (m) {
      const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(num);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    m = c.match(/^color\\(srgb ([^)]+)\\)$/);
    if (m) {
      const p = m[1].split(/[\\s\\/]+/).filter(Boolean).map(num);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
    }
    return null;
  }
  const over = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
      g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
      b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
      a,
    };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  function fundo(el) {
    const camadas = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== 'none') return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { camadas.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = camadas.length - 1; i >= 0; i--) base = over(camadas[i], base);
    return base;
  }
  function opacidade(el) {
    let o = 1;
    for (let n = el; n; n = n.parentElement) o *= num(getComputedStyle(n).opacity);
    return o;
  }
  const achados = [];
  const vistos = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const texto = t.nodeValue.trim();
    if (!texto) continue;
    const el = t.parentElement;
    if (!el || vistos.has(el)) continue;
    if (el.closest('script,style,noscript,[hidden],[aria-hidden="true"],:disabled,option,dialog:not([open]),next-route-announcer')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    vistos.add(el);
    const fg = parse(cs.color);
    const bg = fundo(el);
    if (!fg || !bg) continue;
    const a = fg.a * opacidade(el);
    const fgOver = over({ ...fg, a }, bg);
    const l1 = lum(fgOver), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const px = num(cs.fontSize);
    const grande = px >= 24 || (px >= 18.66 && num(cs.fontWeight) >= 700);
    const minimo = grande ? 3 : 4.5;
    if (ratio < minimo) {
      achados.push({
        texto: texto.slice(0, 40),
        ratio: Math.round(ratio * 100) / 100,
        minimo,
        cor: cs.color,
        fundo: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')',
        no: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''),
      });
    }
  }
  return achados;
})()`;

/** Texto cortado sem reticências (corte de verdade, não truncamento intencional com title). */
export const SONDA_CORTE = `(() => {
  const achados = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (el.closest('[hidden],[aria-hidden="true"],dialog:not([open]),next-route-announcer,.ap-skip')) continue;
    const corta = cs.overflowX === 'hidden' || cs.overflowY === 'hidden' || cs.overflow === 'hidden';
    if (!corta) continue;
    if (cs.textOverflow === 'ellipsis') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const temTexto = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (!temTexto) continue;
    if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
      achados.push({
        no: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''),
        texto: el.textContent.trim().slice(0, 40),
        scroll: el.scrollWidth + 'x' + el.scrollHeight,
        caixa: el.clientWidth + 'x' + el.clientHeight,
      });
    }
  }
  return achados;
})()`;

export const SONDA_ROLAGEM_HORIZONTAL = `document.documentElement.scrollWidth - document.documentElement.clientWidth`;
