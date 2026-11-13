#!/usr/bin/env bash
# Instala o Convidados ao Vivo numa VPS Ubuntu/Debian.
# Uso (como root, dentro desta pasta):  bash instalar.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ "$(id -u)" -ne 0 ]; then echo "Rode como root (sudo bash instalar.sh)."; exit 1; fi

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Instalando Docker…"
  curl -fsSL https://get.docker.com | sh
fi

if [ ! -f .env ]; then
  read -rp "Domínio para a live (ex.: live.seusite.com.br): " DOMINIO
  read -rsp "Senha do apresentador (painel e OBS): " SENHA; echo
  read -rp "Código de convite (Enter para não usar): " CODIGO
  cat > .env <<ENV
DOMINIO=${DOMINIO}
LIVEKIT_API_KEY=API$(openssl rand -hex 6)
LIVEKIT_API_SECRET=$(openssl rand -hex 32)
SENHA_APRESENTADOR=${SENHA}
CODIGO_CONVITE=${CODIGO}
SALA=live
ENV
  chmod 600 .env
  echo "==> Configuração salva em .env"
fi

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  echo "==> Liberando portas no firewall (ufw)…"
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 7881/tcp
  ufw allow 3478/udp
  ufw allow 50000:60000/udp
  ufw allow 30000:40000/udp
fi

echo "==> Subindo os serviços…"
docker compose up -d --build

# shellcheck disable=SC1091
source .env
cat <<FIM

Pronto! Se o DNS de ${DOMINIO} já aponta para este servidor, abra:
  Painel do apresentador:  https://${DOMINIO}/painel
  Link para os convidados: https://${DOMINIO}/
  Fonte do OBS (palco):    https://${DOMINIO}/palco?chave=<sua senha>

O certificado HTTPS é emitido sozinho no primeiro acesso (pode levar 1 minuto).
FIM
