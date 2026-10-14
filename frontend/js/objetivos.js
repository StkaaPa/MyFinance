// Página Objetivos. Usa as funções de util.js: $, criar, api, eur, lerValor.
const ICONES = {
  fundo: ["verde", "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4"],
  alvo: [
    "cinza",
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  ],
  casa: ["laranja", "M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6"],
  carro: [
    "azul",
    "M5 16V12l2-5h10l2 5v4M3 16h18M7 16v2M17 16v2M7.5 13h.01M16.5 13h.01",
  ],
  viagem: ["roxo", "M3 13l18-8-6 15-3-6zM12 14l9-9"],
  estudos: [
    "rosa",
    "M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5",
  ],
  familia: [
    "rosa",
    "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 20c0-3 2.5-5 5-5s5 2 5 5M14 20c0-2 1.5-3.5 3-3.5s3 1.5 3 3.5",
  ],
};
const NOMES_ICONE = {
  alvo: "Alvo",
  casa: "Casa",
  carro: "Carro",
  viagem: "Viagem",
  estudos: "Estudos",
  familia: "Família",
};

const aviso = $("aviso");
const modal = $("modal-objetivo");
const form = $("form-objetivo");
const erro = $("erro-objetivo");
const apagar = $("btn-apagar");

let objetivos = [];
let filtro = "todos"; // todos | andamento | concluidos
let editar = null; // objetivo em edição (null = a adicionar)

function mostrarAviso(msg) {
  aviso.textContent = msg;
  aviso.hidden = !msg;
}

const euro0 = (n) => eur(n, Number.isInteger(n) ? 0 : 2);
const pctTexto = (p) =>
  (Number.isInteger(p) ? String(p) : p.toFixed(1).replace(".", ",")) + "%";

function iconeSvg(o) {
  const [cor, caminho] =
    ICONES[o.fundo_emergencia ? "fundo" : o.icone] || ICONES.alvo;
  const ico = criar("div", "ico " + cor);
  ico.innerHTML = `<svg viewBox="0 0 24 24"><path d="${caminho}"/></svg>`; // caminhos fixos deste ficheiro, nunca dados do utilizador
  return ico;
}

/* ---------- Separadores e lista ---------- */

function desenharTabs() {
  const tabs = $("tabs");
  tabs.replaceChildren();
  for (const [k, nome] of [
    ["todos", "Todos"],
    ["andamento", "Em andamento"],
    ["concluidos", "Concluídos"],
  ]) {
    const b = criar("button", "tab" + (k === filtro ? " active" : ""), nome);
    b.type = "button";
    b.addEventListener("click", () => {
      filtro = k;
      desenhar();
    });
    tabs.append(b);
  }
}

function textoRestante(o) {
  if (o.concluido) return ["Concluído", true];
  if (o.meses_restantes === null)
    return ["Sem contribuição mensal definida", false];
  return [
    o.meses_restantes +
      (o.meses_restantes === 1 ? " mês restante" : " meses restantes"),
    false,
  ];
}

function cartao(o) {
  const c = criar("button", "card objetivo");
  c.type = "button";
  const corpo = criar("div", "corpo-obj");
  const valor = criar("div", "valor", euro0(o.atual) + " ");
  valor.append(criar("span", "", "/ " + euro0(o.valor_alvo)));
  const linha = criar("div", "linha-valor");
  linha.append(valor, criar("span", "pct", pctTexto(o.percentagem)));
  const barra = criar("div", "barra");
  const cheia = criar("i");
  cheia.style.width = Math.min(o.percentagem, 100) + "%";
  barra.append(cheia);
  const [texto, ok] = textoRestante(o);
  corpo.append(
    criar("div", "nome-obj", o.nome),
    linha,
    barra,
    criar("div", "restante" + (ok ? " ok" : ""), texto),
  );
  c.append(iconeSvg(o), corpo);
  c.addEventListener("click", () => {
    if (o.fundo_emergencia)
      window.location.href = "fundo-emergencia.html"; // o fundo gere-se na sua página
    else abrirModal(o);
  });
  return c;
}

function desenhar() {
  desenharTabs();
  const lista = $("lista");
  lista.replaceChildren();
  const visiveis = objetivos.filter(
    (o) => filtro === "todos" || (filtro === "concluidos") === o.concluido,
  );
  if (!visiveis.length) {
    lista.append(
      criar(
        "p",
        "vazio-lista",
        objetivos.length
          ? "Não há objetivos neste separador."
          : "Ainda não tens objetivos. Carrega em «+ Adicionar objetivo».",
      ),
    );
    return;
  }
  for (const o of visiveis) lista.append(cartao(o));
}

async function carregar() {
  try {
    objetivos = await api("/api/objetivos");
    mostrarAviso("");
  } catch (e) {
    objetivos = [];
    mostrarAviso("Não foi possível carregar os objetivos: " + e.message);
  }
  desenhar();
}

/* ---------- Pop-up adicionar / editar ---------- */

const numeroTexto = (n) => String(n).replace(".", ",");

function atualizarCampoAtual() {
  $("lbl-atual").hidden = form.elements.conta.value !== "";
}
form.elements.conta.addEventListener("change", atualizarCampoAtual);
form.addEventListener("input", () => {
  erro.textContent = "";
});

async function abrirModal(o) {
  editar = o || null;
  form.reset();
  erro.textContent = "";
  $("titulo-modal").textContent = o ? "Editar objetivo" : "Adicionar objetivo";
  $("btn-guardar").disabled = false;
  $("lbl-concluido").hidden = !o;
  apagar.hidden = !o;
  apagar.classList.remove("confirmar");
  apagar.textContent = "Apagar";

  const icone = form.elements.icone;
  icone.replaceChildren();
  for (const [k, nome] of Object.entries(NOMES_ICONE))
    icone.append(new Option(nome, k));

  const sel = form.elements.conta;
  sel.replaceChildren(new Option("Nenhuma (indico o valor à mão)", ""));
  try {
    for (const c of (await api("/api/contas")).filter((x) => x.ativo))
      sel.append(new Option(c.nome + " (" + c.instituicao + ")", c.id));
  } catch (e) {
    erro.textContent = "Não foi possível carregar as contas: " + e.message;
  }

  if (o) {
    form.elements.nome.value = o.nome;
    form.elements.alvo.value = numeroTexto(o.valor_alvo);
    form.elements.contrib.value = o.contribuicao
      ? numeroTexto(o.contribuicao)
      : "";
    form.elements.icone.value = o.icone;
    if (o.conta_id) sel.value = String(o.conta_id);
    else form.elements.atual.value = numeroTexto(o.atual);
    form.elements.concluido.checked = o.concluido;
  }
  atualizarCampoAtual();
  modal.showModal();
  form.elements.nome.focus();
}

$("btn-adicionar").addEventListener("click", () => abrirModal(null));
$("btn-cancelar").addEventListener("click", () => modal.close());

// Apagar pede confirmação com um segundo clique
apagar.addEventListener("click", async () => {
  if (!apagar.classList.contains("confirmar")) {
    apagar.classList.add("confirmar");
    apagar.textContent = "Confirmar: apagar";
    return;
  }
  try {
    await api("/api/objetivos/" + editar.id, "DELETE");
  } catch (e) {
    erro.textContent = e.message;
    return;
  }
  modal.close();
  await carregar();
});

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const nome = form.elements.nome.value.trim();
  const alvo = lerValor(form.elements.alvo.value);
  const contrib = lerValor(form.elements.contrib.value);
  const atual = lerValor(form.elements.atual.value);
  const conta = form.elements.conta.value;
  if (!nome) {
    erro.textContent = "Indica o nome do objetivo.";
    return;
  }
  if (alvo === null || !Number.isFinite(alvo) || alvo <= 0) {
    erro.textContent =
      "Indica um valor para o objetivo, maior que zero (ex.: 20000).";
    return;
  }
  if (contrib !== null && (!Number.isFinite(contrib) || contrib < 0)) {
    erro.textContent =
      "A contribuição mensal tem de ser igual ou superior a zero.";
    return;
  }
  if (!conta && atual !== null && (!Number.isFinite(atual) || atual < 0)) {
    erro.textContent = "O valor atual tem de ser igual ou superior a zero.";
    return;
  }

  const corpo = {
    nome,
    valor_alvo: alvo.toFixed(2),
    contribuicao_mensal: (contrib || 0).toFixed(2),
    icone: form.elements.icone.value,
    conta_id: conta ? Number(conta) : null,
    valor_atual: conta ? "0.00" : (atual || 0).toFixed(2),
  };
  try {
    if (editar)
      await api("/api/objetivos/" + editar.id, "PATCH", {
        ...corpo,
        concluido: form.elements.concluido.checked,
      });
    else await api("/api/objetivos", "POST", corpo);
  } catch (e) {
    erro.textContent = e.message;
    return;
  }
  modal.close();
  await carregar();
});

carregar();
