import csv, sys, json, re
from collections import defaultdict
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
CSV = '/workspace/teste-painel-gastos-bot/exemplo.csv'
PRINT = sys.argv[2] if len(sys.argv) > 2 else None
PRINT_F = sys.argv[3] if len(sys.argv) > 3 else None

def valor(s):
    s = s.strip()
    if ',' in s: s = s.replace('.', '').replace(',', '.')
    return round(float(s), 2)

linhas = list(csv.DictReader(open(CSV, encoding='utf-8')))
def calc(ini=None, fim=None):
    sel = [l for l in linhas if (not ini or l['data'] >= ini) and (not fim or l['data'] <= fim)]
    cat = defaultdict(float); mes = defaultdict(float)
    for l in sel:
        cat[l['categoria']] += valor(l['valor']); mes[l['data'][:7]] += valor(l['valor'])
    return round(sum(valor(l['valor']) for l in sel), 2), {k: round(v, 2) for k, v in cat.items()}, {k: round(v, 2) for k, v in sorted(mes.items())}

def brl(v):
    s = f"{v:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
    return f"R$\u00a0{s}"

def num(t):  # "R$ 1.234,56" -> 1234.56
    return round(float(re.sub(r'[^\d,\-]', '', t).replace(',', '.')), 2)

falhas = []
def check(cond, msg):
    print(('OK   ' if cond else 'FALHA ') + msg)
    if not cond: falhas.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1200, 'height': 1100}, locale='pt-BR', timezone_id='America/Sao_Paulo')
    erros = []
    pg.on('console', lambda m: m.type == 'error' and erros.append(m.text))
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(URL); pg.wait_for_load_state('networkidle')
    check(pg.title() == 'Painel de Gastos', 'título pt-BR')
    pg.set_input_files('#arquivo', CSV)
    pg.wait_for_function("document.querySelectorAll('#tabela-categorias tbody tr').length > 1")
    def ler():
        total = pg.inner_text('#total-geral')
        cats = {r[0]: r[2] for r in pg.eval_on_selector_all('#tabela-categorias tbody tr', 'rs => rs.map(r => [...r.cells].map(c => c.textContent))')}
        barras = json.loads(pg.get_attribute('#grafico', 'data-barras'))
        return total, cats, barras
    t_esp, c_esp, m_esp = calc()
    total, cats, barras = ler()
    print('Página:', total, cats, barras)
    print('Python:', t_esp, c_esp, m_esp)
    check(total == brl(t_esp), f'total geral {total} == {brl(t_esp)}')
    check({k: num(v) for k, v in cats.items()} == c_esp, 'totais por categoria batem')
    check(all(v == brl(c_esp[k]) for k, v in cats.items()), 'formato R$ 1.234,56 na tabela')
    check({m: v for m, v in barras} == m_esp, 'barras por mês batem')
    if PRINT: pg.screenshot(path=PRINT, full_page=True)
    # filtro
    pg.fill('#data-inicial', '2026-08-01'); pg.dispatch_event('#data-inicial', 'change')
    pg.fill('#data-final', '2026-09-30'); pg.dispatch_event('#data-final', 'change')
    t2, c2, m2 = calc('2026-08-01', '2026-09-30')
    total, cats, barras = ler()
    print('Filtro página:', total, cats, barras)
    print('Filtro python:', t2, c2, m2)
    check(total == brl(t2), f'total filtrado {total} == {brl(t2)}')
    check({k: num(v) for k, v in cats.items()} == c2, 'tabela muda com filtro e bate')
    check({m: v for m, v in barras} == m2 and len(barras) == 2, 'gráfico muda com filtro (2 meses) e bate')
    if PRINT_F: pg.screenshot(path=PRINT_F, full_page=True)
    # separador ; e valor 1.234,56
    pg.click('#limpar-filtro')
    pg.set_input_files('#arquivo', files=[{'name': 'pv.csv', 'mimeType': 'text/csv',
        'buffer': 'data;descricao;categoria;valor\n2026-01-10;A;X;1.234,56\n2026-02-10;B;Y;1234.56\n'.encode()}])
    pg.wait_for_function("document.getElementById('total-geral').textContent.includes('2.469,12')", timeout=5000)
    check(True, 'separador ; e formatos 1.234,56 / 1234.56 aceitos (total R$ 2.469,12)')
    check(len(erros) == 0, f'console.error == 0 (erros: {erros})')
    b.close()
print('RESULTADO:', 'PASSOU' if not falhas else f'FALHOU {falhas}')
sys.exit(1 if falhas else 0)
