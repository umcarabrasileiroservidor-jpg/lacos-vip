# Laços VIP: site e painel

Catálogo virtual da Laços VIP, com painel administrativo próprio, campanhas de Natal e Réveillon e pedido pelo WhatsApp.
O código, as fotos e os dados ficam **no seu GitHub**. O custo mensal é **R$ 0**.

---

## 1. Como tudo funciona (resumo)

| Parte | Onde fica | Custo |
|---|---|---|
| Site (o que o cliente vê) | GitHub Pages | Grátis |
| Painel (onde você edita) | `seu-site/painel/` | Grátis |
| Produtos, preços e campanhas | arquivo `data/catalogo.json` no seu repositório | Grátis |
| Fotos (originais e versões leves) | pastas `originais/` e `fotos/` no seu repositório | Grátis |
| Histórico e backup | cada publicação vira uma versão no GitHub | Grátis |
| Domínio próprio (opcional) | registro.br (cerca de R$ 40/ano para .com.br) | Opcional |

Quando você aperta **Publicar no site** no painel, o GitHub recebe as mudanças e, em cerca de 1 minuto, o site é atualizado sozinho.

---

## 2. Colocar o site no ar (uma única vez, cerca de 15 minutos)

### 2.1 Criar a conta e o repositório
1. Crie uma conta grátis em **github.com**. Dica: se o nome de usuário for `lacosvip`, o site fica em **https://lacosvip.github.io**.
2. Clique em **New repository** (o botão verde “New”).
   - **Repository name:** `lacosvip.github.io` (troque `lacosvip` pelo seu usuário). Com esse nome, o endereço fica sem nada no final.
   - Marque **Public**. O GitHub Pages grátis exige repositório público. Só ficam visíveis o código e as fotos, que já são públicos no site. A chave do painel **não** fica no repositório.
   - Não marque nenhuma outra opção e clique em **Create repository**.

### 2.2 Enviar os arquivos
**Jeito mais fácil:** conecte o GitHub ao Claude (claude.ai › Configurações › Conectores › GitHub) e peça: *“envie o projeto Laços VIP para o meu repositório”*.

**Jeito manual (GitHub Desktop):**
1. Instale o **GitHub Desktop** (desktop.github.com) e entre com a sua conta.
2. *File › Clone repository* e escolha o repositório que você criou.
3. Copie **todo o conteúdo** desta pasta (inclusive a pasta oculta `.github`) para a pasta do repositório.
4. No GitHub Desktop, escreva “Site novo” em *Summary* e clique em **Commit to main** e depois em **Push origin**.

### 2.3 Ligar o GitHub Pages
1. No repositório, vá em **Settings › Pages**.
2. Em **Source**, escolha **GitHub Actions**.
3. Abra a aba **Actions**. Quando “Publicar site” ficar verde ✓, o site está no ar.

### 2.4 Criar a chave do painel
O painel precisa de uma chave para salvar no seu repositório. Ela é criada uma única vez:
1. GitHub › sua foto › **Settings › Developer settings › Personal access tokens › Fine-grained tokens › Generate new token**.
2. **Token name:** `Painel Laços VIP`. **Expiration:** a maior opção disponível (ou *No expiration*).
3. **Repository access:** *Only select repositories* e escolha o repositório do site.
4. **Permissions › Repository permissions › Contents:** **Read and write**.
5. Clique em **Generate token** e copie a chave (começa com `github_pat_`).
6. Abra `https://SEU-SITE/painel/`, preencha usuário, repositório e chave, e clique em **Conectar**.
7. No painel, vá em **Configurações › Acesso ao painel › Copiar link de acesso** e guarde esse link nos favoritos do celular. Ele entra direto, sem senha.

> 🔒 **O link de acesso é a chave da sua loja.** Não mande para ninguém. Se ele vazar, apague a chave no GitHub (no mesmo lugar onde ela foi criada) e crie outra. O link antigo deixa de funcionar na hora.

---

## 3. Usando o painel

Tudo o que você muda fica como **rascunho** até apertar **Publicar no site** na barra escura de baixo. Se fechar o painel sem publicar, ele pergunta se você quer continuar de onde parou na próxima vez.

### Produtos
- **＋ Novo produto:** preencha nome, preço, “vendido por” (unidade, par, kit com 3…), categoria e fotos.
- **Fotos:** envie quantas quiser. A primeira é a **capa**. Use ← → para mudar a ordem, **Capa** para trocar a capa, ou arraste no computador. O original fica guardado e o site usa versões leves automaticamente.
- A etiqueta **“baixa resolução”** marca fotos pequenas que valem a pena trocar por uma maior.
- Botões rápidos na lista: **Visível · Destaque · Novidade · Esgotado**.
- **Esgotado:** o produto continua aparecendo, no fim da lista, mas não pode ser pedido.
- **Excluir:** o produto vai para a **lixeira** (Backup › Lixeira), de onde pode ser restaurado.
- A ordem da lista é a ordem do site. Use ↑ ↓ ou arraste.

### Página inicial
Aqui você edita o texto de apresentação, as fotos do topo, os **banners** (imagens de divulgação com link), e liga, desliga ou reordena as seções: Novidades, Destaques, Categorias, Todos os produtos e Como comprar.

### Campanhas e aparência (Natal, Réveillon e outras)
Cada campanha tem três estados:
- **Desligada:** o site fica normal.
- **Ligada agora:** fica no ar até você desligar.
- **Programada:** liga e desliga **sozinha** nas datas escolhidas.

Em cada campanha você escolhe os **produtos** (que aparecem numa área especial no topo da página), os textos, a imagem do banner, a **música** e os **efeitos** (neve ou brilhos).

- **“Só aparece durante a campanha”:** marque isso nos produtos de Natal. Eles somem sozinhos quando o Natal acaba e voltam no ano seguinte, sem você apagar nada.
- **Forçar aparência normal:** desliga todas as decorações de uma vez.
- **Ver prévia no site:** mostra como a campanha fica, sem ligá-la para os clientes.
- **Música:** nunca toca sozinha. O cliente aperta o botão e controla o volume. A do Natal é *Jingle Bells* (melodia de 1857, de domínio público) numa versão sintetizada pelo próprio site. A do Réveillon é uma trilha original. Você também pode enviar o seu MP3, desde que tenha licença para usá-lo.

**Fluxo sugerido para o fim de ano:**
1. Cadastre os produtos natalinos (marque a campanha **Natal** e **“Só aparece durante a campanha”**).
2. Em Campanhas › Natal, escolha **Programada**, de 01/12 a 25/12.
3. Em Campanhas › Réveillon, escolha **Programada**, de 26/12 a 01/01.
4. Publique. O site muda sozinho nas datas.

### Configurações
Nome, slogan, WhatsApp, Instagram, horário, endereço, **pedido mínimo** (e se ele bloqueia o envio ou apenas avisa) e a mensagem do pedido.

### Backup e recuperação
- **Lixeira:** restaura produtos excluídos.
- **Histórico de versões:** volta o catálogo inteiro para qualquer publicação anterior, inclusive as fotos.
- **Baixar dados do catálogo:** gera um arquivo `.json` com tudo (produtos, preços, campanhas).
- **Baixar tudo com fotos (.zip):** cópia completa do repositório.
- **Restaurar de um arquivo:** carrega um backup `.json`.

Sugestão: uma vez por mês, baixe o **.zip completo** e guarde no Google Drive ou num pen drive.

---

## 4. Domínio próprio (quando quiser)
1. Registre o domínio no **registro.br** (ex.: `lacosvip.com.br`).
2. No GitHub: **Settings › Pages › Custom domain** e digite o domínio.
3. No registro.br, em **DNS**, crie:
   - quatro registros **A** para `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`;
   - um registro **CNAME** para `www` apontando para `SEU-USUARIO.github.io`.
4. Volte em Settings › Pages e marque **Enforce HTTPS** quando a opção liberar (pode levar algumas horas).
5. No painel, em **Configurações › Endereço do site**, coloque `https://lacosvip.com.br`.

---

## 5. Para quem for mexer no código

```
data/catalogo.json        todos os dados (produtos, categorias, campanhas, configurações)
fotos/                    versões leves das fotos (400, 800, 1600 px em WebP + JPG para links)
originais/                fotos originais, intactas
audio/                    áudios enviados pelo painel
site/                     código do site e do painel (HTML, CSS, JavaScript, sem frameworks)
  js/nucleo.js            regras: campanhas, visibilidade, preços, mensagem do WhatsApp
  js/paginas.js           montagem das seções (usado no navegador e na geração)
  js/loja.js              pedido, busca, filtros, galeria, zoom
  js/musica.js            músicas sintetizadas das campanhas
  painel/                 painel administrativo
scripts/build.mjs         gera o site em dist/ (Node.js 18 ou mais novo, sem instalar nada)
scripts/dev-server.mjs    testa site + painel no computador: node scripts/dev-server.mjs
.github/workflows/        publicação automática no GitHub Pages
```

**Testar no computador:** instale o Node.js (nodejs.org), abra o terminal nesta pasta e rode `node scripts/dev-server.mjs`. Depois abra http://localhost:8787 (site) e http://localhost:8787/painel/ (painel). No computador, o painel salva direto nesta pasta e não precisa de chave.

Não há dependências externas, banco de dados pago, nem plataforma de IA. É HTML, CSS e JavaScript puros, que qualquer desenvolvedor consegue manter.
