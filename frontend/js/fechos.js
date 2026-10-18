// Página Meses fechados. Usa util.js ($, criar, api, eur, nomeMes) e js/fecho.js (window.abrirFecho).
const aviso = $("aviso");
const info = $("info");
const apagarModal = $("modal-apagar");
let fechos = [];
let aApagar = null;

function mostrarAviso(msg) {
  aviso.textContent = msg;
  aviso.hidden = !msg;
}
function mostrarInfo(msg) {
  info.textContent = msg;
  info.hidden = !msg;
}

const dataPt = (iso) =>
  iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);

function desenhar() {
  const corpo = $("corpo");
  corpo.replaceChildren();
  if (!fechos.length) {
    const tr = criar("tr");
    const td = criar(
      "td",
      "vazio",
      "Ainda não fechaste nenhum mês. Carrega em «+ Fechar mês».",
    );
    td.colSpan = 6;
    tr.append(td);
    corpo.append(tr);
    return;
  }
  for (const f of fechos) {
    const tr = criar("tr");
    const corrigir = criar("button", "btn-linha", "Corrigir");
    corrigir.type = "button";
    corrigir.addEventListener("click", () =>
      window.abrirFecho(f.id, () => {
        mostrarInfo("Fecho de " + nomeMes(f.mes) + " corrigido.");
        carregar();
      }),
    );
    const apagar = criar("button", "btn-linha perigo", "Apagar");
    apagar.type = "button";
    apagar.addEventListener("click", () => abrirApagar(f));
    const acoes = criar("div", "acoes-linha");
    acoes.append(corrigir, apagar);
    const td = criar("td");
    td.append(acoes);
    tr.append(
      criar("td", "", nomeMes(f.mes)),
      criar(
        "td",
        "periodo",
        dataPt(f.data_inicio) + " – " + dataPt(f.data_fim),
      ),
      criar("td", "dir", eur(f.patrimonio)),
      criar("td", "dir", eur(f.receitas)),
      criar("td", "dir", eur(f.despesas)),
      td,
    );
    td.className = "dir";
    corpo.append(tr);
  }
}

async function carregar() {
  try {
    fechos = await api("/api/fechos");
    mostrarAviso("");
  } catch (e) {
    fechos = [];
    mostrarAviso("Não foi possível carregar os meses fechados: " + e.message);
  }
  desenhar();
}

/* ---------- Apagar (com confirmação) ---------- */

function abrirApagar(f) {
  aApagar = f;
  $("apagar-titulo").textContent = "Apagar o fecho de " + nomeMes(f.mes) + "?";
  $("erro-apagar").textContent = "";
  $("apagar-confirmar").disabled = false;
  apagarModal.showModal();
}

$("apagar-cancelar").addEventListener("click", () => apagarModal.close());
$("apagar-confirmar").addEventListener("click", async () => {
  const botao = $("apagar-confirmar");
  botao.disabled = true;
  try {
    await api("/api/fechos/" + aApagar.id, "DELETE");
  } catch (e) {
    botao.disabled = false;
    $("erro-apagar").textContent = e.message;
    return;
  }
  apagarModal.close();
  mostrarInfo("Fecho de " + nomeMes(aApagar.mes) + " apagado.");
  await carregar();
});

$("btn-novo").addEventListener("click", () =>
  window.abrirFecho(null, () => {
    mostrarInfo("Mês fechado.");
    carregar();
  }),
);

carregar();
