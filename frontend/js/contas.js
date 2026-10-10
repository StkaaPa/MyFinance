// Página Contas. Este ficheiro é autónomo: não depende de nenhum outro .js.
(function () {
  "use strict";

  const TIPOS = {
    "Conta Ordem": "Conta à ordem",
    Poupança: "Poupança",
    Investimento: "Investimento",
    Reforma: "Reforma",
  };

  const $ = (id) => document.getElementById(id);
  const corpo = $("lista-contas");
  const modal = $("modal-conta");
  const form = $("form-conta");
  const erro = $("erro-conta");

  if (!corpo || !modal || !form || !erro) {
    console.error(
      "contas.html está incompleto: faltam elementos (lista-contas, modal-conta, form-conta ou erro-conta).",
    );
    return;
  }

  // Aviso de erros no topo da página (se o HTML não o tiver, cria-se aqui)
  let aviso = $("aviso");
  if (!aviso) {
    aviso = document.createElement("p");
    aviso.className = "aviso";
    aviso.style.cssText =
      "background:#fdecea;color:#b3392c;border:1px solid #f6cfca;border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:12px";
    aviso.hidden = true;
    const cartao = corpo.closest("section") || corpo.closest("table");
    if (cartao) cartao.before(aviso);
  }
  function mostrarAviso(msg) {
    aviso.textContent = msg;
    aviso.hidden = !msg;
  }

  // 1024.5 -> "€ 1.024,50"
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

  // Pedido à API; lança um Error com a mensagem do servidor se falhar
  async function api(url, metodo, corpoPedido) {
    const opcoes = { method: metodo || "GET" };
    if (corpoPedido !== undefined) {
      opcoes.headers = { "Content-Type": "application/json" };
      opcoes.body = JSON.stringify(corpoPedido);
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
    return r.status === 204 ? null : r.json();
  }

  function abrirModal() {
    if (typeof modal.showModal === "function") modal.showModal();
    else modal.setAttribute("open", "");
  }
  function fecharModal() {
    if (typeof modal.close === "function") modal.close();
    else modal.removeAttribute("open");
  }

  /* ---------- Tabela ---------- */

  // Interruptor "Ativo": ao mudar, PATCH /api/contas/{id}; se falhar, volta ao estado anterior
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
      td.style.textAlign = "center";
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
        criar("td", "muted-td", TIPOS[c.tipo] || c.tipo),
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

  const btnAdicionar = $("btn-adicionar");
  if (btnAdicionar) {
    btnAdicionar.addEventListener("click", () => {
      form.reset();
      erro.textContent = "";
      abrirModal();
    });
  } else {
    console.error('Falta o botão com id="btn-adicionar" no contas.html');
  }

  const btnCancelar = $("btn-cancelar");
  if (btnCancelar) btnCancelar.addEventListener("click", fecharModal);
  else console.error('Falta o botão com id="btn-cancelar" no contas.html');

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
    fecharModal();
    carregarContas();
  });

  carregarContas();
})();
