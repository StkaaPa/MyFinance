const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const TIPOS = {
  reforma: ["PPR", "#2f6be0"],
  investimento: ["Investimentos", "#e0b84a"],
  poupanca: ["Poupança", "#f49a4a"],
  conta_ordem: ["Dinheiro", "#8a4fc4"],
};

const $ = (id) => document.getElementById(id);
const nomeMes = (aaaamm) => {
  const [a, m] = aaaamm.split("-");
  return MESES[+m - 1] + " " + a;
};

async function pedir(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

/* ---------- Cartões KPI ---------- */
function kpi(id, valor, variacao, subirEBom) {
  $(id + "-valor").textContent = valor;
  const el = $(id + "-var");
  el.className = "kpi-delta";
  if (!variacao || variacao === "—") {
    el.replaceChildren();
    return;
  }
  const small = document.createElement("small");
  small.textContent = " vs. mês anterior";
  el.replaceChildren(variacao, small);
  const subiu = variacao.startsWith("+");
  el.classList.add(subiu === subirEBom ? "bom" : "mau");
}

/* ---------- Gráfico de linha (SVG) ---------- */
function passoBonito(bruto) {
  const exp = Math.pow(10, Math.floor(Math.log10(bruto)));
  return [1, 2, 2.5, 5, 10].map((f) => f * exp).find((p) => p >= bruto);
}
const rotuloK = (v) => (v >= 1000 ? v / 1000 + "k" : String(v));

function desenharLinha(pontos) {
  const alvo = $("grafico-evolucao");
  if (!pontos.length) {
    alvo.textContent = "Sem dados";
    return;
  }
  const W = 420,
    H = 210,
    esq = 34,
    dir = 14,
    topo = 12,
    base = 26;
  const max = Math.max(...pontos.map((p) => p.patrimonio), 1);
  const passo = passoBonito(max / 4);
  const topoEixo = passo * Math.ceil(max / passo);
  const larg = W - esq - dir,
    alt = H - topo - base;
  const x = (i) =>
    esq +
    (pontos.length === 1
      ? larg / 2
      : 14 + (i * (larg - 28)) / (pontos.length - 1));
  const y = (v) => topo + alt * (1 - v / topoEixo);

  let grelha = "";
  for (let v = 0; v <= topoEixo; v += passo) {
    grelha +=
      `<line x1="${esq}" x2="${W - dir}" y1="${y(v)}" y2="${y(v)}" stroke="#e4e9f2"/>` +
      `<text x="${esq - 6}" y="${y(v) + 3}" text-anchor="end">${rotuloK(v)}</text>`;
  }
  const xs = pontos.map(
    (p, i) => `${x(i).toFixed(1)},${y(p.patrimonio).toFixed(1)}`,
  );
  const area = `M${x(0)},${y(0)} L${xs.join(" L")} L${x(pontos.length - 1)},${y(0)}Z`;
  const rotulosX = pontos
    .map(
      (p, i) =>
        `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${Number(p.ano)}</text>`,
    )
    .join("");
  const bolas = pontos
    .map(
      (p, i) =>
        `<circle cx="${x(i)}" cy="${y(p.patrimonio)}" r="${i === pontos.length - 1 ? 4.5 : 3}" fill="#2f6be0"/>`,
    )
    .join("");

  alvo.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f6be0" stop-opacity=".25"/><stop offset="1" stop-color="#2f6be0" stop-opacity="0"/></linearGradient></defs>
    ${grelha}<path d="${area}" fill="url(#area)"/>
    <polyline points="${xs.join(" ")}" fill="none" stroke="#2f6be0" stroke-width="2.2" stroke-linejoin="round"/>
    ${bolas}${rotulosX}</svg>`;
}

/* ---------- Donut + legenda ---------- */
function desenharDistribuicao(itens) {
  const donut = $("donut"),
    legenda = $("legenda");
  legenda.replaceChildren();
  const total = itens.reduce((s, i) => s + i.valor, 0);
  if (!total) {
    donut.style.background = "";
    return;
  }
  let acc = 0;
  const partes = itens.map((i) => {
    const [, cor] = TIPOS[i.nome] ?? [i.nome, "#9aa7bd"];
    const ini = acc;
    acc += (i.valor / total) * 100;
    return `${cor} ${ini}% ${acc}%`;
  });
  donut.style.background = `conic-gradient(${partes.join(",")})`;
  for (const i of itens) {
    const [rotulo, cor] = TIPOS[i.nome] ?? [i.nome, "#9aa7bd"];
    const li = document.createElement("li");
    const bola = document.createElement("i");
    bola.style.background = cor;
    const nome = document.createElement("span");
    nome.textContent = rotulo;
    const pct = document.createElement("b");
    pct.textContent = Math.round((i.valor / total) * 100) + "%";
    li.append(bola, nome, pct);
    legenda.append(li);
  }
}

/* ---------- Carregar a página ---------- */
async function carregar(mes) {
  try {
    const d = await pedir("/api/dashboard" + (mes ? "?mes=" + mes : ""));
    kpi("patrimonio", d.patrimonio, d.patrimonio_variacao, true);
    kpi("receitas", d.receitas, d.receitas_variacao, true);
    kpi("despesas", d.despesas, d.despesas_variacao, false);
    kpi("taxa", d.taxa_poupanca, d.taxa_variacao, true);
    desenharLinha(d.evolucao);
    desenharDistribuicao(d.distribuicao);
    $("fundo-texto").textContent = d.fundo_texto;
  } catch (e) {
    console.warn("Dashboard sem dados:", e.message);
    for (const id of ["patrimonio", "receitas", "despesas", "taxa"])
      kpi(id, "—", null, true);
    desenharLinha([]);
    desenharDistribuicao([]);
    $("fundo-texto").textContent =
      "Ainda não há meses fechados. Faz o primeiro fecho para ver os dados.";
  }
}

async function iniciar() {
  const select = $("mes");
  const fechos = await pedir("/api/fechos").catch(() => []);
  for (const f of fechos) {
    const o = document.createElement("option");
    o.value = f.mes;
    o.textContent = nomeMes(f.mes);
    select.append(o);
  }
  if (!fechos.length) select.append(new Option("Sem meses", ""));
  select.addEventListener("change", () => carregar(select.value));
  carregar(fechos.length ? fechos[0].mes : null);
}

iniciar();
