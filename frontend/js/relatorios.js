// Página Relatórios. Usa as funções de util.js: $, criar, api, eur.
const MESES_CURTOS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];
const TIPOS_CONTA = {
  conta_ordem: "Conta à ordem",
  poupanca: "Poupança",
  investimento: "Investimento",
  reforma: "Reforma",
};
const PALETA = [
  "#2f6be0",
  "#f5b942",
  "#2bb08a",
  "#ef6a5a",
  "#8a4fc4",
  "#f49a4a",
  "#2bb3d6",
  "#9aa7bd",
];
const COR_INVEST = "#2f6be0",
  COR_LIQUIDEZ = "#2bb08a",
  COR_REC = "#2bb08a",
  COR_DESP = "#ef6a5a";

const aviso = $("aviso");
let dados = null;
let separador = "tendencias";

const SEPARADORES = [
  ["tendencias", "Tendências"],
  ["comparativos", "Comparativos"],
  ["poupanca", "Taxa de Poupança"],
  ["distribuicao", "Distribuição"],
];

const mesCurto = (aaaamm) => MESES_CURTOS[Number(aaaamm.slice(5, 7)) - 1];
const mesLongo = (aaaamm) => mesCurto(aaaamm) + " " + aaaamm.slice(0, 4);
const pct1 = (n) => n.toFixed(1).replace(".", ",") + "%";
const eur0 = (n) => eur(n, 0);

function mostrarAviso(msg) {
  aviso.textContent = msg;
  aviso.hidden = !msg;
}

/* ---------- Gráficos em SVG (valores sempre vêm de números da API, nunca de texto do utilizador) ---------- */

function passoBonito(bruto) {
  const exp = Math.pow(10, Math.floor(Math.log10(bruto)));
  return [1, 2, 2.5, 5, 10].map((f) => f * exp).find((p) => p >= bruto);
}

// Escala vertical "bonita" que inclui o zero. Devolve {lo, hi, passo}
function escala(min, max) {
  max = Math.max(max, 0);
  min = Math.min(min, 0);
  const passo = passoBonito(Math.max((max - min) / 4, 1e-9));
  return {
    lo: passo * Math.floor(min / passo + 1e-9),
    hi: passo * Math.ceil(max / passo - 1e-9) || passo,
    passo,
  };
}

const rotuloEixo = (v, formato) =>
  formato === "pct"
    ? Math.round(v) + "%"
    : Math.abs(v) >= 1000
      ? String(v / 1000).replace(".", ",") + "k"
      : String(v);

const W = 700,
  H = 280,
  ESQ = 42,
  DIR = 12,
  TOPO = 12,
  BASE = 26;

function eixos(esc, formato) {
  const alt = H - TOPO - BASE;
  const y = (v) => TOPO + alt * (1 - (v - esc.lo) / (esc.hi - esc.lo));
  let grelha = "";
  for (let v = esc.lo; v <= esc.hi + 1e-9; v += esc.passo) {
    grelha +=
      `<line x1="${ESQ}" x2="${W - DIR}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? "#cfd8e6" : "#e4e9f2"}"/>` +
      `<text x="${ESQ - 6}" y="${y(v) + 3}" text-anchor="end">${rotuloEixo(v, formato)}</text>`;
  }
  return { y, grelha };
}

// grupos: [{rotulo, valores:[...]}]; cores: uma por série; empilhado: true = barras empilhadas
function barras(alvo, grupos, cores, empilhado) {
  const totais = grupos.map((g) =>
    empilhado ? g.valores.reduce((s, v) => s + v, 0) : Math.max(...g.valores),
  );
  const esc = escala(0, Math.max(...totais, 1));
  const { y, grelha } = eixos(esc);
  const larg = W - ESQ - DIR,
    faixa = larg / grupos.length;
  const nSeries = empilhado ? 1 : cores.length;
  const lBarra = Math.min(46, (faixa * 0.62) / nSeries);
  let corpo = "";
  grupos.forEach((g, i) => {
    const centro = ESQ + faixa * (i + 0.5);
    let acumulado = 0;
    g.valores.forEach((v, k) => {
      const x = empilhado
        ? centro - lBarra / 2
        : centro - (lBarra * nSeries) / 2 + lBarra * k;
      const de = empilhado ? acumulado : 0;
      const topo = y(de + v),
        base = y(de);
      if (v > 0)
        corpo += `<rect x="${x.toFixed(1)}" y="${topo.toFixed(1)}" width="${lBarra.toFixed(1)}" height="${Math.max(base - topo, 1).toFixed(1)}" rx="3" fill="${cores[k]}"/>`;
      acumulado += v;
    });
    corpo += `<text x="${centro.toFixed(1)}" y="${H - 8}" text-anchor="middle">${g.rotulo}</text>`;
  });
  alvo.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${grelha}${corpo}</svg>`;
}

function linha(alvo, pontos, formato) {
  const valores = pontos.map((p) => p.valor);
  const esc = escala(Math.min(...valores), Math.max(...valores, 1));
  const { y, grelha } = eixos(esc, formato);
  const larg = W - ESQ - DIR;
  const x = (i) =>
    ESQ +
    (pontos.length === 1
      ? larg / 2
      : 16 + (i * (larg - 32)) / (pontos.length - 1));
  const xs = pontos.map(
    (p, i) => `${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`,
  );
  const area =
    pontos.length > 1
      ? `<path d="M${x(0)},${y(0)} L${xs.join(" L")} L${x(pontos.length - 1)},${y(0)}Z" fill="url(#area-rel)"/>`
      : "";
  const bolas = pontos
    .map(
      (p, i) =>
        `<circle cx="${x(i)}" cy="${y(p.valor)}" r="${i === pontos.length - 1 ? 4.5 : 3}" fill="#2f6be0"/>`,
    )
    .join("");
  const rot = pontos
    .map(
      (p, i) =>
        `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${p.rotulo}</text>`,
    )
    .join("");
  alvo.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="area-rel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f6be0" stop-opacity=".22"/><stop offset="1" stop-color="#2f6be0" stop-opacity="0"/></linearGradient></defs>
    ${grelha}${area}<polyline points="${xs.join(" ")}" fill="none" stroke="#2f6be0" stroke-width="2.2" stroke-linejoin="round"/>${bolas}${rot}</svg>`;
}

function donut(itens, centro) {
  const bloco = criar("div", "donut-bloco");
  const d = criar("div", "donut");
  d.append(criar("span", "", centro));
  const lista = criar("ul", "legenda");
  const total = itens.reduce((s, i) => s + i.valor, 0);
  if (!itens.length || total <= 0) {
    bloco.append(criar("p", "grafico", "Ainda não há dados."));
    return bloco;
  }
  let acc = 0;
  const fatias = itens.map((it, n) => {
    const ini = acc;
    acc += (it.valor / total) * 100;
    return `${PALETA[n % PALETA.length]} ${ini}% ${acc}%`;
  });
  d.style.background = `conic-gradient(${fatias.join(",")})`;
  itens.forEach((it, n) => {
    const li = criar("li");
    const bola = criar("i");
    bola.style.background = PALETA[n % PALETA.length];
    li.append(
      bola,
      criar("span", "nome", it.nome),
      criar("span", "pct", Math.round(it.percentagem) + "%"),
      criar("span", "val", eur(it.valor)),
    );
    lista.append(li);
  });
  bloco.append(d, lista);
  return bloco;
}

/* ---------- Ícones das categorias (escolhidos pelo nome; sem correspondência, uma etiqueta) ---------- */

const ICONES = {
  casa: ["#dde9fb", "#2f6be0", "M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6"],
  comida: [
    "#fde3e0",
    "#e5594a",
    "M7 3v7a2 2 0 0 0 4 0V3M9 10v11M17 3c-2 2-2.5 5-2.5 8h2.5v10",
  ],
  carro: ["#fdeed8", "#e8913a", "M5 16V12l2-5h10l2 5v4M3 16h18M7 16v2M17 16v2"],
  saude: [
    "#fbe3e6",
    "#e5594a",
    "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.500-7 10-7 10z",
  ],
  lazer: [
    "#ece3f7",
    "#8a4fc4",
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 14a4.500 4.500 0 0 0 7 0M9 9.500h.01M15 9.500h.01",
  ],
  etiqueta: ["#e8edf5", "#55657d", "M3 12V4h8l10 10-8 8zM8 8h.01"],
};
const semAcentos = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function iconeCategoria(nome) {
  const n = semAcentos(nome);
  let k = "etiqueta";
  if (/habita|casa|renda|condom|agua|luz|energia/.test(n)) k = "casa";
  else if (/aliment|super|restaur|comida|takeaway/.test(n)) k = "comida";
  else if (/transport|carro|combust|auto|gasol/.test(n)) k = "carro";
  else if (/saude|farmac|medic|dent/.test(n)) k = "saude";
  else if (/lazer|entreten|viagem|ferias|cinema/.test(n)) k = "lazer";
  const [fundo, cor, caminho] = ICONES[k];
  const ic = criar("span", "ic");
  ic.style.background = fundo;
  ic.style.color = cor;
  ic.innerHTML = `<svg viewBox="0 0 24 24"><path d="${caminho}"/></svg>`; // caminhos fixos deste ficheiro
  return ic;
}

/* ---------- Cartões ---------- */

function cartao(titulo, extra) {
  const c = criar("section", "card box");
  const h = criar("h2", "", titulo);
  if (extra) h.append(criar("small", "", extra));
  c.append(h);
  return c;
}

function legendaGraf(itens) {
  const l = criar("div", "legenda-graf");
  for (const [nome, cor] of itens) {
    const s = criar("span");
    const q = criar("i");
    q.style.background = cor;
    s.append(q, nome);
    l.append(s);
  }
  return l;
}

const vazio = (texto) => criar("p", "grafico", texto);

function listaDespesasMedias() {
  const m = dados.media_despesas;
  const c = cartao(
    "Média mensal de despesas",
    "(últimos " + m.meses + (m.meses === 1 ? " mês)" : " meses)"),
  );
  if (!m.categorias.length) {
    c.append(vazio("Ainda não há despesas registadas."));
    return c;
  }
  const ul = criar("ul", "lista");
  for (const x of m.categorias) {
    const li = criar("li");
    li.append(
      iconeCategoria(x.categoria),
      criar("span", "nome", x.categoria),
      criar("span", "valor", eur(x.media)),
    );
    ul.append(li);
  }
  c.append(ul);
  return c;
}

/* ---------- Separadores ---------- */

function tendencias() {
  const p = dados.patrimonio;
  const sub = p.modo === "anual" ? "(fim de cada ano)" : "(mês a mês)";
  const esq = cartao("Evolução do Património", sub);
  const g = criar("div", "grafico");
  barras(
    g,
    p.barras.map((b) => ({
      rotulo: p.modo === "anual" ? b.rotulo : mesCurto(b.mes),
      valores: [b.investimentos, b.liquidez],
    })),
    [COR_INVEST, COR_LIQUIDEZ],
    true,
  );
  esq.append(
    g,
    legendaGraf([
      ["Investimentos e reforma", COR_INVEST],
      ["Contas à ordem e poupança", COR_LIQUIDEZ],
    ]),
  );
  return [esq, listaDespesasMedias()];
}

function comparativos() {
  const esq = cartao("Receitas vs Despesas", "(últimos meses)");
  const g = criar("div", "grafico");
  barras(
    g,
    dados.comparativo.meses.map((m) => ({
      rotulo: mesCurto(m.mes),
      valores: [m.receitas, m.despesas],
    })),
    [COR_REC, COR_DESP],
    false,
  );
  esq.append(
    g,
    legendaGraf([
      ["Receitas", COR_REC],
      ["Despesas", COR_DESP],
    ]),
  );

  const dir = cartao(
    "Despesas vs mês anterior",
    dados.mes_anterior
      ? "(" + mesCurto(dados.mes_anterior) + " → " + mesCurto(dados.mes) + ")"
      : "",
  );
  const cats = dados.comparativo.categorias;
  if (!cats.length) {
    dir.append(vazio("Ainda não há despesas registadas."));
    return [esq, dir];
  }
  const ul = criar("ul", "lista");
  for (const x of cats) {
    let texto = "—",
      cls = "";
    if (x.variacao !== null) {
      texto =
        (x.variacao > 0 ? "+" : x.variacao < 0 ? "−" : "") +
        pct1(Math.abs(x.variacao));
      cls = x.variacao > 0 ? " sobe" : x.variacao < 0 ? " desce" : "";
    } else if (x.atual > 0) texto = "novo";
    const li = criar("li");
    li.append(
      iconeCategoria(x.categoria),
      criar("span", "nome", x.categoria),
      criar("span", "valor", eur(x.atual)),
      criar("span", "var" + cls, texto),
    );
    ul.append(li);
  }
  dir.append(ul);
  return [esq, dir];
}

function poupanca() {
  const p = dados.poupanca;
  const esq = cartao(
    "Taxa de Poupança",
    "(receitas − despesas, em % das receitas)",
  );
  const pontos = p.meses
    .filter((m) => m.taxa !== null)
    .map((m) => ({ rotulo: mesCurto(m.mes), valor: m.taxa }));
  const g = criar("div", "grafico");
  if (pontos.length) linha(g, pontos, "pct");
  else g.textContent = "Precisa de meses com receitas registadas.";
  esq.append(g);

  const dir = cartao("Resumo");
  if (!pontos.length) {
    dir.append(vazio("Sem dados."));
    return [esq, dir];
  }
  const dl = criar("dl", "resumo-poup");
  const linhaRes = (nome, valor, nota) => {
    const d = criar("div");
    const dd = criar("dd", "", valor);
    if (nota) dd.append(criar("small", "", nota));
    d.append(criar("dt", "", nome), dd);
    dl.append(d);
  };
  linhaRes("Média do período", pct1(p.media));
  linhaRes("Melhor mês", pct1(p.melhor.taxa), mesLongo(p.melhor.mes));
  linhaRes("Pior mês", pct1(p.pior.taxa), mesLongo(p.pior.mes));
  linhaRes("Último mês", pct1(pontos[pontos.length - 1].valor));
  dir.append(dl);
  return [esq, dir];
}

function distribuicao() {
  const contas = dados.distribuicao.contas.map((c) => ({
    ...c,
    nome: TIPOS_CONTA[c.nome] || c.nome,
  }));
  const esq = cartao(
    "Património por tipo de conta",
    "(" + mesLongo(dados.mes) + ")",
  );
  esq.append(donut(contas, eur0(contas.reduce((s, c) => s + c.valor, 0))));
  const desp = dados.distribuicao.despesas;
  const dir = cartao("Despesas por categoria", "(" + mesLongo(dados.mes) + ")");
  dir.append(donut(desp, eur0(desp.reduce((s, c) => s + c.valor, 0))));
  return [esq, dir];
}

const CONSTRUTORES = { tendencias, comparativos, poupanca, distribuicao };

function desenhar() {
  const tabs = $("tabs");
  tabs.replaceChildren();
  for (const [k, nome] of SEPARADORES) {
    const b = criar("button", "tab" + (k === separador ? " active" : ""), nome);
    b.type = "button";
    b.addEventListener("click", () => {
      separador = k;
      desenhar();
    });
    tabs.append(b);
  }
  const grade = $("grade");
  grade.replaceChildren();
  if (!dados || dados.vazio) {
    const c = cartao("Ainda sem dados");
    c.style.gridColumn = "1 / -1";
    c.append(vazio("Os relatórios aparecem depois do primeiro «Fechar mês»."));
    grade.append(c);
    return;
  }
  grade.append(...CONSTRUTORES[separador]());
}

async function carregar() {
  try {
    dados = await api("/api/relatorios");
    mostrarAviso("");
  } catch (e) {
    dados = null;
    mostrarAviso("Não foi possível carregar os relatórios: " + e.message);
  }
  desenhar();
}

carregar();
