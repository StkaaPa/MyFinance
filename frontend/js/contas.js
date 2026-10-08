const TIPOS = {
  "Conta Ordem": "Conta Ordem",
  Poupança: "Poupança",
  Investimento: "Investimento",
  Reforma: "Reforma",
};

async function carregarContas() {
  const resposta = await fetch("/api/contas");
  if (!resposta.ok) {
    throw new Error("Erro ao carregar contas: " + resposta.status);
  }
  const contas = await resposta.json();
  desenharTabela(contas);
}

function celula(texto) {
  const td = document.createElement("td");
  td.textContent = texto;
  return td;
}

function celulaAtivo(ativo) {
  const td = document.createElement("td");
  const interruptor = document.createElement("input");
  interruptor.type = "checkbox";
  interruptor.className = "toggle";
  interruptor.checked = ativo;
  interruptor.disabled = true;
  td.append(interruptor);
  return td;
}

function desenharTabela(contas) {
  const corpo = document.getElementById("lista-contas");
  corpo.replaceChildren();
  for (const conta of contas) {
    const linha = document.createElement("tr");
    linha.append(
      celula(conta.nome),
      celula(conta.instituicao),
      celula("-"),
      celula(TIPOS[conta.tipo] ?? conta.tipo),
      celulaAtivo(conta.ativo),
    );
    corpo.append(linha);
  }
}

carregarContas().catch(console.error);

const modal = document.getElementById("modal-conta");
const form = document.getElementById("form-conta");
const erro = document.getElementById("erro-conta");

document.getElementById("btn-adicionar").addEventListener("click", () => {
  form.reset();
  erro.textContent = "";
  modal.showModal();
});

document.getElementById("btn-cancel").addEventListener("click", () => {
  modal.close();
});

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const dados = {
    nome: form.elements.nome.value.trim(),
    instituicao: form.elements.instituicao.value.trim(),
    tipo: form.elements.tipo.value,
  };

  if (!dados.nome || !dados.instituicao) {
    erro.textContent = "Prenche o nome e a instituição!";
    return;
  }

  try {
    const resposta = await fetch("/api/contas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });

    const resultado = await resposta.json();

    console.log("STATUS:", resposta.status);
    console.log("RESPOSTA API:", resultado);

    if (!resposta.ok) {
      throw new Error("Estado" + resposta.status);
    }
  } catch (e) {
    erro.textContent = "Não foi possível guardar a conta.";
    console.error(e);
    return;
  }

  modal.close();
  carregarContas();
});
