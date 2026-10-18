// Configuração > Ativos: criar, editar (nome, classe, conta), ativar/desativar e apagar.
// Usa as funções de util.js: $, criar, api.
const CLASSES = {
  etf: "ETF",
  acao: "Ação",
  cripto: "Cripto",
  ppr: "PPR",
  outro: "Outro",
};
const aviso = $("aviso");
const modal = $("modal-ativo");
const form = $("form-ativo");
const erro = $("erro-ativo");
const apagar = $("btn-apagar");

let ativos = [];
let contas = []; // só contas de investimento/reforma
let editar = null; // ativo em edição (null = a adicionar)

function mostrarAviso(msg) {
  aviso.textContent = msg;
  aviso.hidden = !msg;
}

function interruptor(a, linha) {
  const i = criar("input", "toggle");
  i.type = "checkbox";
  i.checked = a.ativo;
  i.setAttribute("aria-label", "Ativo em uso");
  i.title = a.ativo ? "Desativar (deixa de aparecer no fecho)" : "Reativar";
  i.addEventListener("change", async () => {
    const novo = i.checked;
    i.disabled = true;
    try {
      await api("/api/ativos/" + a.id, "PATCH", { ativo: novo });
      a.ativo = novo;
      linha.classList.toggle("inativa", !novo);
      mostrarAviso("");
    } catch (e) {
      i.checked = !novo;
      mostrarAviso("Não foi possível alterar o ativo: " + e.message);
    } finally {
      i.disabled = false;
    }
  });
  return i;
}

function linhaAtivo(a) {
  const l = criar("div", "linha-cat" + (a.ativo ? "" : " inativa"));
  const nome = criar("span", "nome-cat", a.nome);
  nome.append(criar("span", "etiqueta", CLASSES[a.classe] || a.classe));
  if (!a.conta_ativa)
    nome.append(criar("span", "aviso-conta", "conta inativa"));
  const b = criar("button", "btn-linha", "Editar");
  b.type = "button";
  b.addEventListener("click", () => abrirModal(a));
  l.append(nome, criar("span", "acoes-cat", ""), interruptor(a, l));
  l.querySelector(".acoes-cat").append(b);
  return l;
}

function desenhar() {
  const lista = $("lista");
  lista.replaceChildren();
  if (!ativos.length) {
    lista.append(
      criar(
        "p",
        "vazio",
        contas.length
          ? "Ainda não tens ativos. Carrega em Adicionar ativo."
          : "Primeiro cria uma conta do tipo Investimento ou Reforma (Configuração > Contas).",
      ),
    );
    return;
  }
  let conta = null;
  for (const a of ativos) {
    if (a.conta_id !== conta) {
      conta = a.conta_id;
      lista.append(criar("div", "grupo-titulo", a.conta));
    }
    lista.append(linhaAtivo(a));
  }
}

async function carregar() {
  try {
    const [a, c] = await Promise.all([api("/api/ativos"), api("/api/contas")]);
    ativos = a;
    contas = c.filter((x) => x.tipo === "Investimento" || x.tipo === "Reforma");
    mostrarAviso("");
  } catch (e) {
    ativos = [];
    contas = [];
    mostrarAviso("Não foi possível carregar os ativos: " + e.message);
  }
  desenhar();
}

/* ---------- Pop-up adicionar / editar ---------- */
function preencherContas(atual) {
  const sel = form.elements.conta;
  sel.replaceChildren();
  for (const c of contas.filter((x) => x.ativo || x.id === atual))
    sel.append(new Option(c.nome + (c.ativo ? "" : " (inativa)"), c.id));
  if (atual) sel.value = String(atual);
}

function abrirModal(ativo) {
  editar = ativo || null;
  form.reset();
  erro.textContent = "";
  $("titulo-modal").textContent = editar ? "Editar ativo" : "Adicionar ativo";
  apagar.hidden = !editar;
  apagar.classList.remove("confirmar");
  apagar.textContent = "Apagar";
  preencherContas(editar ? editar.conta_id : null);
  const nota = $("nota-ativo");
  if (editar) {
    form.elements.nome.value = editar.nome;
    form.elements.classe.value = editar.classe;
    const fechado = editar.n_meses_com_valores > 0;
    form.elements.conta.disabled = fechado; // o histórico ficaria na conta errada
    apagar.disabled = fechado;
    apagar.title = fechado
      ? "Tem meses fechados: desativa em vez de apagar"
      : "";
    nota.textContent = fechado
      ? "Este ativo já tem " +
        editar.n_meses_com_valores +
        " mês(es) fechado(s): não muda de conta nem se apaga. Para o deixares de usar, desativa-o."
      : "Ainda sem meses fechados: podes mudar de conta ou apagar.";
  } else {
    form.elements.conta.disabled = false;
    apagar.disabled = false;
    nota.textContent = contas.length
      ? "O valor deste ativo vai ser pedido em cada fecho mensal."
      : "Não há contas de Investimento ou Reforma ativas.";
  }
  if (!editar && !contas.some((c) => c.ativo)) {
    erro.textContent = "Cria primeiro uma conta de Investimento ou Reforma.";
  }
  modal.showModal();
  form.elements.nome.focus();
}

$("btn-adicionar").addEventListener("click", () => abrirModal());
$("btn-cancelar").addEventListener("click", () => modal.close());
form.addEventListener("input", () => {
  erro.textContent = "";
});

apagar.addEventListener("click", async () => {
  if (!apagar.classList.contains("confirmar")) {
    apagar.classList.add("confirmar");
    apagar.textContent = "Confirmar: apagar";
    return;
  }
  try {
    await api("/api/ativos/" + editar.id, "DELETE");
  } catch (e) {
    erro.textContent = e.message;
    apagar.classList.remove("confirmar");
    apagar.textContent = "Apagar";
    return;
  }
  modal.close();
  await carregar();
});

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const nome = form.elements.nome.value.trim();
  if (!nome) {
    erro.textContent = "Indica o nome do ativo.";
    return;
  }
  const classe = form.elements.classe.value;
  const conta_id = Number(form.elements.conta.value);
  if (!conta_id) {
    erro.textContent = "Escolhe a conta.";
    return;
  }
  try {
    if (editar) {
      const corpo = { nome, classe };
      if (!form.elements.conta.disabled) corpo.conta_id = conta_id;
      await api("/api/ativos/" + editar.id, "PATCH", corpo);
    } else {
      await api("/api/ativos", "POST", { nome, classe, conta_id });
    }
  } catch (e) {
    erro.textContent = e.message;
    return;
  }
  modal.close();
  await carregar();
});

carregar();
