// Configuração > Geral. Usa as funções de util.js: $, criar, api.
const aviso = $("aviso");
const form = $("form-config");
const ok = $("ok");

function mostrarAviso(msg) {
  aviso.textContent = msg;
  aviso.hidden = !msg;
}

const dia = form.elements.dia;
for (let d = 1; d <= 28; d++) dia.append(new Option("Dia " + d, d)); // até 28: existe em todos os meses

async function carregar() {
  try {
    const c = await api("/api/configuracao");
    dia.value = String(c.dia_inicio);
    form.elements.moeda.value = c.moeda;
    form.elements.idioma.value = c.idioma;
    mostrarAviso("");
  } catch (e) {
    mostrarAviso("Não foi possível carregar a configuração: " + e.message);
  }
}

form.addEventListener("input", () => {
  ok.hidden = true;
});

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const botao = $("btn-guardar");
  botao.disabled = true;
  try {
    await api("/api/configuracao", "PUT", {
      dia_inicio: Number(dia.value),
      moeda: form.elements.moeda.value,
      idioma: form.elements.idioma.value,
    });
    mostrarAviso("");
    ok.hidden = false;
  } catch (e) {
    ok.hidden = true;
    mostrarAviso("Não foi possível guardar: " + e.message);
  } finally {
    botao.disabled = false;
  }
});

carregar();
