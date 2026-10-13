// Página Fundo de Emergência. Usa as funções de util.js: $, criar, api, eur, lerValor.
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

const aviso = $("aviso");
const modal = $("modal-fundo");
const form = $("form-fundo");
const erro = $("erro-fundo");
let fundo = null; // resposta de /api/fundo-emergencia

function mostrarAviso(msg) {
  aviso.textContent = msg;
  aviso.hidden = !msg;
}

const euro0 = (n) => eur(n, Number.isInteger(n) ? 0 : 2); // € 4.000 ou € 200,50

/* ---------- Anel, detalhes e dica ---------- */

function desenharResumo() {
  const f = fundo && fundo.existe ? fundo : null;
  const pct = f ? Math.min(f.percentagem, 100) : 0;
  $("anel").style.background = f
    ? `conic-gradient(var(--green) 0 ${pct}%, #dfe5ee ${pct}% 100%)`
    : "";
  $("anel-pct").textContent = f
    ? f.percentagem.toFixed(1).replace(".", ",") + "%"
    : "—";
  $("anel-valores").textContent = f
    ? euro0(f.atual) + " / " + euro0(f.valor_alvo)
    : "Ainda sem fundo";
  $("d-objetivo").textContent = f ? euro0(f.valor_alvo) : "—";
  $("d-contrib").textContent = f ? euro0(f.contribuicao) : "—";
  let tempo = "—";
  if (f && f.meses_restantes !== null)
    tempo =
      f.meses_restantes === 0
        ? "Objetivo atingido"
        : f.meses_restantes + (f.meses_restantes === 1 ? " mês" : " meses");
  $("d-tempo").textContent = tempo;

  let dica = "Mantém o teu fundo de emergência entre 3 e 6 meses de despesas.";
  if (f && f.meses_cobertos !== null)
    dica +=
      " Neste momento cobre " +
      String(f.meses_cobertos).replace(".", ",") +
      " meses das tuas despesas.";
  $("dica").textContent = dica;
}

/* ---------- Gráfico de linha (SVG) ---------- */

function passoBonito(bruto) {
  const exp = Math.pow(10, Math.floor(Math.log10(bruto)));
  return [1, 2, 2.5, 5, 10].map((f) => f * exp).find((p) => p >= bruto);
}
const rotuloK = (v) =>
  v >= 1000 ? String(v / 1000).replace(".", ",") + "k" : String(v);

function desenharGrafico() {
  const alvo = $("grafico");
  alvo.replaceChildren();
  if (!fundo || !fundo.existe) {
    alvo.append(
      criar(
        "p",
        "vazio-fundo",
        "Carrega em «Configurar fundo» para definires o objetivo.",
      ),
    );
    return;
  }
  const pontos = fundo.evolucao;
  if (!pontos.length) {
    alvo.append(
      criar(
        "p",
        "vazio-fundo",
        fundo.conta_id
          ? "Ainda não há meses fechados com esta conta."
          : "Liga o fundo a uma conta em «Configurar fundo» para veres a evolução mês a mês.",
      ),
    );
    return;
  }
  const W = 900,
    H = 230,
    esq = 40,
    dir = 16,
    topo = 12,
    base = 26;
  const max = Math.max(...pontos.map((p) => p.valor), 1);
  const passo = passoBonito(max / 4);
  const topoEixo = passo * Math.ceil(max / passo);
  const larg = W - esq - dir,
    alt = H - topo - base;
  const x = (i) =>
    esq +
    (pontos.length === 1
      ? larg / 2
      : 14 + (i * (larg - 28)) / (pontos.length - 1));
  const y = (v) => topo + alt * (1 - v / topoEixo);

  let grelha = "";
  for (let v = 0; v <= topoEixo + 1e-9; v += passo) {
    grelha +=
      `<line x1="${esq}" x2="${W - dir}" y1="${y(v)}" y2="${y(v)}" stroke="#e4e9f2"/>` +
      `<text x="${esq - 6}" y="${y(v) + 3}" text-anchor="end">${rotuloK(v)}</text>`;
  }
  const xs = pontos.map(
    (p, i) => `${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`,
  );
  const area = `M${x(0)},${y(0)} L${xs.join(" L")} L${x(pontos.length - 1)},${y(0)}Z`;
  const rotulos = pontos
    .map(
      (p, i) =>
        `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${MESES_CURTOS[Number(p.mes.slice(5, 7)) - 1]}</text>`,
    )
    .join("");
  const bolas = pontos
    .map(
      (p, i) =>
        `<circle cx="${x(i)}" cy="${y(p.valor)}" r="${i === pontos.length - 1 ? 4.5 : 3}" fill="#2f6be0"/>`,
    )
    .join("");
  alvo.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f6be0" stop-opacity=".25"/><stop offset="1" stop-color="#2f6be0" stop-opacity="0"/></linearGradient></defs>
    ${grelha}<path d="${area}" fill="url(#area)"/>
    <polyline points="${xs.join(" ")}" fill="none" stroke="#2f6be0" stroke-width="2.2" stroke-linejoin="round"/>
    ${bolas}${rotulos}</svg>`;
}

async function carregar() {
  try {
    fundo = await api("/api/fundo-emergencia");
    mostrarAviso("");
  } catch (e) {
    fundo = null;
    mostrarAviso(
      "Não foi possível carregar o fundo de emergência: " + e.message,
    );
  }
  desenharResumo();
  desenharGrafico();
}

/* ---------- Pop-up "Configurar fundo" ---------- */

const numeroTexto = (n) => String(n).replace(".", ",");

function atualizarCampoAtual() {
  // Só se escreve o valor à mão quando o fundo não está ligado a uma conta
  $("lbl-atual").hidden = form.elements.conta.value !== "";
}
form.elements.conta.addEventListener("change", atualizarCampoAtual);
form.addEventListener("input", () => {
  erro.textContent = "";
});

$("btn-editar").addEventListener("click", async () => {
  form.reset();
  erro.textContent = "";
  $("btn-guardar").disabled = false;
  const nota = $("nota-fundo");
  nota.textContent = "";

  const sel = form.elements.conta;
  sel.replaceChildren(new Option("Nenhuma (indico o valor à mão)", ""));
  try {
    const contas = (await api("/api/contas")).filter((c) => c.ativo);
    for (const c of contas)
      sel.append(new Option(c.nome + " (" + c.instituicao + ")", c.id));
  } catch (e) {
    erro.textContent = "Não foi possível carregar as contas: " + e.message;
  }

  if (fundo && fundo.existe) {
    form.elements.alvo.value = numeroTexto(fundo.valor_alvo);
    form.elements.contrib.value = numeroTexto(fundo.contribuicao);
    if (fundo.conta_id) sel.value = String(fundo.conta_id);
    else form.elements.atual.value = numeroTexto(fundo.atual);
  }
  if (fundo && fundo.existe && !fundo.suporta_conta) {
    nota.textContent =
      "Para ligares o fundo a uma conta, corre primeiro database/fundo_emergencia.sql no psql.";
  } else {
    nota.textContent =
      "Se escolheres uma conta, o valor do fundo é o saldo dela em cada fecho de mês.";
  }
  atualizarCampoAtual();
  modal.showModal();
});

$("btn-cancelar").addEventListener("click", () => modal.close());

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const alvo = lerValor(form.elements.alvo.value);
  const contrib = lerValor(form.elements.contrib.value);
  const atual = lerValor(form.elements.atual.value);
  if (alvo === null || !Number.isFinite(alvo) || alvo <= 0) {
    erro.textContent = "Indica um objetivo válido, maior que zero (ex.: 4000).";
    return;
  }
  if (contrib !== null && (!Number.isFinite(contrib) || contrib < 0)) {
    erro.textContent =
      "A contribuição mensal tem de ser um valor igual ou superior a zero.";
    return;
  }
  const conta = form.elements.conta.value;
  if (!conta && atual !== null && (!Number.isFinite(atual) || atual < 0)) {
    erro.textContent = "O valor atual tem de ser igual ou superior a zero.";
    return;
  }
  const corpo = {
    valor_alvo: alvo.toFixed(2),
    contribuicao_mensal: (contrib || 0).toFixed(2),
    conta_id: conta ? Number(conta) : null,
    valor_atual: conta ? "0.00" : (atual || 0).toFixed(2),
  };
  try {
    await api("/api/fundo-emergencia", "PUT", corpo);
  } catch (e) {
    erro.textContent = e.message;
    return;
  }
  modal.close();
  await carregar();
});

carregar();
