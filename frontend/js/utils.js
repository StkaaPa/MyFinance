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
