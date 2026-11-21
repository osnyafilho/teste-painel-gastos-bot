'use strict';

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatoMes = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' });

let lancamentos = [];

// Converte "1234.56", "1.234,56", "1234,56", "R$ 1.234,56" em número.
function lerValor(texto) {
  let s = String(texto).replace(/R\$/gi, '').replace(/\s/g, '').trim();
  if (s === '') return NaN;
  const negativo = /^-/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/[()\-+]/g, '');
  const ultimaVirgula = s.lastIndexOf(',');
  const ultimoPonto = s.lastIndexOf('.');
  if (ultimaVirgula > ultimoPonto) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (ultimoPonto > ultimaVirgula && ultimaVirgula !== -1) {
    s = s.replace(/,/g, '');
  } else if (ultimaVirgula === -1 && (s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return negativo ? -n : n;
}

// Divide uma linha CSV respeitando aspas.
function dividirLinha(linha, sep) {
  const campos = [];
  let atual = '', aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
      else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { campos.push(atual); atual = ''; }
    else atual += c;
  }
  campos.push(atual);
  return campos.map(x => x.trim());
}

function normalizar(t) {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function lerCSV(texto) {
  const linhas = texto.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  if (linhas.length < 2) throw new Error('O arquivo não tem linhas de dados.');
  const cab = linhas[0];
  const sep = (cab.split(';').length > cab.split(',').length) ? ';' : ',';
  const colunas = dividirLinha(cab, sep).map(normalizar);
  const idx = {};
  for (const nome of ['data', 'descricao', 'categoria', 'valor']) {
    idx[nome] = colunas.indexOf(nome);
    if (idx[nome] === -1) throw new Error(`Coluna "${nome}" não encontrada no cabeçalho.`);
  }
  const itens = [];
  let ignoradas = 0;
  for (let i = 1; i < linhas.length; i++) {
    const c = dividirLinha(linhas[i], sep);
    const data = c[idx.data] || '';
    const valor = lerValor(c[idx.valor] || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(valor)) { ignoradas++; continue; }
    itens.push({ data, descricao: c[idx.descricao] || '', categoria: c[idx.categoria] || 'Sem categoria', valor });
  }
  return { itens, ignoradas };
}

function filtrar() {
  const ini = document.getElementById('data-inicial').value;
  const fim = document.getElementById('data-final').value;
  return lancamentos.filter(l => (!ini || l.data >= ini) && (!fim || l.data <= fim));
}

function atualizar() {
  const dados = filtrar();
  const total = dados.reduce((s, l) => s + l.valor, 0);
  document.getElementById('total-geral').textContent = formatoMoeda.format(total);
  document.getElementById('qtd-lancamentos').textContent =
    `${dados.length} ${dados.length === 1 ? 'lançamento' : 'lançamentos'}`;

  const porCategoria = new Map();
  for (const l of dados) {
    const a = porCategoria.get(l.categoria) || { total: 0, qtd: 0 };
    a.total += l.valor; a.qtd++;
    porCategoria.set(l.categoria, a);
  }
  const corpo = document.querySelector('#tabela-categorias tbody');
  corpo.innerHTML = '';
  const ordenadas = [...porCategoria.entries()].sort((a, b) => b[1].total - a[1].total);
  if (ordenadas.length === 0) {
    corpo.innerHTML = '<tr><td colspan="3" class="vazio">Sem dados no período.</td></tr>';
  }
  for (const [cat, a] of ordenadas) {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); td1.textContent = cat;
    const td2 = document.createElement('td'); td2.className = 'num'; td2.textContent = a.qtd;
    const td3 = document.createElement('td'); td3.className = 'num'; td3.textContent = formatoMoeda.format(a.total);
    tr.append(td1, td2, td3);
    corpo.appendChild(tr);
  }

  const porMes = new Map();
  for (const l of dados) {
    const m = l.data.slice(0, 7);
    porMes.set(m, (porMes.get(m) || 0) + l.valor);
  }
  const meses = [...porMes.keys()].sort();
  desenharGrafico(meses.map(m => ({ mes: m, total: porMes.get(m) })));
}

function rotuloMes(m) {
  const [a, mm] = m.split('-').map(Number);
  return formatoMes.format(new Date(Date.UTC(a, mm - 1, 1))).replace('. de ', '/').replace(' de ', '/');
}

function desenharGrafico(barras) {
  const canvas = document.getElementById('grafico');
  canvas.dataset.barras = JSON.stringify(barras.map(b => [b.mes, Math.round(b.total * 100) / 100]));
  const dpr = window.devicePixelRatio || 1;
  const largura = canvas.clientWidth || 800, altura = 320;
  canvas.width = largura * dpr; canvas.height = altura * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, largura, altura);
  ctx.font = '12px system-ui, sans-serif';
  if (barras.length === 0) {
    ctx.fillStyle = '#8a92a1'; ctx.textAlign = 'center';
    ctx.fillText('Sem dados no período.', largura / 2, altura / 2);
    return;
  }
  const margem = { esq: 16, dir: 16, topo: 28, base: 36 };
  const max = Math.max(...barras.map(b => b.total), 0) || 1;
  const areaL = largura - margem.esq - margem.dir;
  const areaA = altura - margem.topo - margem.base;
  const passo = areaL / barras.length;
  const larguraBarra = Math.min(70, passo * 0.6);
  ctx.strokeStyle = '#e3e6eb';
  ctx.beginPath(); ctx.moveTo(margem.esq, margem.topo + areaA); ctx.lineTo(largura - margem.dir, margem.topo + areaA); ctx.stroke();
  barras.forEach((b, i) => {
    const h = Math.max(0, b.total) / max * areaA;
    const x = margem.esq + passo * i + (passo - larguraBarra) / 2;
    const y = margem.topo + areaA - h;
    ctx.fillStyle = '#2457d6';
    ctx.fillRect(x, y, larguraBarra, h);
    ctx.fillStyle = '#1d2330'; ctx.textAlign = 'center';
    ctx.fillText(formatoMoeda.format(b.total), x + larguraBarra / 2, y - 8);
    ctx.fillStyle = '#5b6475';
    ctx.fillText(rotuloMes(b.mes), x + larguraBarra / 2, margem.topo + areaA + 20);
  });
}

function carregarTexto(texto, nome) {
  const status = document.getElementById('status');
  try {
    const { itens, ignoradas } = lerCSV(texto);
    lancamentos = itens;
    status.className = '';
    status.textContent = `${nome}: ${itens.length} lançamentos carregados` +
      (ignoradas ? ` (${ignoradas} linha(s) ignorada(s) por data ou valor inválido)` : '') + '.';
    atualizar();
  } catch (e) {
    status.className = 'erro';
    status.textContent = `Não foi possível ler o arquivo: ${e.message}`;
  }
}

document.getElementById('arquivo').addEventListener('change', ev => {
  const arq = ev.target.files[0];
  if (!arq) return;
  const leitor = new FileReader();
  leitor.onload = () => carregarTexto(leitor.result, arq.name);
  leitor.readAsText(arq, 'UTF-8');
});

document.getElementById('carregar-exemplo').addEventListener('click', async () => {
  try {
    const r = await fetch('exemplo.csv');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    carregarTexto(await r.text(), 'exemplo.csv');
  } catch (e) {
    const status = document.getElementById('status');
    status.className = 'erro';
    status.textContent = 'Não foi possível carregar o exemplo (abra a página por um servidor ou use o botão de upload).';
  }
});

document.getElementById('data-inicial').addEventListener('change', atualizar);
document.getElementById('data-final').addEventListener('change', atualizar);
document.getElementById('limpar-filtro').addEventListener('click', () => {
  document.getElementById('data-inicial').value = '';
  document.getElementById('data-final').value = '';
  atualizar();
});
window.addEventListener('resize', atualizar);
atualizar();
