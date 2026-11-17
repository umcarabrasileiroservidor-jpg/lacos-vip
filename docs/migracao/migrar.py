"""Migra o catálogo antigo (catalog.json + fotos) para o formato novo do Laços VIP.

Uso: python3 -I migrar.py <pasta_extraida_do_zip> <pasta_do_repositorio>
"""
import json, re, sys, shutil, hashlib, unicodedata
from pathlib import Path
from PIL import Image, ImageOps

SRC = Path(sys.argv[1])
REPO = Path(sys.argv[2])
TAMANHOS = (400, 800, 1600)

CORRECOES_NOME = {
    "Laço luco": "Laço Luxo",
    "Laço Ecanto estrelado": "Laço Encanto Estrelado",
    "Faixa RN prespontada (M)": "Faixa RN pespontada (M)",
}

CATEGORIAS = ["Laços", "Kits", "Tiaras", "Parzinhos", "Faixinhas", "Piranhas", "Tic-tacs", "Outros"]


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def parse_preco(txt):
    """'3 KITS por 20' -> (20.0, '3 kits'); '6,00 KIT com 3' -> (6.0, 'kit com 3')."""
    t = txt.strip()
    m = re.match(r"^(.*?)\s*por\s+(\d+(?:[.,]\d{1,2})?)\s*$", t, re.I)
    if m:
        return float(m.group(2).replace(",", ".")), m.group(1).strip().lower()
    m = re.match(r"^(\d+(?:[.,]\d{1,2})?)\s*(.*)$", t)
    if not m:
        raise ValueError(f"preço não reconhecido: {txt!r}")
    unidade = m.group(2).strip().lower()
    unidade = re.sub(r"^o\s+", "", unidade)  # "O KIT" -> "kit"
    return float(m.group(1).replace(",", ".")), unidade or "unidade"


def processar_foto(caminho_rel, foto_id):
    src = SRC / caminho_rel.lstrip("/")
    ext = src.suffix.lower().lstrip(".").replace("jpeg", "jpg")
    destino_orig = REPO / "originais" / f"{foto_id}.{ext}"
    shutil.copy2(src, destino_orig)
    im = ImageOps.exif_transpose(Image.open(src))
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA" if "A" in im.mode else "RGB")
    if im.mode == "RGBA":
        fundo = Image.new("RGB", im.size, (255, 255, 255))
        fundo.paste(im, mask=im.split()[3])
        im = fundo
    w, h = im.size
    for t in TAMANHOS:
        v = im.copy()
        if max(w, h) > t:
            v.thumbnail((t, t), Image.LANCZOS)
        v.save(REPO / "fotos" / f"{foto_id}-{t}.webp", "WEBP", quality=82 if t == 1600 else 80, method=6)
        if t == 800:  # versão JPG para pré-visualização de links (WhatsApp, Facebook)
            v.save(REPO / "fotos" / f"{foto_id}-og.jpg", "JPEG", quality=80, optimize=True, progressive=True)
    return {"id": foto_id, "w": w, "h": h, "ext": "webp", "original": f"{foto_id}.{ext}"}


def main():
    antigo = json.loads((SRC / "catalog.json").read_text(encoding="utf-8"))
    (REPO / "fotos").mkdir(exist_ok=True)
    (REPO / "originais").mkdir(exist_ok=True)

    produtos, relatorio = [], []
    slugs_usados = set()
    for i, p in enumerate(antigo["produtos"], start=1):
        ref = f"{i:03d}"
        nome = CORRECOES_NOME.get(p["nome"], p["nome"])
        preco, unidade = parse_preco(p["preco"])
        base = slug(nome)
        s = base if base not in slugs_usados else f"{base}-{ref}"
        slugs_usados.add(s)
        fotos = []
        for j, f in enumerate(p["fotos"], start=1):
            h = hashlib.sha1(f.encode()).hexdigest()[:6]
            fotos.append(processar_foto(f, f"p{ref}-{j}-{h}"))
        cat = p.get("categoria") or "Outros"
        produtos.append({
            "id": p["id"],
            "ref": ref,
            "nome": nome,
            "slug": s,
            "descricao": "",
            "preco": preco,
            "unidade": unidade,
            "categoria": slug(cat),
            "fotos": fotos,
            "visivel": p.get("ativo", True) is not False,
            "destaque": bool(p.get("destaque")),
            "novidade": bool(p.get("novidade")),
            "esgotado": bool(p.get("esgotado")),
            "somenteCampanha": False,
            "criadoEm": "2026-11-17T00:00:00.000Z",
        })
        relatorio.append((ref, p["nome"], nome, p["preco"], preco, unidade, cat, len(p["fotos"]), len(fotos)))

    destaques = [p["id"] for p in produtos if p["destaque"]]
    novidades = [p["id"] for p in produtos if p["novidade"]]
    tiara = [p["id"] for p in antigo["produtos"] if p.get("tiaraMaluca")]

    catalogo = {
        "versao": 1,
        "atualizadoEm": antigo.get("updatedAt"),
        "loja": {
            "nome": "Laços VIP",
            "slogan": "Pequenos detalhes. Grandes encantos.",
            "descricao": "Acessórios femininos no atacado: laços, tiaras, kits, parzinhos, faixinhas e muito mais. Pedido fácil pelo WhatsApp.",
            "faixaTopo": "Acessórios femininos",
            "whatsapp": "558195723033",
            "instagram": "lacosvip._",
            "pedidoMinimo": 150,
            "bloquearAbaixoDoMinimo": False,
            "atendimento": "",
            "endereco": "",
            "mensagemPedido": "Olá! Gostaria de fazer este pedido pelo catálogo Laços VIP:",
            "rodapeTexto": "Acessórios que fazem parte dos seus melhores momentos.",
            "urlSite": "",
        },
        "categorias": [{"id": slug(c), "nome": c, "visivel": True} for c in CATEGORIAS],
        "produtos": produtos,
        "lixeira": [],
        "inicio": {
            "hero": {
                "ativo": True,
                "selo": "Atacado especial",
                "titulo": "Pequenos detalhes. Grandes encantos.",
                "texto": "Laços, tiaras e acessórios para revender com carinho. Monte seu pedido e envie pelo WhatsApp.",
                "botao": "Ver produtos",
                "imagens": [],
            },
            "banners": [],
            "secoes": [
                {"tipo": "campanha", "ativo": True},
                {"tipo": "banners", "ativo": True},
                {"tipo": "novidades", "ativo": True, "titulo": "Novidades", "subtitulo": "Acabou de chegar", "limite": 12, "produtos": novidades},
                {"tipo": "destaques", "ativo": True, "titulo": "Nossos destaques", "subtitulo": "Em evidência", "limite": 12, "produtos": destaques},
                {"tipo": "categorias", "ativo": True, "titulo": "Compre por categoria", "subtitulo": "Encontre rápido"},
                {"tipo": "todos", "ativo": True, "titulo": "Todos os produtos", "subtitulo": "Escolha seus favoritos"},
                {"tipo": "comoComprar", "ativo": True, "titulo": "Como comprar", "subtitulo": "Simples e rápido"},
            ],
        },
        "aparencia": {"forcarNormal": False},
        "campanhas": [
            {
                "id": "natal", "nome": "Natal", "tema": "natal", "estado": "desligada", "inicio": "2026-12-01", "fim": "2026-12-25",
                "titulo": "Especial de Natal",
                "subtitulo": "Encantos para a noite mais especial do ano",
                "faixaTopo": "🎄 Especial de Natal • Atacado com pedido mínimo de R$ 150",
                "banner": {"titulo": "Natal Laços VIP", "texto": "Laços, tiaras e kits natalinos para encantar suas clientes.", "botao": "Ver coleção de Natal", "imagem": None},
                "produtos": [],
                "musica": {"ativa": True, "fonte": "sintetizada", "arquivo": None, "volume": 0.4},
                "efeitos": {"particulas": True, "luzes": True},
            },
            {
                "id": "reveillon", "nome": "Réveillon", "tema": "reveillon", "estado": "desligada", "inicio": "2026-12-26", "fim": "2027-01-01",
                "titulo": "Coleção Réveillon",
                "subtitulo": "Brilho e elegância para a virada",
                "faixaTopo": "✨ Coleção Réveillon • Brilhe na virada",
                "banner": {"titulo": "Brilhe na virada", "texto": "Acessórios em branco e dourado para começar o ano com estilo.", "botao": "Ver coleção Réveillon", "imagem": None},
                "produtos": [],
                "musica": {"ativa": True, "fonte": "sintetizada", "arquivo": None, "volume": 0.4},
                "efeitos": {"particulas": True, "luzes": True},
            },
            {
                "id": "tiara-maluca", "nome": "Tiara Maluca", "tema": "padrao", "estado": "desligada", "inicio": "", "fim": "",
                "titulo": "Tiara Maluca", "subtitulo": "", "faixaTopo": "",
                "banner": {"titulo": "Tiara Maluca", "texto": "", "botao": "Ver tiaras", "imagem": None},
                "produtos": tiara,
                "musica": {"ativa": False, "fonte": "sintetizada", "arquivo": None, "volume": 0.4},
                "efeitos": {"particulas": False, "luzes": False},
            },
        ],
    }
    (REPO / "data").mkdir(exist_ok=True)
    (REPO / "data" / "catalogo.json").write_text(json.dumps(catalogo, ensure_ascii=False, indent=2), encoding="utf-8")

    linhas = ["REF;nome_antigo;nome_novo;preco_antigo;preco_novo;unidade;categoria;fotos_antigas;fotos_novas"]
    for r in relatorio:
        linhas.append(";".join(str(x) for x in r))
    (Path(__file__).parent / "relatorio-migracao.csv").write_text("\n".join(linhas), encoding="utf-8")
    print(f"{len(produtos)} produtos, {sum(len(p['fotos']) for p in produtos)} fotos migradas")


if __name__ == "__main__":
    main()
