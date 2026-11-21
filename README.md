# Painel de Gastos

Página web estática (HTML, CSS e JavaScript puros, sem dependências) que lê um CSV de gastos e mostra:

- total gasto;
- tabela com o total por categoria;
- gráfico de barras com o total por mês (desenhado em `<canvas>`, sem biblioteca);
- filtro por período (data inicial e final) que atualiza tabela e gráfico.

Valores aparecem no formato brasileiro (R$ 1.234,56).

## Como usar

1. Abra `index.html` no navegador (duplo clique já funciona) ou acesse a prévia publicada.
2. Clique em **Escolher arquivo CSV** e selecione seu arquivo. Também há o botão **Carregar exemplo**
   (este precisa da página servida por HTTP, por exemplo `python3 -m http.server`).
3. Use **Data inicial** e **Data final** para filtrar o período.

## Formato do CSV

Cabeçalho obrigatório: `data,descricao,categoria,valor`

- `data`: AAAA-MM-DD
- `valor`: aceita `1234.56` ou `1.234,56` (use aspas se o separador for vírgula)
- separador: vírgula (`,`) ou ponto e vírgula (`;`)

Veja `exemplo.csv` (30 lançamentos fictícios de junho a outubro de 2026).
