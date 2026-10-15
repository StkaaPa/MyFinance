// Página Despesas Anuais. Usa as funções de util.js: $, criar, api, eur, lerValor.
const MESES_CURTOS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const seletor = $("ano");
const aviso = $("aviso");
const modal = $("modal-despesa");
const form = $("form-despesa");
const erro = $("erro-despesa");
const apagar = $("btn-apagar");

let dados = null; // resposta de /api/despesas-anuais
let editar = null; // despesa em edição (null = a adicionar)

function mostrarAviso(msg) {
  aviso.textContent = msg;
  aviso.hidden = !msg;
}

// "2026-03-14" -> "Mar 2026"  (sem new Date(): evita deslocações por fuso horário)
const mesAno = (iso) =>
  MESES_CURTOS[Number(iso.slice(5, 7)) - 1] + " " + iso.slice(0, 4);
const dataCompleta = (iso) =>
  iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);

/* ---------- Tabela ---------- */

const ICONE_PAGO =
  '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICONE_PENDENTE =
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v5M12 16h.01"/></svg>';

function botaoEstado(d) {
  const b = criar(
    "button",
    "estado " +
      (d.pago ? "pago" : d.estado === "Previsto" ? "previsto" : "atraso"),
  );
  b.type = "button";
  b.title = d.pago
    ? "Clica para voltar a marcar como não paga"
    : "Clica para marcar como paga";
  b.innerHTML = d.pago ? ICONE_PAGO : ICONE_PENDENTE; // ícones fixos deste ficheiro
  b.append(d.estado);
  b.addEventListener("click", async (evento) => {
    evento.stopPropagation(); // não abrir o pop-up de edição
    b.disabled = true;
    try {
      await api("/api/despesas-anuais/" + d.id, "PATCH", { pago: !d.pago });
      await carregar(dados.ano);
    } catch (e) {
      b.disabled = false;
      mostrarAviso("Não foi possível alterar o estado: " + e.message);
    }
  });
  return b;
}

function desenhar() {
  const corpo = $("corpo");
  corpo.replaceChildren();
  if (!dados.despesas.length) {
    const tr = criar("tr");
    const td = criar(
      "td",
      "vazio",
      "Não há despesas anuais em " +
        dados.ano +
        ". Carrega em «+ Adicionar despesa anual».",
    );
    td.colSpan = 4;
    tr.append(td);
    corpo.append(tr);
  }
  for (const d of dados.despesas) {
    const tr = criar("tr");
    const data = criar("td", "", mesAno(d.data));
    data.title = dataCompleta(d.data);
    const estado = criar("td");
    estado.append(botaoEstado(d));
    tr.append(
      data,
      criar("td", "", d.descricao),
      criar("td", "valor", eur(d.valor)),
      estado,
    );
    tr.addEventListener("click", () => abrirModal(d));
    corpo.append(tr);
  }
  const p = dados.proximos_3_meses;
  $("resumo").textContent =
    p > 0
      ? "Nos próximos 3 meses tens " +
        eur(p) +
        " em despesas extraordinárias previstas."
      : "Não tens despesas extraordinárias previstas nos próximos 3 meses.";
}

async function carregar(ano) {
  try {
    dados = await api("/api/despesas-anuais" + (ano ? "?ano=" + ano : ""));
    mostrarAviso("");
  } catch (e) {
    mostrarAviso("Não foi possível carregar as despesas anuais: " + e.message);
    return;
  }
  seletor.replaceChildren();
  for (const a of dados.anos) seletor.append(new Option(a, a));
  seletor.value = String(dados.ano);
  desenhar();
}

seletor.addEventListener("change", () => carregar(seletor.value));

/* ---------- Pop-up adicionar / editar ---------- */

const numeroTexto = (n) => String(n).replace(".", ",");
form.addEventListener("input", () => {
  erro.textContent = "";
});

function abrirModal(d) {
  editar = d || null;
  form.reset();
  erro.textContent = "";
  $("titulo-modal").textContent = d
    ? "Editar despesa anual"
    : "Adicionar despesa anual";
  $("btn-guardar").disabled = false;
  apagar.hidden = !d;
  apagar.classList.remove("confirmar");
  apagar.textContent = "Apagar";
  if (d) {
    form.elements.data.value = d.data;
    form.elements.descricao.value = d.descricao;
    form.elements.valor.value = numeroTexto(d.valor);
    form.elements.pago.checked = d.pago;
  } else if (dados) {
    form.elements.data.value =
      dados.ano +
      "-" +
      String(new Date().getMonth() + 1).padStart(2, "0") +
      "-" +
      String(new Date().getDate()).padStart(2, "0");
  }
  modal.showModal();
  form.elements.descricao.focus();
}

$("btn-adicionar").addEventListener("click", () => abrirModal(null));
$("btn-cancelar").addEventListener("click", () => modal.close());

apagar.addEventListener("click", async () => {
  if (!apagar.classList.contains("confirmar")) {
    // confirmação com um segundo clique
    apagar.classList.add("confirmar");
    apagar.textContent = "Confirmar: apagar";
    return;
  }
  try {
    await api("/api/despesas-anuais/" + editar.id, "DELETE");
  } catch (e) {
    erro.textContent = e.message;
    return;
  }
  modal.close();
  await carregar(dados.ano);
});

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const data = form.elements.data.value;
  const descricao = form.elements.descricao.value.trim();
  const valor = lerValor(form.elements.valor.value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    erro.textContent = "Indica a data da despesa.";
    return;
  }
  if (!descricao) {
    erro.textContent = "Indica a descrição.";
    return;
  }
  if (valor === null || !Number.isFinite(valor) || valor <= 0) {
    erro.textContent = "Indica um valor maior que zero (ex.: 250 ou 49,90).";
    return;
  }
  const corpo = {
    data,
    descricao,
    valor: valor.toFixed(2),
    pago: form.elements.pago.checked,
  };
  try {
    if (editar) await api("/api/despesas-anuais/" + editar.id, "PATCH", corpo);
    else await api("/api/despesas-anuais", "POST", corpo);
  } catch (e) {
    erro.textContent = e.message;
    return;
  }
  modal.close();
  await carregar(data.slice(0, 4)); // mostra o ano da despesa que acabaste de guardar
});

carregar();
