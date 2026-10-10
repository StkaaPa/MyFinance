const ENDPOINT = "/api/objetivos";

async function carregar() {
  try {
    const r = await fetch(ENDPOINT);
    if (!r.ok) throw new Error(r.status);
    preencher(await r.json());
  } catch (e) {
    console.warn("Sem dados de " + ENDPOINT + ":", e.message);
  }
}

// Escreve cada valor do JSON no elemento com data-campo igual à chave
function preencher(dados) {
  for (const [chave, valor] of Object.entries(dados)) {
    const el = document.querySelector('[data-campo="' + chave + '"]');
    if (el) el.textContent = valor;
  }
}

document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    document
      .querySelectorAll(".tab")
      .forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
  }),
);

carregar();
