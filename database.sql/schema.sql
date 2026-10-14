/*criar a tabela contas*/
CREATE TABLE contas (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome        TEXT NOT NULL,
  instituicao TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('Conta Ordem','Poupança','Investimento','Reforma')),
  ativo       BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO contas (nome, instituicao, tipo) VALUES ('Conta Ordem', 'CGD', 'Conta Ordem');
INSERT INTO contas (nome, instituicao, tipo) VALUES ('PPR', 'Optimize', 'Reforma');

/* truncate que limpa a tabela e faz o reset aos IDs*/
TRUNCATE contas RESTART IDENTITY;

/*criar a tabela que vai contar as datas de fim de mês*/
CREATE TABLE fechos_mensais (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mes_referencia DATE NOT NULL UNIQUE CHECK (EXTRACT(DAY FROM mes_referencia) = 1),
  data_inicio    DATE NOT NULL,
  data_fim       DATE NOT NULL,
  fechado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (data_fim >= data_inicio)
);

INSERT INTO fechos_mensais (mes_referencia, data_inicio, data_fim) VALUES ('2026-09-01', '2026-08-27', '2026-09-26');

/* truncate que limpa a tabela e faz o reset aos IDs*/
TRUNCATE fechos_mensais RESTART IDENTITY;


/*criar a tabela que guarda a informação relativa às categorias das despesas/receitas*/
CREATE TABLE categorias (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome             TEXT NOT NULL,
  tipo             TEXT NOT NULL CHECK (tipo IN ('despesa','receita')),
  categoria_pai_id INTEGER REFERENCES categorias(id),
  ativo            BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO categorias (nome, tipo) VALUES ('Alimentação', 'despesa');
INSERT INTO categorias (nome, tipo, categoria_pai_id) VALUES ('Supermercado', 'despesa', 1);
INSERT INTO categorias (nome, tipo, categoria_pai_id) VALUES ('Takeaway/Delivery', 'despesa', 1);
INSERT INTO categorias (nome, tipo) VALUES ('Salário', 'receita');

/* truncate que limpa a tabela e faz o reset aos IDs*/
TRUNCATE categorias RESTART IDENTITY;


/* Teste para validar a troca do categoria_pai_id pelo nome da categoria principal*/
SELECT filha.nome AS subcategoria, mae.nome AS categoria
FROM categorias filha
JOIN categorias mae ON mae.id = filha.categoria_pai_id;


/*criar a tabela que guarda a informação relativa aos saldos de todas as contas*/
CREATE TABLE saldos_conta (
  id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conta_id INTEGER NOT NULL REFERENCES contas(id),
  fecho_id INTEGER NOT NULL REFERENCES fechos_mensais(id) ON DELETE CASCADE,
  saldo    NUMERIC(12,2) NOT NULL,
  UNIQUE (conta_id, fecho_id)
);


/*criar a tabela que guarda a informação relativa aos saldos de todas as categorias (alimentação, saude, transportes, ....)*/
CREATE TABLE movimentos_categoria (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  fecho_id     INTEGER NOT NULL REFERENCES fechos_mensais(id) ON DELETE CASCADE,
  valor        NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  UNIQUE (categoria_id, fecho_id)
);


/*novo insert para testar todo o circuito das 5 tabelas*/
INSERT INTO contas (nome, instituicao, tipo) VALUES ('PPR', 'Optimize', 'reforma');
INSERT INTO fechos_mensais (mes_referencia, data_inicio, data_fim) VALUES ('2026-09-01', '2026-08-27', '2026-09-26');
INSERT INTO categorias (nome, tipo) VALUES ('Alimentação', 'despesa');
INSERT INTO categorias (nome, tipo, categoria_pai_id) VALUES ('Supermercado', 'despesa', 1);
INSERT INTO saldos_conta (conta_id, fecho_id, saldo) VALUES (1, 1, 1000.00);
INSERT INTO movimentos_categoria (categoria_id, fecho_id, valor) VALUES (2, 1, 180.00);

/*teste do circuito das 5 tabelas*/
SELECT cat.nome AS categoria, f.mes_referencia, m.valor
FROM movimentos_categoria m
JOIN categorias cat   ON cat.id = m.categoria_id
JOIN fechos_mensais f ON f.id = m.fecho_id;

/*Teste do delete cascade - as duas tabelas têm de ficar vazias, porque caso apague uma data de fecho, os valores desse fecho são apagados também*/
DELETE FROM fechos_mensais WHERE id = 1;
SELECT * FROM saldos_conta;
SELECT * FROM movimentos_categoria;

TRUNCATE contas, categorias, fechos_mensais, saldos_conta, movimentos_categoria RESTART IDENTITY;

/* Criação das tabelas OBJETIVOS, DESPESAS_ANUAIS e CONFIGURACOES*/
CREATE TABLE objetivos (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome TEXT NOT NULL,
  valor_alvo NUMERIC(12,2) NOT NULL CHECK (valor_alvo > 0),
  valor_atual NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor_atual >= 0),
  contribuicao_mensal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (contribuicao_mensal >= 0),
  fundo_emergencia BOOLEAN NOT NULL DEFAULT FALSE,
  concluido BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX um_fundo_emergencia ON objetivos (fundo_emergencia) WHERE fundo_emergencia;

-- Liga o fundo de emergência a uma conta (ex.: uma conta poupança).
-- O valor do fundo em cada mês passa a ser o saldo dessa conta no fecho: não há nada de novo para preencher.
ALTER TABLE objetivos ADD COLUMN conta_id INTEGER REFERENCES contas(id);
ALTER TABLE objetivos ADD COLUMN IF NOT EXISTS icone TEXT NOT NULL DEFAULT 'alvo'
    CHECK (icone IN ('alvo', 'casa', 'carro', 'viagem', 'estudos', 'familia'));

CREATE TABLE despesas_anuais (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  pago BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE configuracoes (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
INSERT INTO configuracoes VALUES ('dia_inicio','27'), ('moeda','EUR'), ('idioma','pt');

-- MyFinance: ativos dentro das contas de investimento
-- Um ativo é um investimento concreto (ETF World, Bitcoin, PPR...) que vive dentro de uma conta.
CREATE TABLE ativos (
  id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome     TEXT NOT NULL,
  classe   TEXT NOT NULL CHECK (classe IN ('etf','acao','cripto','ppr','outro')),
  conta_id INTEGER NOT NULL REFERENCES contas(id),
  ativo    BOOLEAN NOT NULL DEFAULT TRUE
);

-- O valor de cada ativo em cada mês fechado (e quanto entrou do teu bolso nesse mês).
CREATE TABLE valores_ativo (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ativo_id   INTEGER NOT NULL REFERENCES ativos(id),
  fecho_id   INTEGER NOT NULL REFERENCES fechos_mensais(id) ON DELETE CASCADE,
  valor      NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  depositado NUMERIC(12,2) NOT NULL DEFAULT 0,   -- negativo = levantaste/vendeste
  UNIQUE (ativo_id, fecho_id)
);
