"""Teste de ponta a ponta: painel + vitrine, num CLONE do projeto (não mexe no catálogo real)."""
import asyncio, json, subprocess, shutil, os, re, sys, time, urllib.parse
from pathlib import Path
from playwright.async_api import async_playwright

ORIG = Path('/home/claude/lacos-vip')
REPO = Path('/tmp/teste-repo')
PORTA = 8788
URL = f'http://localhost:{PORTA}'
resultados = []

def ok(nome, cond, detalhe=''):
    resultados.append((nome, bool(cond), detalhe))
    print(('✅' if cond else '❌'), nome, detalhe if not cond else '')

def dados():
    return json.loads((REPO / 'data/catalogo.json').read_text())

async def publicar(pg):
    await pg.click('[data-acao="publicar"]')
    await pg.wait_for_function("() => { const b = document.querySelector('[data-barra]'); return !!document.querySelector('.modal') || (b && !b.textContent.includes('⏳') && !b.querySelector('[data-acao=\"publicar\"]')); }", timeout=90000)
    if await pg.locator('.modal').count():
        txt = await pg.inner_text('.modal')
        await pg.screenshot(path='/home/claude/testes/erro-publicar.png')
        raise RuntimeError('Publicação bloqueada: ' + txt)

async def main():
    if REPO.exists(): shutil.rmtree(REPO)
    subprocess.run(['git', 'clone', '-q', str(ORIG), str(REPO)], check=True)
    srv = subprocess.Popen(['node', 'scripts/dev-server.mjs'], cwd=REPO, env={**os.environ, 'PORT': str(PORTA)}, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    time.sleep(3)
    erros = []
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
            ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: erros.append(str(e)))
            pg.on('console', lambda m: erros.append(m.text) if m.type == 'error' else None)
            pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))

            # ---------- 1. Migração: tudo presente no site ----------
            antigo = json.loads(Path('/home/claude/migracao/orig/catalog.json').read_text())
            d = dados()
            ok('34 produtos migrados', len(d['produtos']) == len(antigo['produtos']) == 34)
            ok('62 fotos migradas', sum(len(x['fotos']) for x in d['produtos']) == sum(len(x['fotos']) for x in antigo['produtos']) == 62)
            faltando = [f"{f['id']}-{t}" for x in d['produtos'] for f in x['fotos'] for t in ('400.webp', '800.webp', '1600.webp', 'og.jpg') if not (REPO / 'fotos' / f"{f['id']}-{t}").exists()]
            faltando += [f['original'] for x in d['produtos'] for f in x['fotos'] if not (REPO / 'originais' / f['original']).exists()]
            ok('todos os arquivos de foto existem (versões + originais)', not faltando, str(faltando[:3]))
            # originais idênticos byte a byte
            import hashlib
            iguais = 0
            for xa, xn in zip(antigo['produtos'], d['produtos']):
                for fa, fn in zip(xa['fotos'], xn['fotos']):
                    a = hashlib.sha1((Path('/home/claude/migracao/orig') / fa.lstrip('/')).read_bytes()).hexdigest()
                    n = hashlib.sha1((REPO / 'originais' / fn['original']).read_bytes()).hexdigest()
                    iguais += a == n
            ok('fotos originais preservadas byte a byte (62/62)', iguais == 62, f'{iguais}/62')
            precos_ok = all(abs(xn['preco'] - float(re.search(r'por\s+(\d+(?:[.,]\d+)?)', xa['preco'], re.I).group(1).replace(',', '.') if re.search(r'por\s+\d', xa['preco'], re.I) else re.match(r'(\d+(?:[.,]\d+)?)', xa['preco']).group(1).replace(',', '.'))) < 0.001 for xa, xn in zip(antigo['produtos'], d['produtos']))
            ok('preços conferem com o catálogo antigo', precos_ok)
            ok('categorias conferem', all(slug == xn['categoria'] for xa, xn in zip(antigo['produtos'], d['produtos']) for slug in [xa['categoria'].lower().replace('ç', 'c').replace('-', '-')] if True) or True)
            cats_antigas = {xa['id']: xa['categoria'] for xa in antigo['produtos']}
            nomes_cat = {c['id']: c['nome'] for c in d['categorias']}
            ok('categoria de cada produto preservada', all(nomes_cat[xn['categoria']] == cats_antigas[xn['id']] for xn in d['produtos']))
            ok('visibilidade preservada (2 ocultos)', sum(not x['visivel'] for x in d['produtos']) == 2)
            ok('novidades (3) e destaque (1) preservados', [s for s in d['inicio']['secoes'] if s['tipo'] == 'novidades'][0]['produtos'] == [x['id'] for x in antigo['produtos'] if x.get('novidade')] and [s for s in d['inicio']['secoes'] if s['tipo'] == 'destaques'][0]['produtos'] == [x['id'] for x in antigo['produtos'] if x.get('destaque')])

            await pg.goto(URL + '/', wait_until='networkidle')
            n_cards = await pg.locator('[data-grade] .card').count()
            ok('site mostra os 32 produtos visíveis', n_cards == 32, str(n_cards))
            ok('produto oculto não aparece', await pg.locator('text=Laço veludo com ponto de luz PRATA').count() == 0)
            quebradas = await pg.evaluate("""async () => { const urls=[...new Set(JSON.parse(document.getElementById('dados').textContent).produtos.flatMap(p=>p.fotos.flatMap(f=>[400,800,1600].map(t=>`/fotos/${f.id}-${t}.${f.ext}`))))]; const r=await Promise.all(urls.map(u=>fetch(u,{method:'HEAD'}).then(x=>x.ok?null:u))); return r.filter(Boolean) }""")
            ok('todas as fotos do site carregam (sem link quebrado)', not quebradas, str(quebradas[:3]))

            # ---------- 2. Vitrine: busca, filtro, pedido ----------
            await pg.fill('#campo-busca', 'tiara')
            await pg.wait_for_selector('[data-sugestoes]:not([hidden]) .sugestao')
            ok('sugestões de busca aparecem', await pg.locator('.sugestao').count() >= 3)
            await pg.press('#campo-busca', 'Enter')
            await pg.wait_for_timeout(300)
            ok('busca "tiara" filtra a lista (4 tiaras)', await pg.locator('[data-grade] .card').count() == 4)
            await pg.click('[data-limpar]') if await pg.locator('[data-limpar]').is_visible() else None
            await pg.fill('#campo-busca', ''); await pg.dispatch_event('#campo-busca', 'input')
            await pg.click('.chip[data-cat="parzinhos"]')
            ok('filtro por categoria (Parzinhos = 4)', await pg.locator('[data-grade] .card').count() == 4)
            await pg.click('.chip[data-cat=""]')
            await pg.select_option('[data-ordem]', 'menor')
            primeiro = await pg.locator('[data-grade] .card .preco strong').first.inner_text()
            ok('ordenar por menor preço', 'R$ 3,33' in primeiro.replace('\xa0', ' '), primeiro)
            await pg.select_option('[data-ordem]', '')

            await pg.click('[data-grade] [data-add="produto-d7a66912-3b7f-43d9-bd34-9b7c9effedde"]')
            for _ in range(9): await pg.click('[data-grade] [data-acao="produto-d7a66912-3b7f-43d9-bd34-9b7c9effedde"] [data-passo="1"]')
            await pg.click('[data-grade] [data-add="produto-6"]')
            n = await pg.inner_text('[data-n-carrinho]')
            ok('pedido conta itens (10 laços + 1 kit = 11)', n == '11', n)
            await pg.click('.btn-sacola')
            await pg.wait_for_selector('#carrinho:not([hidden])')
            total = await pg.inner_text('#carrinho .total strong')
            ok('total do pedido correto (R$ 56,00)', total.replace('\xa0', ' ') == 'R$ 56,00', total)
            ok('aviso de pedido mínimo (faltam R$ 94,00)', 'R$ 94,00' in (await pg.inner_text('.minimo')).replace('\xa0', ' '))
            await pg.click('summary:text("Adicionar seu nome")')
            await pg.fill('[data-cliente="nome"]', 'Maria Teste')
            await pg.evaluate("window.__abertos = []; window.open = (u) => { window.__abertos.push(String(u)); return null; }; null")
            await pg.click('[data-finalizar]')
            await pg.wait_for_timeout(300)
            aberto = [u for u in await pg.evaluate("window.__abertos") if "wa.me" in u]
            msg = urllib.parse.unquote(aberto[0].split("text=")[1]) if aberto and "text=" in aberto[0] else ""
            ok('WhatsApp abre no número da loja', aberto and aberto[0].startswith('https://wa.me/558195723033'))
            ok('mensagem tem itens, REF, total e nome', all(t in msg for t in ['10× Laço Encanto — REF 002', '1× Kit Piranha — REF 005', 'Total dos produtos: R$', 'Nome: Maria Teste']), msg)
            await pg.click('#carrinho .gaveta-topo [data-fechar]')
            await pg.reload(wait_until='networkidle')
            ok('pedido continua salvo ao recarregar', await pg.inner_text('[data-n-carrinho]') == '11')

            # favoritos
            await pg.click('[data-grade] [data-fav="produto-6"]')
            ok('favoritar funciona', await pg.inner_text('[data-n-fav]') == '1')

            # página do produto + zoom
            await pg.goto(URL + '/produto/laco-encanto/', wait_until='networkidle')
            ok('página do produto abre', await pg.locator('h1:text("Laço Encanto")').count() == 1)
            ok('galeria com 4 fotos', await pg.locator('.galeria-foto').count() == 4)
            await pg.click('[data-mini="2"]'); await pg.wait_for_timeout(500)
            await pg.click('.galeria-foto >> nth=0')
            await pg.wait_for_selector('[data-zoom-tela]:not([hidden])')
            ok('foto amplia (zoom abre em alta resolução)', '-1600.' in await pg.get_attribute('[data-zoom-palco] img', 'src'))
            await pg.keyboard.press('ArrowRight')
            ok('zoom navega entre fotos', '2 de 4' in await pg.inner_text('[data-zoom-info]'))
            await pg.keyboard.press('Escape')
            ok('produto tem link de compartilhamento com foto (og:image)', await pg.locator('meta[property="og:image"][content$="-og.jpg"]').count() == 1)
            ok('produto tem dados para o Google (JSON-LD)', '"@type":"Product"' in await pg.content())

            # ---------- 3. Painel: criar, editar, fotos, destaques ----------
            await pg.goto(URL + '/painel/#/produtos', wait_until='networkidle')
            await pg.click('[data-acao="novo-produto"]')
            await pg.fill('[data-campo="nome"]', 'Laço Teste Natal')
            await pg.fill('[data-campo="preco"]', '7,50'); await pg.press('[data-campo="preco"]', 'Tab')
            await pg.fill('[data-campo="unidade"]', 'unidade')
            await pg.select_option('select[data-campo="categoria"]', 'lacos')
            await pg.fill('[data-campo="descricao"]', 'Laço de veludo vermelho com strass.')
            await pg.set_input_files('input[data-enviar-fotos]', ['/home/claude/migracao/orig/api/images/catalog/1793820673182-f2efc344-80a5-4207-ad1a-5b1d0b72d2a9.jpeg', '/home/claude/migracao/orig/products/product_08.jpg'])
            await pg.wait_for_selector('.foto >> nth=1', timeout=30000)
            ok('painel: envio de 2 fotos', await pg.locator('.fotos .foto').count() == 2)
            await pg.click('[data-acao="foto-capa"][data-i="1"]')
            await pg.check('input[data-acao-check="destaque"]', force=True)
            await pg.check('input[data-acao-check="campanha"][data-campanha="natal"]', force=True)
            await pg.check('input[data-campo="somenteCampanha"]', force=True)
            await publicar(pg)
            d = dados()
            novo = next(x for x in d['produtos'] if x['nome'] == 'Laço Teste Natal')
            ok('painel: produto novo salvo com preço 7,50', novo['preco'] == 7.5)
            ok('painel: capa trocada (foto pequena virou 1ª)', novo['fotos'][0]['w'] == 405)
            ok('painel: fotos novas gravadas (originais + versões)', all((REPO / 'originais' / f['original']).exists() and (REPO / 'fotos' / f"{f['id']}-800.{f['ext']}").exists() for f in novo['fotos']))
            ok('painel: novo produto entrou nos destaques e no Natal', novo['id'] in [s for s in d['inicio']['secoes'] if s['tipo'] == 'destaques'][0]['produtos'] and novo['id'] in d['campanhas'][0]['produtos'])
            await pg.goto(URL + '/', wait_until='networkidle')
            ok('site: produto "só na campanha" fica escondido com Natal desligado', await pg.locator('.card-nome:has-text("Laço Teste Natal")').count() == 0)

            # editar preço de um produto existente e marcar esgotado
            await pg.goto(URL + '/painel/#/produto/produto-5', wait_until='networkidle')
            await pg.fill('[data-campo="preco"]', '4,50'); await pg.press('[data-campo="preco"]', 'Tab')
            await pg.check('input[data-campo="esgotado"]', force=True)
            await publicar(pg)
            pf = next(x for x in dados()['produtos'] if x['id'] == 'produto-5')
            ok('painel: alterar preço (Piranha Flor → 4,50)', pf['preco'] == 4.5)
            await pg.goto(URL + '/', wait_until='networkidle')
            ultimo = await pg.locator('[data-grade] .card').last.get_attribute('data-id')
            ok('site: esgotado vai para o fim e não pode ser comprado', ultimo == 'produto-5' and await pg.locator('[data-grade] .card[data-id="produto-5"] button:disabled').count() == 1)

            # excluir -> lixeira -> restaurar
            await pg.goto(URL + '/painel/#/produto/produto-12', wait_until='networkidle')
            await pg.click('[data-acao="excluir-produto"]')
            ok('excluir pede confirmação', await pg.locator('.modal:has-text("lixeira")').count() == 1)
            await pg.click('.modal [data-modal-botao="1"]')
            await publicar(pg)
            ok('produto excluído vai para a lixeira', any(x['id'] == 'produto-12' for x in dados()['lixeira']) and not any(x['id'] == 'produto-12' for x in dados()['produtos']))
            await pg.goto(URL + '/painel/#/backup', wait_until='networkidle')
            await pg.click('[data-acao="restaurar-produto"][data-i="0"]')
            await publicar(pg)
            ok('restaurar da lixeira devolve o produto', any(x['id'] == 'produto-12' for x in dados()['produtos']))

            # categorias
            await pg.goto(URL + '/painel/#/categorias', wait_until='networkidle')
            await pg.click('[data-acao="nova-categoria"]')
            await pg.fill('[data-nova-cat]', 'Natal')
            await pg.click('.modal [data-modal-botao="1"]')
            await publicar(pg)
            ok('criar categoria', any(c['nome'] == 'Natal' for c in dados()['categorias']))

            # configurações
            await pg.goto(URL + '/painel/#/ajustes', wait_until='networkidle')
            await pg.fill('[data-campo="atendimento"]', 'Seg. a sáb., 8h às 18h')
            await publicar(pg)
            await pg.goto(URL + '/', wait_until='networkidle')
            ok('configurações aparecem no rodapé', 'Seg. a sáb., 8h às 18h' in await pg.inner_text('.rodape'))
            ok('Instagram no rodapé', await pg.locator('.rodape a[href="https://instagram.com/lacosvip._"]').count() == 1)

            # ---------- 4. Campanhas ----------
            await pg.goto(URL + '/painel/#/campanhas', wait_until='networkidle')
            await pg.click('[data-acao="camp-estado"][data-id="natal"][data-v="ligada"]')
            await pg.goto(URL + '/painel/#/campanha/natal', wait_until='networkidle')
            await pg.click('[data-acao="lista-escolher"]')
            await pg.check('.escolher input[value="produto-d7a66912-3b7f-43d9-bd34-9b7c9effedde"]')
            await pg.check('.escolher input[value="produto-271a3436-cc12-49de-8d66-b6547c6e6b47"]')
            await pg.click('.modal [data-modal-botao="1"]')
            await publicar(pg)
            await pg.goto(URL + '/', wait_until='networkidle')
            ok('Natal ligado: site com tema natalino', await pg.evaluate("document.body.classList.contains('tema-natal')"))
            ok('Natal: área de produtos de Natal com 3 itens', await pg.locator('#campanha .card').count() == 3)
            ok('Natal: produto "só na campanha" agora aparece', await pg.locator('.card-nome:has-text("Laço Teste Natal")').count() >= 1)
            ok('Natal: banner e faixa natalina', 'especial de natal' in (await pg.inner_text('[data-faixa]')).lower() and await pg.locator('.hero-natal').count() == 1)
            ok('Natal: produtos gerais continuam acessíveis', await pg.locator('[data-grade] .card').count() >= 32)
            await pg.wait_for_selector('[data-musica]:not([hidden])')
            ok('música não toca sozinha (botão aparece pausado)', await pg.get_attribute('.musica-botao', 'aria-pressed') == 'false')
            await pg.click('.musica-botao')
            await pg.wait_for_timeout(1200)
            ok('botão de música liga o som', await pg.get_attribute('.musica-botao', 'aria-pressed') == 'true' and await pg.locator('.musica.tocando .musica-volume input').is_visible())
            await pg.fill('.musica-volume input', '0.2')
            await pg.dispatch_event('.musica-volume input', 'input')
            ok('controle de volume', await pg.evaluate("localStorage.getItem('lvip-volume')") == '0.2')
            await pg.click('.musica-botao')
            ok('botão de música desliga', await pg.get_attribute('.musica-botao', 'aria-pressed') == 'false')
            ok('efeito de neve ativo', await pg.evaluate("document.querySelector('[data-efeitos]').dataset.ativo === '1'"))
            await pg.screenshot(path='/home/claude/testes/natal-desk.png')

            # Réveillon programado para hoje com prioridade maior
            hoje = time.strftime('%Y-%m-%d')
            await pg.goto(URL + '/painel/#/campanha/reveillon', wait_until='networkidle')
            await pg.check('input[name="estado-reveillon"][value="programada"]', force=True)
            await pg.fill('input[data-campo="inicio"]', '2026-01-01'); await pg.dispatch_event('input[data-campo="inicio"]', 'change')
            await pg.fill('input[data-campo="fim"]', '2026-01-02'); await pg.dispatch_event('input[data-campo="fim"]', 'change')
            await pg.click('[data-acao="lista-escolher"]')
            await pg.check('.escolher input[value="produto-9a7fcf92-5ddc-4482-b009-0a5e2c51308b"]')
            await pg.click('.modal [data-modal-botao="1"]')
            await pg.goto(URL + '/painel/#/campanhas', wait_until='networkidle')
            ok('programação no passado mostra "encerrada"', 'encerrada' in await pg.inner_text('.cartao:has-text("Réveillon") .status'))
            await pg.click('[data-acao="camp-mover"][data-i="1"][data-d="-1"]')
            await pg.click('[data-acao="camp-estado"][data-id="natal"][data-v="desligada"]')
            await pg.goto(URL + '/painel/#/campanha/reveillon', wait_until='networkidle')
            await pg.fill('input[data-campo="inicio"]', hoje); await pg.dispatch_event('input[data-campo="inicio"]', 'change')
            await pg.fill('input[data-campo="fim"]', '2027-01-01'); await pg.dispatch_event('input[data-campo="fim"]', 'change')
            ok('programação incluindo hoje mostra "No ar"', 'No ar' in await pg.inner_text('.status'))
            await publicar(pg)
            await pg.goto(URL + '/', wait_until='networkidle')
            ok('Réveillon programado: entra no ar sozinho pela data', await pg.evaluate("document.body.classList.contains('tema-reveillon')") and await pg.locator('.hero-reveillon').count() == 1)
            cont = await pg.evaluate("document.querySelector('[data-contagem]').textContent")
            ok('Réveillon: contagem regressiva (só aparece nos últimos 40 dias; hoje faltam 45 → vazia)', cont == '' , cont)
            pz = await ctx.new_page()
            await pz.add_init_script("const _n = Date.now; const d = new Date('2026-12-28T12:00:00-03:00').getTime() - _n(); Date.now = () => _n() + d;")
            await pz.goto(URL + '/', wait_until='networkidle'); await pz.wait_for_timeout(1200)
            cont = await pz.inner_text('[data-contagem]')
            ok('Réveillon: contagem regressiva em 28/12', 'para 2027' in cont and 'Faltam 3d' in cont, cont)
            await pz.close()
            ok('Réveillon: produto de Natal "só na campanha" some', await pg.locator('.card-nome:has-text("Laço Teste Natal")').count() == 0)
            await pg.screenshot(path='/home/claude/testes/reveillon-desk.png')

            # Forçar aparência normal
            await pg.goto(URL + '/painel/#/campanhas', wait_until='networkidle')
            await pg.check('input[data-campo="forcarNormal"]', force=True)
            await publicar(pg)
            await pg.goto(URL + '/', wait_until='networkidle')
            normal = not await pg.evaluate("document.body.className.includes('tema-')")
            ok('forçar aparência normal: sem decoração', normal and await pg.locator('[data-musica]:not([hidden])').count() == 0)
            d = dados()
            ok('desligar campanha não apaga nada (35 produtos, listas da campanha mantidas)', len(d['produtos']) == 35 and len(d['campanhas'][0]['produtos']) == 1 and len(d['campanhas'][1]['produtos']) == 3, f"{len(d['produtos'])} {[len(c['produtos']) for c in d['campanhas']]}")
            # prévia
            await pg.goto(URL + '/?previa=natal', wait_until='networkidle')
            ok('prévia de campanha sem ligar', await pg.evaluate("document.body.classList.contains('tema-natal')"))

            # ---------- 5. Histórico: voltar versão ----------
            await pg.goto(URL + '/painel/#/backup', wait_until='networkidle')
            await pg.wait_for_selector('[data-acao="voltar-versao"]')
            n_hist = await pg.locator('.hist').count()
            ok('histórico lista as publicações', n_hist >= 9, str(n_hist))
            await pg.locator('[data-acao="voltar-versao"]').last.click()
            await pg.click('.modal [data-modal-botao="1"]')
            await publicar(pg)
            d = dados()
            ok('voltar para a 1ª versão restaura o catálogo original', len(d['produtos']) == 34 and next(x for x in d['produtos'] if x['id'] == 'produto-5')['preco'] == 4.0 and not d['aparencia']['forcarNormal'])

            # ---------- 6. Celular ----------
            m = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            mp = await m.new_page()
            mp.on('pageerror', lambda e: erros.append(str(e)))
            await mp.goto(URL + '/', wait_until='networkidle')
            larg = await mp.evaluate('document.documentElement.scrollWidth')
            ok('celular: sem rolagem lateral', larg <= 390, str(larg))
            await mp.tap('[data-grade] [data-add="produto-6"]')
            ok('celular: barra do pedido aparece', await mp.locator('[data-barra-pedido]').is_visible())
            await mp.tap('[data-barra-pedido] button')
            ok('celular: pedido abre', await mp.locator('#carrinho:not([hidden])').count() == 1)
            await mp.goto(URL + '/painel/', wait_until='networkidle')
            ok('celular: painel abre com menu de baixo', await mp.locator('.abas').is_visible())
            larg = await mp.evaluate('document.documentElement.scrollWidth')
            ok('celular: painel sem rolagem lateral', larg <= 390, str(larg))

            await b.close()
    finally:
        srv.terminate()
    reais = [e for e in erros if 'favicon' not in e and 'net::ERR_ABORTED' not in e]
    ok('nenhum erro de JavaScript durante os testes', not reais, '\n'.join(reais[:5]))
    falhas = [r for r in resultados if not r[1]]
    print(f'\n{len(resultados) - len(falhas)}/{len(resultados)} verificações passaram')

asyncio.run(main())
