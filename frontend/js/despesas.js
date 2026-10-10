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
const modal = $("modal-despesa");
const form = $("form-despesa");
const erro = $("erro-despesa");

let meses = []; // ["2026-09", "2026-08", ...] (os que existem na base de dados)
let dados = null; // resposta de /api/despesas
let vista = "todas"; // "todas" | "categorias"
let cores = {}; // categoria -> cor

const diaMes = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const classeVar = (txt) =>
  txt.startsWith("-") ? "bom" : txt.startsWith("+") ? "mau" : "";

function mostrarAviso(msg) {
  aviso.textContent = msg;
  aviso.hidden = !msg;
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
    const c = classeVar(dados.variacao); // despesas a descer = bom
    delta.classList.add(c);
    delta.append(
      criar("span", "seta", dados.variacao.startsWith("-") ? "▼" : "▲"),
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

function cabecalho(colunas) {
  const tr = criar("tr");
  for (const [texto, dir] of colunas)
    tr.append(criar("th", dir ? "dir" : "", texto));
  $("cabecalho").replaceChildren(tr);
}

function linhaVazia(colunas, texto) {
  const tr = criar("tr");
  const td = criar("td", "vazio", texto);
  td.colSpan = colunas;
  tr.append(td);
  $("corpo").append(tr);
}

function celulaVariacao(txt) {
  const td = criar("td", "dir");
  td.append(
    criar(
      "span",
      txt === "—" ? "muted" : "var-" + (classeVar(txt) || "x"),
      txt,
    ),
  );
  return td;
}

function desenharTabela() {
  const corpo = $("corpo");
  corpo.replaceChildren();

  if (vista === "todas") {
    $("titulo-tabela").textContent = "Últimas despesas";
    cabecalho([["Data"], ["Descrição"], ["Categoria"], ["Valor", true]]);
    if (!dados || !dados.detalhe.length) {
      linhaVazia(
        4,
        dados
          ? "Ainda não há despesas neste mês."
          : "Ainda não há meses. Cria o primeiro com o fecho de mês.",
      );
      return;
    }
    for (const d of dados.detalhe) {
      const tr = criar("tr");
      tr.append(
        criar("td", "", diaMes(dados.data_fim)),
        criar("td", "", d.nome),
        celulaCategoria(d.categoria),
        criar("td", "dir valor", eur(d.valor)),
      );
      corpo.append(tr);
    }
  } else {
    $("titulo-tabela").textContent = "Despesas por categoria";
    cabecalho([
      ["Categoria"],
      ["% do total", true],
      ["vs. mês anterior", true],
      ["Valor", true],
    ]);
    if (!dados || !dados.categorias.length) {
      linhaVazia(
        4,
        dados
          ? "Ainda não há despesas neste mês."
          : "Ainda não há meses. Cria o primeiro com o fecho de mês.",
      );
      return;
    }
    for (const c of dados.categorias) {
      const tr = criar("tr", "grupo");
      tr.append(
        celulaCategoria(c.categoria),
        criar("td", "dir", c.percentagem.toFixed(1).replace(".", ",") + "%"),
        celulaVariacao(c.variacao),
        criar("td", "dir valor", eur(c.valor)),
      );
      corpo.append(tr);
      // subcategorias (quando a categoria tem mais do que ela própria)
      for (const d of dados.detalhe.filter(
        (x) => x.categoria === c.categoria && x.nome !== c.categoria,
      )) {
        const sub = criar("tr", "sub");
        sub.append(
          criar("td", "", d.nome),
          criar("td", "dir"),
          celulaVariacao(d.variacao),
          criar("td", "dir", eur(d.valor)),
        );
        corpo.append(sub);
      }
    }
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
      dados = await api("/api/despesas?mes=" + mes);
      mostrarAviso("");
    } catch (e) {
      if (e.status !== 404)
        mostrarAviso("Não foi possível carregar as despesas: " + e.message);
    }
  }
  desenharResumo();
  desenharTabela();
}

seletor.addEventListener("change", () => carregar(seletor.value));

for (const botao of document.querySelectorAll(".tab")) {
  botao.addEventListener("click", () => {
    vista = botao.dataset.vista;
    document
      .querySelectorAll(".tab")
      .forEach((b) => b.classList.toggle("active", b === botao));
    desenharTabela();
  });
}

/* ---------- Pop-up "Adicionar despesa" ---------- */

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
  const nota = $("nota-despesa");
  const guardar = $("btn-guardar");
  nota.textContent = "";
  guardar.disabled = false;

  let cats = [];
  try {
    cats = await api("/api/despesas/categorias");
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
      "Ainda não tens categorias de despesa (ou todas têm subcategorias). Cria uma categoria primeiro.";
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
    valor: Number(form.elements.valor.value),
    modo: form.elements.modo.value,
  };
  if (!corpo.mes || !corpo.categoria_id) {
    erro.textContent = "Escolhe o mês e a categoria.";
    return;
  }
  if (!Number.isFinite(corpo.valor) || corpo.valor < 0) {
    erro.textContent = "Indica um valor igual ou superior a zero.";
    return;
  }
  try {
    await api("/api/despesas", "POST", corpo);
  } catch (e) {
    erro.textContent = e.message;
    return;
  }
  modal.close();
  await carregar(await carregarMeses(corpo.mes));
});

(async () => carregar(await carregarMeses()))();
