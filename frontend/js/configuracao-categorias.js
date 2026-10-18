// Configuração > Categorias: criar, editar (nome e categoria-mãe), ativar/desativar e apagar.
// Usa as funções de util.js: $, criar, api.
const aviso = $("aviso");
const modal = $("modal-categoria");
const form = $("form-categoria");
const erro = $("erro-categoria");
const apagar = $("btn-apagar");

let categorias = [];
let editar = null;    // categoria em edição (null = a adicionar)

function mostrarAviso(msg) {
  aviso.textContent = msg;
  aviso.hidden = !msg;
}

// Interruptor "ativo": PATCH /api/categorias/{id}; se falhar, volta ao estado anterior
function interruptor(c, linha) {
  const i = criar("input", "toggle");
  i.type = "checkbox";
  i.checked = c.ativo;
  i.setAttribute("aria-label", "Categoria ativa");
  i.addEventListener("change", async () => {
    const novo = i.checked;
    i.disabled = true;
    try {
      await api("/api/categorias/" + c.id, "PATCH", { ativo: novo });
      c.ativo = novo;
      linha.classList.toggle("inativa", !novo);
      mostrarAviso("");
    } catch (e) {
      i.checked = !novo;
      mostrarAviso("Não foi possível alterar a categoria: " + e.message);
    } finally {
      i.disabled = false;
    }
  });
  return i;
}

function botao(texto, titulo, aoClicar) {
  const b = criar("button", "btn-linha", texto);
  b.type = "button";
  b.title = titulo;
  b.addEventListener("click", aoClicar);
  return b;
}

function linhaCategoria(c, sub) {
  const l = criar("div", "linha-cat" + (sub ? " sub" : "") + (c.ativo ? "" : " inativa"));
  const nome = criar("span", "nome-cat", c.nome);
  const acoes = criar("span", "acoes-cat");
  // Só uma categoria principal pode receber subcategorias (e só se ainda não tiver valores)
  if (!sub) {
    const b = botao("+ Subcategoria", "Criar uma subcategoria dentro de «" + c.nome + "»", () => abrirModal(null, c));
    if (c.n_meses_com_valores > 0) {     // os valores guardam-se na categoria mais baixa: esta já tem histórico
      b.disabled = true;
      b.title = "«" + c.nome + "» já tem valores guardados e não pode ter subcategorias";
    }
    acoes.append(b);
  }
  acoes.append(botao("Editar", "Editar ou apagar", () => abrirModal(c)));
  l.append(nome, acoes, interruptor(c, l));
  return l;
}

function desenhar() {
  const lista = $("lista");
  lista.replaceChildren();
  if (!categorias.length) {
    lista.append(criar("p", "vazio", "Ainda não tens categorias. Carrega em «+ Adicionar categoria»."));
    return;
  }
  for (const [tipo, titulo] of [["despesa", "Despesas"], ["receita", "Receitas"]]) {
    const deste = categorias.filter((c) => c.tipo === tipo);
    lista.append(criar("div", "grupo-titulo", titulo));
    if (!deste.length) lista.append(criar("p", "vazio", "Sem categorias de " + tipo + "."));
    for (const mae of deste.filter((c) => !c.categoria_pai_id)) {
      lista.append(linhaCategoria(mae, false));
      for (const filha of deste.filter((c) => c.categoria_pai_id === mae.id)) lista.append(linhaCategoria(filha, true));
    }
  }
}

async function carregar() {
  try {
    categorias = await api("/api/categorias");
    mostrarAviso("");
  } catch (e) {
    categorias = [];
    mostrarAviso("Não foi possível carregar as categorias: " + e.message);
  }
  desenhar();
}

/* ---------- Pop-up adicionar / editar ---------- */

// Categorias-mãe possíveis: principais, do mesmo tipo, ativas (ou a atual), e nunca a própria
function preencherMaes(preSelecionada) {
  const sel = form.elements.pai;
  sel.replaceChildren(new Option("Nenhuma (categoria principal)", ""));
  const tipo = form.elements.tipo.value;
  for (const c of categorias.filter((x) => x.tipo === tipo && !x.categoria_pai_id && (x.ativo || x.id === preSelecionada) && (!editar || x.id !== editar.id))) {
    sel.append(new Option(c.nome, c.id));
  }
  sel.value = preSelecionada ? String(preSelecionada) : "";
}
form.elements.tipo.addEventListener("change", () => preencherMaes(null));
form.addEventListener("input", () => { erro.textContent = ""; });

// abrirModal()            -> adicionar categoria
// abrirModal(null, mae)   -> adicionar subcategoria dentro de `mae`
// abrirModal(categoria)   -> editar
function abrirModal(categoria, mae) {
  editar = categoria || null;
  form.reset();
  erro.textContent = "";
  $("titulo-modal").textContent = editar ? "Editar categoria" : mae ? "Adicionar subcategoria a «" + mae.nome + "»" : "Adicionar categoria";
  apagar.hidden = !editar;
  apagar.classList.remove("confirmar");
  apagar.textContent = "Apagar";
  const nota = $("nota-categoria");
  const sel = form.elements.pai;
  sel.disabled = false;

  if (editar) {
    form.elements.nome.value = editar.nome;
    form.elements.tipo.value = editar.tipo;
    form.elements.tipo.disabled = true;               // o tipo não se muda (o histórico ficava errado)
    preencherMaes(editar.categoria_pai_id);
    if (editar.n_subcategorias > 0) {                 // tem filhas: só há dois níveis
      sel.disabled = true;
      nota.textContent = "Esta categoria tem subcategorias, por isso não pode passar a ser subcategoria de outra.";
    } else {
      nota.textContent = "Para mudar o tipo (despesa/receita), cria outra categoria. Mover para outra categoria-mãe não apaga o histórico.";
    }
  } else {
    form.elements.tipo.disabled = false;
    if (mae) form.elements.tipo.value = mae.tipo;
    preencherMaes(mae ? mae.id : null);
    nota.textContent = "Uma subcategoria soma na categoria de cima. Só há dois níveis. Os valores do fecho mensal guardam-se na categoria mais baixa.";
  }
  modal.showModal();
  form.elements.nome.focus();
}

$("btn-adicionar").addEventListener("click", () => abrirModal());
$("btn-cancelar").addEventListener("click", () => modal.close());

// Apagar pede confirmação com um segundo clique
apagar.addEventListener("click", async () => {
  if (!apagar.classList.contains("confirmar")) {
    apagar.classList.add("confirmar");
    apagar.textContent = "Confirmar: apagar";
    return;
  }
  try {
    await api("/api/categorias/" + editar.id, "DELETE");
  } catch (e) {
    erro.textContent = e.message;
    apagar.classList.remove("confirmar");
    apagar.textContent = "Apagar";
    return;
  }
  modal.close();
  await carregar();
});

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const nome = form.elements.nome.value.trim();
  if (!nome) { erro.textContent = "Indica o nome da categoria."; return; }
  const pai = form.elements.pai.value;
  try {
    if (editar) {
      const corpo = { nome };
      if (!form.elements.pai.disabled) corpo.categoria_pai_id = pai ? Number(pai) : null;
      await api("/api/categorias/" + editar.id, "PATCH", corpo);
    } else {
      await api("/api/categorias", "POST", { nome, tipo: form.elements.tipo.value, categoria_pai_id: pai ? Number(pai) : null });
    }
  } catch (e) {
    erro.textContent = e.message;
    return;
  }
  modal.close();
  await carregar();
});

carregar();
