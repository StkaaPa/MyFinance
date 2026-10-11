// Página Investimentos. Usa as funções de util.js: $, criar, api, eur, nomeMes, lerValor.
const CLASSES = {
  etf: "ETFs",
  acao: "Ações",
  cripto: "Cripto",
  ppr: "PPR",
  outro: "Outros",
};
const COR_CLASSE = {
  ppr: "#2f6be0",
  etf: "#2bb08a",
  acao: "#8a4fc4",
  cripto: "#ef6a5a",
  outro: "#9aa7bd",
};
const PALETA = [
  "#2f6be0",
  "#2bb08a",
  "#8a4fc4",
  "#ef6a5a",
  "#f5b942",
  "#2bb3d6",
  "#f49a4a",
  "#9aa7bd",
];

const seletor = $("mes");
const aviso = $("aviso");
const modal = $("modal-ativo");
const form = $("form-ativo");
const erro = $("erro-ativo");

let meses = []; // meses existentes (mais recente primeiro)
let dados = null; // resposta de /api/investimentos
let filtro = "todos"; // "todos" ou uma classe (etf, acao, cripto, ppr, outro)

const diaMes = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const pct = (n) =>
  (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(1).replace(".", ",") + "%";
const eurSinal = (n) => (n >= 0 ? "+" : "−") + eur(Math.abs(n));

function mostrarAviso(msg, info = false) {
  aviso.className = info ? "aviso info" : "aviso";
  aviso.textContent = msg;
  aviso.hidden = !msg;
}

// Escreve uma variação (seta + texto) num elemento .delta
function pintarDelta(el, texto, valor, legenda) {
  el.className = "delta";
  el.replaceChildren();
  if (valor === null) {
    if (legenda) el.append(criar("small", "", legenda));
    return;
  }
  el.classList.add(valor >= 0 ? "bom" : "mau");
  el.append(criar("span", "seta", valor >= 0 ? "▲" : "▼"), texto);
  if (legenda) el.append(criar("small", "", legenda));
}

const visiveis = () =>
  dados
    ? dados.itens.filter((i) => filtro === "todos" || i.classe === filtro)
    : [];

/* ---------- Separadores: "Todos" + só as classes que existem ---------- */

function desenharTabs() {
  const presentes = dados
    ? Object.keys(CLASSES).filter((c) =>
        dados.itens.some((i) => i.classe === c),
      )
    : [];
  if (filtro !== "todos" && !presentes.includes(filtro)) filtro = "todos";
  const tabs = $("tabs");
  tabs.replaceChildren();
  for (const c of ["todos", ...presentes]) {
    const b = criar(
      "button",
      "tab" + (c === filtro ? " active" : ""),
      c === "todos" ? "Todos" : CLASSES[c],
    );
    b.type = "button";
    b.addEventListener("click", () => {
      filtro = c;
      desenhar();
    });
    tabs.append(b);
  }
}

/* ---------- Cartões: total e rendimento ---------- */

function desenharCartoes(itens) {
  const total = itens.reduce((s, i) => s + i.valor, 0);
  $("total").textContent = eur(total);

  // variação face ao mês anterior (só se algum item já existia nesse mês)
  const comAnterior = itens.filter((i) => i.valor_anterior !== null);
  const anterior = comAnterior.reduce((s, i) => s + i.valor_anterior, 0);
  if (comAnterior.length && anterior > 0) {
    const v = ((total - anterior) / anterior) * 100;
    pintarDelta($("variacao"), pct(v), v, "vs. mês anterior");
  } else {
    pintarDelta($("variacao"), "", null, "Sem mês anterior para comparar");
  }

  // rendimento YTD: só dos itens com histórico (dois ou mais registos no ano)
  const comRend = itens.filter((i) => i.rendimento_ytd !== null);
  if (comRend.length) {
    const rend = comRend.reduce((s, i) => s + i.rendimento_ytd, 0);
    const capital = comRend.reduce((s, i) => s + i.capital_ytd, 0);
    const p = capital > 0 ? (rend / capital) * 100 : 0;
    $("rend-pct").textContent = pct(p);
    pintarDelta(
      $("rend-eur"),
      eurSinal(rend),
      rend,
      "desde " + nomeMes(dados.base_mes),
    );
  } else {
    $("rend-pct").textContent = "—";
    pintarDelta(
      $("rend-eur"),
      "",
      null,
      "Precisa de pelo menos dois meses de dados",
    );
  }
}

/* ---------- Donut e legenda ---------- */

function desenharDistribuicao(itens) {
  const legenda = $("legenda");
  legenda.replaceChildren();
  const total = itens.reduce((s, i) => s + i.valor, 0);
  $("centro").textContent = eur(total, 0);

  // Em "Todos" agrupa por classe; dentro de uma classe mostra cada ativo
  let linhas;
  if (filtro === "todos") {
    const por = new Map();
    for (const i of itens) {
      const g = por.get(i.classe) || {
        nome: CLASSES[i.classe],
        valor: 0,
        rend: null,
        cor: COR_CLASSE[i.classe],
      };
      g.valor += i.valor;
      if (i.rendimento_ytd !== null) g.rend = (g.rend || 0) + i.rendimento_ytd;
      por.set(i.classe, g);
    }
    linhas = [...por.values()].sort((a, b) => b.valor - a.valor);
  } else {
    linhas = itens.map((i, n) => ({
      nome: i.nome,
      valor: i.valor,
      rend: i.rendimento_ytd,
      cor: PALETA[n % PALETA.length],
    }));
  }

  if (!linhas.length || total <= 0) {
    $("donut").style.background = "";
    legenda.append(
      criar(
        "li",
        "vazio",
        dados
          ? "Ainda não há investimentos neste mês."
          : "Ainda não há meses. Cria o primeiro com o fecho de mês.",
      ),
    );
    return;
  }

  let acc = 0;
  const fatias = linhas.map((l) => {
    const ini = acc;
    acc += (l.valor / total) * 100;
    return `${l.cor} ${ini}% ${acc}%`;
  });
  $("donut").style.background = `conic-gradient(${fatias.join(",")})`;

  for (const l of linhas) {
    const li = criar("li");
    const bola = criar("i");
    bola.style.background = l.cor;
    const rend = criar(
      "span",
      "rend",
      l.rend === null ? "" : "Rendimento " + eurSinal(l.rend),
    );
    if (l.rend !== null) rend.classList.add(l.rend >= 0 ? "bom" : "mau");
    li.append(
      bola,
      criar("span", "nome", l.nome),
      criar("span", "pct", Math.round((l.valor / total) * 100) + "%"),
      criar("span", "val", eur(l.valor)),
      rend,
    );
    legenda.append(li);
  }
}

/* ---------- Movimentos ---------- */

// "Tipo" deriva do sinal do depositado: PPR -> Depósito/Levantamento; resto -> Compra/Venda
function tipoMovimento(m) {
  const entra = m.valor > 0;
  if (m.classe === "ppr") return entra ? "Depósito" : "Levantamento";
  return entra ? "Compra" : "Venda";
}

function desenharMovimentos() {
  const corpo = $("corpo");
  corpo.replaceChildren();
  const movs = dados
    ? dados.movimentos.filter((m) => filtro === "todos" || m.classe === filtro)
    : [];
  if (!movs.length) {
    const tr = criar("tr");
    const td = criar(
      "td",
      "vazio",
      dados
        ? "Ainda não há movimentos. Indica o valor depositado no fecho do mês."
        : "Ainda não há meses.",
    );
    td.colSpan = 4;
    tr.append(td);
    corpo.append(tr);
    return;
  }
  for (const m of movs) {
    const tr = criar("tr");
    tr.append(
      criar("td", "", diaMes(m.data)),
      criar("td", "", m.ativo),
      criar("td", "", tipoMovimento(m)),
      criar("td", "dir valor", eur(Math.abs(m.valor))),
    );
    corpo.append(tr);
  }
}

function desenhar() {
  desenharTabs();
  const itens = visiveis();
  desenharCartoes(itens);
  desenharDistribuicao(itens);
  desenharMovimentos();
}

/* ---------- Carregar ---------- */

async function carregarMeses(escolhido) {
  try {
    meses = (await api("/api/fechos")).map((f) => f.mes);
  } catch (e) {
    meses = [];
    mostrarAviso("Não foi possível carregar os meses: " + e.message);
  }
  seletor.replaceChildren();
  if (!meses.length) seletor.append(new Option("Sem meses", ""));
  for (const m of meses) seletor.append(new Option(nomeMes(m), m));
  if (meses.length)
    seletor.value = meses.includes(escolhido) ? escolhido : meses[0];
  return seletor.value;
}

async function carregar(mes) {
  dados = null;
  if (mes) {
    try {
      dados = await api("/api/investimentos?mes=" + mes);
      mostrarAviso("");
    } catch (e) {
      if (e.status !== 404)
        mostrarAviso(
          "Não foi possível carregar os investimentos: " + e.message,
        );
    }
  }
  desenhar();
}

seletor.addEventListener("change", () => carregar(seletor.value));

/* ---------- Pop-up "Adicionar investimento" ---------- */

$("btn-adicionar").addEventListener("click", async () => {
  form.reset();
  erro.textContent = "";
  const guardar = $("btn-guardar");
  guardar.disabled = false;

  const classe = form.elements.classe;
  classe.replaceChildren();
  for (const [k, nome] of Object.entries(CLASSES))
    classe.append(new Option(nome, k));

  const conta = form.elements.conta;
  conta.replaceChildren();
  try {
    const contas = (await api("/api/contas")).filter(
      (c) => c.ativo && (c.tipo === "investimento" || c.tipo === "reforma"),
    );
    for (const c of contas)
      conta.append(new Option(c.nome + " (" + c.instituicao + ")", c.id));
    if (!contas.length) {
      erro.textContent =
        "Ainda não tens contas de investimento ou reforma ativas. Cria uma na página Contas.";
      guardar.disabled = true;
    }
  } catch (e) {
    erro.textContent = "Não foi possível carregar as contas: " + e.message;
    guardar.disabled = true;
  }
  modal.showModal();
});

$("btn-cancelar").addEventListener("click", () => modal.close());

form.addEventListener("input", () => {
  erro.textContent = "";
});

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const corpo = {
    nome: form.elements.nome.value.trim(),
    classe: form.elements.classe.value,
    conta_id: Number(form.elements.conta.value),
  };
  if (!corpo.nome) {
    erro.textContent = "Indica o nome do investimento.";
    return;
  }
  if (!corpo.conta_id) {
    erro.textContent = "Escolhe a conta.";
    return;
  }
  try {
    await api("/api/ativos", "POST", corpo);
  } catch (e) {
    erro.textContent = e.message;
    return;
  }
  modal.close();
  mostrarAviso(
    "«" +
      corpo.nome +
      "» criado. Indica o valor dele no próximo «Fechar mês» para aparecer aqui.",
    true,
  );
});

(async () => carregar(await carregarMeses()))();
