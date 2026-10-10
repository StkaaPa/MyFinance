const TIPOS = {
  "Conta Ordem": "Conta Ordem",
  Poupança: "Poupança",
  Investimento: "Investimento",
  Reforma: "Reforma",
};

const corpo = $("lista-contas");
const aviso = $("aviso");
const modal = $("modal-conta");
const form = $("form-conta");
const erro = $("erro-conta");

function mostrarAviso(msg) {
  aviso.textContent = msg;
  aviso.hidden = !msg;
}

/* ---------- Tabela ---------- */

// O interruptor "Ativo": ao mudar, envia PATCH /api/contas/{id}. Se falhar, volta ao estado anterior.
function interruptor(conta, linha) {
  const input = criar("input", "toggle");
  input.type = "checkbox";
  input.checked = conta.ativo;
  input.setAttribute("aria-label", "Conta ativa");
  input.addEventListener("change", async () => {
    const novo = input.checked;
    input.disabled = true;
    try {
      await api("/api/contas/" + conta.id, "PATCH", { ativo: novo });
      conta.ativo = novo;
      linha.classList.toggle("inativa", !novo);
      mostrarAviso("");
    } catch (e) {
      input.checked = !novo;
      mostrarAviso("Não foi possível alterar a conta: " + e.message);
    } finally {
      input.disabled = false;
    }
  });
  return input;
}

function desenhar(contas) {
  corpo.replaceChildren();
  if (!contas.length) {
    const tr = criar("tr");
    const td = criar(
      "td",
      "vazio",
      "Ainda não tens contas. Carrega em «+ Adicionar conta».",
    );
    td.colSpan = 5;
    tr.append(td);
    corpo.append(tr);
    return;
  }
  for (const c of contas) {
    const tr = criar("tr", c.ativo ? "" : "inativa");
    const tdAtivo = criar("td");
    tdAtivo.append(interruptor(c, tr));
    tr.append(
      criar("td", "", c.nome),
      criar("td", "muted-td", c.instituicao),
      criar("td", "", c.saldo == null ? "—" : eur(c.saldo)),
      criar("td", "muted-td", TIPOS[c.tipo] ?? c.tipo),
      tdAtivo,
    );
    corpo.append(tr);
  }
}

async function carregarContas() {
  try {
    desenhar(await api("/api/contas"));
    mostrarAviso("");
  } catch (e) {
    console.error(e);
    mostrarAviso("Não foi possível carregar as contas: " + e.message);
  }
}

/* ---------- Pop-up "Adicionar conta" ---------- */

$("btn-adicionar").addEventListener("click", () => {
  form.reset();
  erro.textContent = "";
  modal.showModal();
});

$("btn-cancelar").addEventListener("click", () => modal.close());

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const dados = {
    nome: form.elements.nome.value.trim(),
    instituicao: form.elements.instituicao.value.trim(),
    tipo: form.elements.tipo.value,
  };
  if (!dados.nome || !dados.instituicao) {
    erro.textContent = "Preenche o nome e a instituição.";
    return;
  }
  try {
    await api("/api/contas", "POST", dados);
  } catch (e) {
    erro.textContent = "Não foi possível guardar a conta: " + e.message;
    return;
  }
  modal.close();
  carregarContas();
});

carregarContas();
