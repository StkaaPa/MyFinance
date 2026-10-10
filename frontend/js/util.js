// Funções partilhadas pelas páginas (carregar antes do JS da página)
const $ = (id) => document.getElementById(id);

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const nomeMes = (aaaamm) => {
  const [a, m] = aaaamm.split("-");
  return MESES[+m - 1] + " " + a;
};

// 1024.5 -> "€ 1.024,50"
const eur = (n, casas = 2) =>
  "€ " +
  Number(n).toLocaleString("de-DE", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

// Cria um elemento com classe e texto (textContent: nunca interpreta HTML)
function criar(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

// Lê um valor em euros escrito pelo utilizador: "52,30" ou "52.3" -> 52.3 ; vazio -> null ; inválido -> NaN
// (só aceita até 2 casas decimais e sem separador de milhares, para nunca interpretar mal "1.234")
function lerValor(texto) {
  const t = String(texto).trim().replace(/\s/g, "");
  if (t === "") return null;
  if (!/^-?\d+([.,]\d{1,2})?$/.test(t)) return NaN;
  return Number(t.replace(",", "."));
}

// Pedido à API. Devolve o JSON, ou lança um Error com a mensagem do servidor.
async function api(url, metodo = "GET", corpo) {
  const opcoes = { method: metodo };
  if (corpo !== undefined) {
    opcoes.headers = { "Content-Type": "application/json" };
    opcoes.body = JSON.stringify(corpo);
  }
  const r = await fetch(url, opcoes);
  if (!r.ok) {
    let msg = "Erro " + r.status;
    try {
      const j = await r.json();
      if (typeof j.detail === "string") msg = j.detail;
      else if (Array.isArray(j.detail))
        msg = j.detail.map((d) => d.msg).join("; ");
    } catch {
      /* resposta sem JSON */
    }
    const erro = new Error(msg);
    erro.status = r.status;
    throw erro;
  }
  return r.status === 204 ? null : r.json();
}
