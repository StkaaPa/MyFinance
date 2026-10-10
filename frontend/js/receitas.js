// Página Receitas. Usa as funções de util.js: $, criar, api, eur, nomeMes.
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

const seletor = $("mes");
const aviso = $("aviso");
const modal = $("modal-receita");
const form = $("form-receita");
const erro = $("erro-receita");

let meses = []; // meses que existem na base de dados, do mais recente para o mais antigo
let dados = null; // resposta de /api/receitas
let filtro = "todas"; // "todas" ou o nome de uma categoria (separadores)
let cores = {}; // categoria -> cor

const diaMes = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

function mostrarAviso(msg) {
  aviso.textContent = msg;
  aviso.hidden = !msg;
}

/* ---------- Separadores: "Todas" + uma por categoria ---------- */

function desenharTabs() {
  const nomes = dados ? dados.categorias.map((c) => c.categoria) : [];
  if (filtro !== "todas" && !nomes.includes(filtro)) filtro = "todas";
  const tabs = $("tabs");
  tabs.replaceChildren();
  for (const nome of ["todas", ...nomes]) {
    const b = criar(
      "button",
      "tab" + (nome === filtro ? " active" : ""),
      nome === "todas" ? "Todas" : nome,
    );
    b.type = "button";
    b.addEventListener("click", () => {
      filtro = nome;
      desenharTabs();
      desenharTabela();
    });
    tabs.append(b);
  }
}

/* ---------- Resumo: total, variação, donut, legenda ---------- */

function desenharResumo() {
  const legenda = $("legenda");
  legenda.replaceChildren();
  const delta = $("variacao");
  delta.className = "delta";
  delta.replaceChildren();

  if (!dados) {
    $("total").textContent = eur(0);
    $("centro").textContent = eur(0, 0);
    $("donut").style.background = "";
    return;
  }

  $("total").textContent = dados.total;
  $("centro").textContent = dados.centro;

  if (dados.variacao && dados.variacao !== "—") {
    const subiu = dados.variacao.startsWith("+");
    delta.classList.add(subiu ? "bom" : "mau"); // receitas a subir = bom
    delta.append(
      criar("span", "seta", subiu ? "▲" : "▼"),
      dados.variacao,
      criar("small", "", "vs. mês anterior"),
    );
  } else {
    delta.append(criar("small", "", "Sem mês anterior para comparar"));
  }

  cores = {};
  dados.categorias.forEach(
    (c, i) => (cores[c.categoria] = PALETA[i % PALETA.length]),
  );

  let acc = 0;
  const fatias = dados.categorias.map((c) => {
    const ini = acc;
    acc += (c.valor / dados.total_valor) * 100;
    return `${cores[c.categoria]} ${ini}% ${acc}%`;
  });
  $("donut").style.background =
    dados.total_valor > 0 ? `conic-gradient(${fatias.join(",")})` : "";

  for (const c of dados.categorias) {
    const li = criar("li");
    const bola = criar("i");
    bola.style.background = cores[c.categoria];
    li.append(
      bola,
      criar("span", "nome", c.categoria),
      criar("span", "pct", Math.round(c.percentagem) + "%"),
      criar("span", "val", eur(c.valor)),
    );
    legenda.append(li);
  }
}

/* ---------- Tabela ---------- */

function celulaCategoria(nome) {
  const td = criar("td");
  const div = criar("div", "cat");
  const ponto = criar("i", "ponto");
  ponto.style.background = cores[nome] ?? "#9aa7bd";
  div.append(ponto, criar("span", "", nome));
  td.append(div);
  return td;
}

function desenharTabela() {
  const corpo = $("corpo");
  corpo.replaceChildren();
  const linhas = dados
    ? dados.detalhe.filter((d) => filtro === "todas" || d.categoria === filtro)
    : [];
  if (!linhas.length) {
    const tr = criar("tr");
    const td = criar(
      "td",
      "vazio",
      dados
        ? "Ainda não há receitas neste mês."
        : "Ainda não há meses. Cria o primeiro com o fecho de mês.",
    );
    td.colSpan = 4;
    tr.append(td);
    corpo.append(tr);
    return;
  }
  for (const d of linhas) {
    const tr = criar("tr");
    tr.append(
      criar("td", "", diaMes(dados.data_fim)),
      criar("td", "", d.nome),
      celulaCategoria(d.categoria),
      criar("td", "dir valor", eur(d.valor)),
    );
    corpo.append(tr);
  }
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
      dados = await api("/api/receitas?mes=" + mes);
      mostrarAviso("");
    } catch (e) {
      if (e.status !== 404)
        mostrarAviso("Não foi possível carregar as receitas: " + e.message);
    }
  }
  desenharResumo();
  desenharTabs();
  desenharTabela();
}

seletor.addEventListener("change", () => carregar(seletor.value));

/* ---------- Pop-up "Adicionar receita" ---------- */

function preencherCategorias(cats) {
  const sel = form.elements.categoria;
  sel.replaceChildren();
  const grupos = new Map();
  for (const c of cats) {
    if (!c.categoria_pai) {
      sel.append(new Option(c.nome, c.id));
      continue;
    }
    if (!grupos.has(c.categoria_pai)) {
      const g = document.createElement("optgroup");
      g.label = c.categoria_pai;
      grupos.set(c.categoria_pai, g);
      sel.append(g);
    }
    grupos.get(c.categoria_pai).append(new Option(c.nome, c.id));
  }
}

$("btn-adicionar").addEventListener("click", async () => {
  form.reset();
  erro.textContent = "";
  const nota = $("nota-receita");
  const guardar = $("btn-guardar");
  nota.textContent = "";
  guardar.disabled = false;

  let cats = [];
  try {
    cats = await api("/api/receitas/categorias");
  } catch (e) {
    erro.textContent = "Não foi possível carregar as categorias: " + e.message;
  }
  preencherCategorias(cats);

  const selMes = form.elements.mes;
  selMes.replaceChildren();
  for (const m of meses) selMes.append(new Option(nomeMes(m), m));
  if (seletor.value) selMes.value = seletor.value;

  if (!meses.length) {
    nota.textContent =
      "Ainda não há meses criados. Cria o primeiro com o fecho de mês.";
    guardar.disabled = true;
  } else if (!cats.length) {
    nota.textContent =
      "Ainda não tens categorias de receita. Cria uma categoria primeiro.";
    guardar.disabled = true;
  }
  modal.showModal();
});

$("btn-cancelar").addEventListener("click", () => modal.close());

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const corpo = {
    mes: form.elements.mes.value,
    categoria_id: Number(form.elements.categoria.value),
    valor: lerValor(form.elements.valor.value),
    modo: form.elements.modo.value,
  };
  if (!corpo.mes || !corpo.categoria_id) {
    erro.textContent = "Escolhe o mês e a categoria.";
    return;
  }
  if (
    corpo.valor === null ||
    !Number.isFinite(corpo.valor) ||
    corpo.valor < 0
  ) {
    erro.textContent =
      "Indica um valor válido, igual ou superior a zero (ex.: 52,30).";
    return;
  }
  try {
    await api("/api/receitas", "POST", corpo);
  } catch (e) {
    erro.textContent = e.message;
    return;
  }
  modal.close();
  await carregar(await carregarMeses(corpo.mes));
});

(async () => carregar(await carregarMeses()))();
