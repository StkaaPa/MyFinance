// Configuração > Categorias. Usa as funções de util.js: $, criar, api.
const aviso = $("aviso");
const modal = $("modal-categoria");
const form = $("form-categoria");
const erro = $("erro-categoria");

let categorias = [];

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

function linhaCategoria(c, sub) {
  const l = criar(
    "div",
    "linha-cat" + (sub ? " sub" : "") + (c.ativo ? "" : " inativa"),
  );
  const nome = criar("span", "nome-cat", c.nome);
  l.append(nome, interruptor(c, l));
  return l;
}

function desenhar() {
  const lista = $("lista");
  lista.replaceChildren();
  if (!categorias.length) {
    lista.append(
      criar(
        "p",
        "vazio",
        "Ainda não tens categorias. Carrega em «+ Adicionar categoria».",
      ),
    );
    return;
  }
  for (const [tipo, titulo] of [
    ["despesa", "Despesas"],
    ["receita", "Receitas"],
  ]) {
    const deste = categorias.filter((c) => c.tipo === tipo);
    lista.append(criar("div", "grupo-titulo", titulo));
    if (!deste.length)
      lista.append(criar("p", "vazio", "Sem categorias de " + tipo + "."));
    for (const mae of deste.filter((c) => !c.categoria_pai_id)) {
      lista.append(linhaCategoria(mae, false));
      for (const filha of deste.filter((c) => c.categoria_pai_id === mae.id))
        lista.append(linhaCategoria(filha, true));
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

/* ---------- Pop-up adicionar ---------- */

function preencherMaes() {
  const sel = form.elements.pai;
  sel.replaceChildren(new Option("Nenhuma (categoria principal)", ""));
  for (const c of categorias.filter(
    (x) =>
      x.tipo === form.elements.tipo.value && !x.categoria_pai_id && x.ativo,
  )) {
    sel.append(new Option(c.nome, c.id));
  }
}
form.elements.tipo.addEventListener("change", preencherMaes);
form.addEventListener("input", () => {
  erro.textContent = "";
});

$("btn-adicionar").addEventListener("click", () => {
  form.reset();
  erro.textContent = "";
  preencherMaes();
  modal.showModal();
  form.elements.nome.focus();
});
$("btn-cancelar").addEventListener("click", () => modal.close());

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const nome = form.elements.nome.value.trim();
  if (!nome) {
    erro.textContent = "Indica o nome da categoria.";
    return;
  }
  const pai = form.elements.pai.value;
  try {
    await api("/api/categorias", "POST", {
      nome,
      tipo: form.elements.tipo.value,
      categoria_pai_id: pai ? Number(pai) : null,
    });
  } catch (e) {
    erro.textContent = e.message;
    return;
  }
  modal.close();
  await carregar();
});

carregar();
