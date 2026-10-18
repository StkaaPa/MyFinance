// Configuração > Histórico anual: um valor de património por ano (fim de ano).
// Usa as funções de util.js: $, criar, api, eur, lerValor.
const aviso = $("aviso");
const ok = $("ok");
const lista = $("lista");
const ANO_INICIAL = 2021; // a lista começa sempre aqui (ou antes, se já houver anos mais antigos)

let linhas = []; // [{ano, input, fechos}]

function mostrar(el, msg) {
  el.textContent = msg;
  el.hidden = !msg;
}

function desenharLinha(ano, valor, fechos) {
  const l = criar("div", "linha-hist");
  const input = criar("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.placeholder = "€";
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Património no fim de " + ano);
  if (valor !== null && valor !== undefined)
    input.value = String(valor).replace(".", ",");
  if (fechos) input.disabled = true;
  input.addEventListener("input", () => input.classList.remove("invalido"));
  l.append(
    criar("span", "ano", String(ano)),
    input,
    criar(
      "span",
      "origem" + (fechos ? " fechos" : ""),
      fechos ? "Calculado dos meses fechados" : "Inserido à mão",
    ),
  );
  return { ano, input, fechos, el: l };
}

function redesenhar() {
  linhas.sort((a, b) => a.ano - b.ano);
  lista.replaceChildren(...linhas.map((l) => l.el));
}

async function carregar() {
  try {
    const d = await api("/api/patrimonio-historico");
    if (!d.tabela_existe)
      mostrar(
        aviso,
        "A tabela ainda não existe. Corre database/patrimonio_historico.sql no psql e recarrega a página.",
      );
    const porAno = new Map(d.anos.map((a) => [a.ano, a]));
    const primeiro = Math.min(ANO_INICIAL, ...d.anos.map((a) => a.ano));
    linhas = [];
    for (let ano = primeiro; ano <= d.ano_atual; ano++) {
      const a = porAno.get(ano);
      linhas.push(
        desenharLinha(
          ano,
          a ? a.valor : null,
          a ? a.origem === "fechos" : false,
        ),
      );
    }
    redesenhar();
  } catch (e) {
    mostrar(aviso, "Não foi possível carregar: " + e.message);
  }
}

$("btn-ano-anterior").addEventListener("click", () => {
  const novo = linhas[0].ano - 1;
  if (novo < 1990) return;
  linhas.push(desenharLinha(novo, null, false));
  redesenhar();
  linhas[0].input.focus();
});

$("btn-guardar").addEventListener("click", async () => {
  mostrar(aviso, "");
  mostrar(ok, "");
  const corpo = [];
  let invalido = false;
  for (const l of linhas) {
    if (l.fechos) continue; // estes anos vêm dos fechos
    const v = lerValor(l.input.value);
    if (Number.isNaN(v) || (v !== null && v < 0)) {
      l.input.classList.add("invalido");
      invalido = true;
      continue;
    }
    corpo.push({ ano: l.ano, valor: v }); // null = apagar o ano
  }
  if (invalido) {
    mostrar(
      aviso,
      "Há valores inválidos. Usa números positivos com até 2 casas decimais (ex.: 12500,50).",
    );
    return;
  }
  const botao = $("btn-guardar");
  botao.disabled = true;
  try {
    await api("/api/patrimonio-historico", "PUT", { anos: corpo });
    mostrar(ok, "Histórico guardado.");
    await carregar();
  } catch (e) {
    mostrar(aviso, "Não foi possível guardar: " + e.message);
  } finally {
    botao.disabled = false;
  }
});

carregar();
