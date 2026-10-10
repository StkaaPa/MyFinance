// Desenha a sidebar (com ícones) em qualquer página: <aside id="sidebar" data-ativo="dashboard"></aside>
const ITENS = [
  [
    "dashboard",
    "Dashboard",
    "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  ],
  [
    "contas",
    "Contas",
    "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M16 15h2",
  ],
  [
    "despesas",
    "Despesas",
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8.5 12.5 12 16l3.5-3.5",
  ],
  [
    "receitas",
    "Receitas",
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 16V8M8.5 11.5 12 8l3.5 3.5",
  ],
  ["investimentos", "Investimentos", "M4 20V4M4 20h16M8 15l3-4 3 2 4-6"],
  [
    "fundo-emergencia",
    "Fundo Emergência",
    "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  ],
  [
    "objetivos",
    "Objetivos",
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  ],
  [
    "despesas-anuais",
    "Despesas Anuais",
    "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M9 3v4M15 3v4",
  ],
  ["relatorios", "Relatórios", "M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6"],
];
const GEAR =
  "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1";
const icone = (d) =>
  `<svg class="icon" viewBox="0 0 24 24"><path d="${d}"/></svg>`;

(function () {
  const barra = document.getElementById("sidebar");
  const ativo = barra.dataset.ativo;
  const link = (slug, nome, d, extra = "") =>
    `<a href="${slug}.html" class="${extra}${slug === ativo ? " active" : ""}">${icone(d)}${nome}</a>`;
  barra.className = "sidebar";
  barra.innerHTML =
    `<div class="brand">${icone("M5 20V10M12 20V4M19 20v-7")}<span>MyFinance</span></div>` +
    `<nav class="menu">${ITENS.map(([s, n, d]) => link(s, n, d)).join("")}</nav>` +
    link("configuracao", "Configuração", GEAR, "menu-config");
})();
