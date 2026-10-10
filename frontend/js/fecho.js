// Pop-up "Fechar mês". Autónomo: só precisa de #btn-fechar na página (ou de chamar abrirFecho()).
(function () {
  "use strict";

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
  const nomeMes = (aaaamm) =>
    MESES[Number(aaaamm.slice(5, 7)) - 1] + " " + aaaamm.slice(0, 4);
  const eur = (n) =>
    "€ " +
    Number(n).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  function criar(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  async function api(url, metodo, corpo) {
    const opcoes = { method: metodo || "GET" };
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
      } catch (e) {
        /* sem JSON */
      }
      throw new Error(msg);
    }
    return r.json();
  }

  /* ---------- Datas (sem toISOString, que desloca o dia por causa do fuso horário) ---------- */
  const dois = (n) => String(n).padStart(2, "0");
  const paraTexto = (d) =>
    d.getFullYear() + "-" + dois(d.getMonth() + 1) + "-" + dois(d.getDate());
  const deTexto = (t) =>
    new Date(
      Number(t.slice(0, 4)),
      Number(t.slice(5, 7)) - 1,
      Number(t.slice(8, 10)),
    );

  // Período sugerido: começa no dia a seguir ao último fecho e dura um mês (27/09 a 26/10).
  function periodoSugerido(f) {
    if (f.data_inicio_sugerida) {
      const ini = deTexto(f.data_inicio_sugerida);
      return [
        paraTexto(ini),
        paraTexto(
          new Date(ini.getFullYear(), ini.getMonth() + 1, ini.getDate() - 1),
        ),
      ];
    }
    // Primeiro fecho: termina no dia (início-1) mais recente que já passou
    const hoje = new Date();
    const dia = f.dia_inicio_configurado || 27;
    const fim = new Date(
      hoje.getFullYear(),
      hoje.getDate() >= dia ? hoje.getMonth() : hoje.getMonth() - 1,
      dia - 1,
    );
    return [
      paraTexto(
        new Date(fim.getFullYear(), fim.getMonth() - 1, fim.getDate() + 1),
      ),
      paraTexto(fim),
    ];
  }

  /* ---------- Construir o pop-up ---------- */
  let modal = null,
    form = null,
    dados = null;

  function construir() {
    if (modal) return;
    modal = document.createElement("dialog");
    modal.className = "modal modal-fecho";
    modal.innerHTML = `
      <form id="form-fecho" novalidate>
        <header class="fecho-topo">
          <h2>Fechar mês</h2>
          <p>Indica os valores do mês. Os campos em branco nas categorias contam como zero.</p>
        </header>
        <div class="fecho-corpo">
          <section class="fecho-periodo">
            <label>Início do período<input type="date" name="inicio" required></label>
            <label>Fim do período<input type="date" name="fim" required></label>
            <div class="fecho-ref"><span>Mês de referência</span><strong id="fecho-ref">—</strong></div>
          </section>
          <section><h3>Receitas <span id="sub-rec"></span></h3><div class="fecho-grid" id="fecho-receitas"></div></section>
          <section><h3>Despesas <span id="sub-desp"></span></h3><div class="fecho-grid" id="fecho-despesas"></div></section>
          <section><h3>Contas e investimentos <span id="sub-pat"></span></h3><div class="fecho-grid" id="fecho-contas"></div></section>
        </div>
        <footer class="fecho-rodape">
          <div class="fecho-totais">
            <div>Receitas<b id="t-rec">€ 0,00</b></div>
            <div>Despesas<b id="t-desp">€ 0,00</b></div>
            <div>Taxa de poupança<b id="t-poup">—</b></div>
            <div>Património<b id="t-pat">€ 0,00</b></div>
          </div>
          <p class="erro" id="fecho-erro"></p>
          <div class="modal-botoes">
            <button type="button" class="btn-cancelar" id="fecho-cancelar">Cancelar</button>
            <button type="submit" class="btn-add" id="fecho-guardar">Fechar mês</button>
          </div>
        </footer>
      </form>`;
    document.body.append(modal);
    form = modal.querySelector("form");

    modal
      .querySelector("#fecho-cancelar")
      .addEventListener("click", () => modal.close());
    form.addEventListener("input", (evento) => {
      evento.target.classList.remove("invalido"); // o campo já foi corrigido
      form.querySelector("#fecho-erro").textContent = "";
      atualizar();
    });
    form.addEventListener("submit", enviar);
  }

  function campo(item, tipo, rotulo, anterior, textoAnterior) {
    const label = criar("label");
    const nome = criar("span", "nome");
    if (rotulo.pai) nome.append(criar("em", "", rotulo.pai + " / "));
    nome.append(rotulo.nome);
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.placeholder = "0,00";
    input.dataset.tipo = tipo;
    input.dataset.id = item.id;
    input.dataset.nome = rotulo.pai
      ? rotulo.pai + " / " + rotulo.nome
      : rotulo.nome;
    const dica = criar(
      "small",
      "",
      anterior == null ? textoAnterior : "Mês anterior: " + eur(anterior),
    );
    label.append(nome, input, dica);
    return label;
  }

  function preencher() {
    for (const [id, tipoCat] of [
      ["fecho-receitas", "receita"],
      ["fecho-despesas", "despesa"],
    ]) {
      const alvo = form.querySelector("#" + id);
      alvo.replaceChildren();
      const cats = dados.categorias.filter((c) => c.tipo === tipoCat);
      if (!cats.length)
        alvo.append(
          criar(
            "p",
            "fecho-vazio",
            "Ainda não tens categorias de " + tipoCat + ".",
          ),
        );
      for (const c of cats)
        alvo.append(
          campo(
            c,
            tipoCat,
            { nome: c.nome, pai: c.categoria_pai },
            c.valor_anterior,
            "",
          ),
        );
    }
    const contas = form.querySelector("#fecho-contas");
    contas.replaceChildren();
    if (!dados.contas.length)
      contas.append(criar("p", "fecho-vazio", "Ainda não tens contas ativas."));
    for (const c of dados.contas)
      contas.append(
        campo(
          c,
          "conta",
          { nome: c.nome },
          c.saldo_anterior,
          "Obrigatório (0 se estiver vazia)",
        ),
      );
  }

  // "190,40" ou "190.4" -> 190.4 ; vazio -> null ; inválido -> NaN (até 2 casas decimais, sem milhares)
  function valorDe(input) {
    const t = input.value.trim().replace(/\s/g, "");
    if (t === "") return null;
    if (!/^-?\d+([.,]\d{1,2})?$/.test(t)) return NaN;
    return Number(t.replace(",", "."));
  }

  function somar(tipo) {
    let t = 0;
    for (const i of form.querySelectorAll(`input[data-tipo="${tipo}"]`)) {
      const v = valorDe(i);
      if (Number.isFinite(v)) t += v;
    }
    return t;
  }

  // Totais em direto e mês de referência
  function atualizar() {
    const rec = somar("receita"),
      desp = somar("despesa"),
      pat = somar("conta");
    form.querySelector("#t-rec").textContent = eur(rec);
    form.querySelector("#t-desp").textContent = eur(desp);
    form.querySelector("#t-pat").textContent = eur(pat);
    form.querySelector("#t-poup").textContent =
      rec > 0
        ? (((rec - desp) / rec) * 100).toFixed(1).replace(".", ",") + "%"
        : "—";
    const fim = form.elements.fim.value;
    form.querySelector("#fecho-ref").textContent = /^\d{4}-\d{2}-\d{2}$/.test(
      fim,
    )
      ? nomeMes(fim)
      : "—";
  }

  function mostrarErro(msg, input) {
    form.querySelector("#fecho-erro").textContent = msg;
    for (const i of form.querySelectorAll("input.invalido"))
      i.classList.remove("invalido");
    if (input) {
      input.classList.add("invalido");
      input.focus();
    }
  }

  async function enviar(evento) {
    evento.preventDefault();
    mostrarErro("");
    const inicio = form.elements.inicio.value,
      fim = form.elements.fim.value;
    if (!inicio || !fim)
      return mostrarErro(
        "Indica as datas de início e de fim do período.",
        form.elements[!inicio ? "inicio" : "fim"],
      );
    if (fim < inicio)
      return mostrarErro(
        "A data de fim não pode ser anterior à de início.",
        form.elements.fim,
      );

    const saldos = [],
      movimentos = [];
    for (const i of form.querySelectorAll("input[data-tipo]")) {
      const v = valorDe(i);
      const conta = i.dataset.tipo === "conta";
      if (v === null) {
        if (conta)
          return mostrarErro(
            `Indica o saldo de «${i.dataset.nome}» (0 se estiver vazia).`,
            i,
          );
        continue;
      }
      if (!Number.isFinite(v))
        return mostrarErro(
          `Valor inválido em «${i.dataset.nome}». Usa o formato 1234,56 (até 2 casas decimais).`,
          i,
        );
      if (!conta && v < 0)
        return mostrarErro(`«${i.dataset.nome}» não pode ser negativo.`, i);
      const item = {
        [conta ? "conta_id" : "categoria_id"]: Number(i.dataset.id),
        [conta ? "saldo" : "valor"]: v.toFixed(2),
      };
      (conta ? saldos : movimentos).push(item);
    }
    if (!saldos.length)
      return mostrarErro(
        "Não há contas ativas. Adiciona uma conta antes de fechar o mês.",
      );

    const botao = form.querySelector("#fecho-guardar");
    botao.disabled = true;
    try {
      await api("/api/fechos", "POST", {
        mes_referencia: fim.slice(0, 7),
        data_inicio: inicio,
        data_fim: fim,
        saldos,
        movimentos,
      });
    } catch (e) {
      botao.disabled = false;
      return mostrarErro(e.message);
    }
    modal.close();
    window.location.href = "dashboard.html"; // passo 4: vê os resultados
  }

  async function abrirFecho() {
    construir();
    form.reset();
    mostrarErro("");
    form.querySelector("#fecho-guardar").disabled = false;
    try {
      dados = await api("/api/fechos/formulario");
    } catch (e) {
      dados = {
        contas: [],
        categorias: [],
        data_inicio_sugerida: null,
        dia_inicio_configurado: 27,
      };
      mostrarErro("Não foi possível carregar o formulário: " + e.message);
    }
    preencher();
    const [ini, fim] = periodoSugerido(dados);
    form.elements.inicio.value = ini;
    form.elements.fim.value = fim;
    atualizar();
    if (typeof modal.showModal === "function") modal.showModal();
    else modal.setAttribute("open", "");
  }

  window.abrirFecho = abrirFecho;
  const botao = document.getElementById("btn-fechar");
  if (botao) botao.addEventListener("click", abrirFecho);
})();
