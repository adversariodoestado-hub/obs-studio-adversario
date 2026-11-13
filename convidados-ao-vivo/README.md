# Convidados ao Vivo

Lives no OBS com convidados remotos, sem limite de pessoas na sala. O convidado entra por um link no navegador (celular ou computador, sem instalar nada), fica nos bastidores, e você escolhe com um clique quem aparece na tela. O OBS recebe o palco com layout automático, ou cada convidado em uma fonte separada.

## Como funciona

```
Convidados (navegador) ──► LiveKit na sua VPS (SFU) ──► OBS (fonte "Palco")
                                   ▲
              Painel do apresentador (escolhe quem vai para a tela)
```

- **LiveKit** (código aberto, gratuito) recebe o vídeo de cada convidado uma única vez e distribui. É isso que permite muitos convidados, ao contrário de conexões diretas (P2P), que travam a partir de uns 6 a 8.
- **Servidor de convites** (`servidor/app`): entrega as páginas, emite os acessos e guarda quem está no palco.
- **Caddy**: HTTPS automático com Let's Encrypt.

### Quantos convidados?

- **Na sala (bastidores):** sem limite configurado. Quem está nos bastidores não consome a banda do seu OBS, só a da VPS.
- **Na tela ao mesmo tempo:** depende da internet e do PC que roda o OBS. Cada convidado na tela usa de 1,5 a 2,5 Mbps de download. Referência: 10 na tela ≈ 20 Mbps, 20 na tela ≈ 40 Mbps. Quanto mais convidados, menor cada quadro, e o LiveKit envia automaticamente uma versão menor do vídeo (simulcast).
- **VPS:** cada convidado envia ~2 Mbps e o servidor repassa para quem assiste. Uma VPS de 2 vCPU e 4 GB aguenta folgado algumas dezenas de convidados.

## Instalação na VPS

Requisitos: VPS Ubuntu ou Debian com IP público e um domínio (ou subdomínio) seu.

1. No painel do seu domínio, crie um registro **A** (ex.: `live.seusite.com.br`) apontando para o IP da VPS.
2. Se o provedor tiver firewall no painel (Hostinger, por exemplo), libere:
   - TCP: 80, 443, 7881
   - UDP: 3478, 30000–40000, 50000–60000
3. Na VPS, como root:
   ```bash
   git clone -b claude/project-thread-gcdljt https://github.com/adversariodoestado-hub/obs-studio-adversario.git
   cd obs-studio-adversario/convidados-ao-vivo/servidor
   bash instalar.sh
   ```
   O script instala o Docker se faltar, pergunta o domínio e a senha do apresentador, gera as chaves e sobe tudo.

Para atualizar depois: `git pull && docker compose up -d --build` na mesma pasta.

## Usando na live

1. **Painel:** abra `https://SEU-DOMINIO/painel` no Chrome e entre com a senha. Pode ser numa aba normal ou como dock dentro do OBS (Docks → Docks de navegador personalizados). Para falar com os convidados pelo botão 🎙️, prefira a aba do Chrome, porque o dock do OBS pode não ter acesso ao microfone.
2. **Convite:** copie o link de convite no painel e mande para os convidados.
3. **OBS:** em Fontes → + → Navegador, cole a URL do **Palco** que aparece no painel. Use largura 1920, altura 1080 e marque **“Controlar áudio pelo OBS”**.
4. Quando um convidado entrar, ele aparece em **Bastidores**. Clique em **Pôr na tela** e ele entra no palco. As setas ◀ ▶ mudam a ordem, e o 🎧 deixa você ouvir alguém nos bastidores antes de colocá-lo no ar.

### Layout manual (uma fonte por convidado)

Se preferir montar a cena você mesmo, use as URLs de **Vaga 1, 2, 3…** do painel, cada uma numa fonte de navegador. A vaga N mostra o N-ésimo convidado que está na tela. Elas já vêm com `audio=0`, então mantenha também a fonte Palco (pode deixá-la invisível ou atrás) para o áudio, ou tire o `audio=0` das vagas e não use o Palco.

### Opções da URL do Palco

| Parâmetro | Efeito |
|---|---|
| `chave=...` | Senha do apresentador (obrigatório) |
| `vaga=N` | Mostra só o N-ésimo convidado, em tela cheia |
| `audio=0` | Não toca o áudio |
| `fundo=RRGGBB` | Cor de fundo (padrão: transparente) |
| `espaco=1` | Espaço entre os quadros, em % da tela |
| `raio=12` | Arredondamento dos cantos, em px |

## Testar no seu computador

Com Docker instalado:

```bash
cd servidor
docker run -d --name livekit --network host livekit/livekit-server:v1.13.11 --dev
cd app && npm install
LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret SENHA_APRESENTADOR=teste \
LIVEKIT_URL_PUBLICA=ws://127.0.0.1:7880 npm start
```

Abra `http://127.0.0.1:3000/painel` (senha `teste`) e `http://127.0.0.1:3000/` em outra janela como convidado.

## Próximos passos

- Plugin nativo do OBS que adiciona o painel e o palco sozinho, sem colar URLs.
- Compartilhamento de tela do convidado.
- Chat e “levantar a mão” nos bastidores.
