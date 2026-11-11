#!/usr/bin/env bash
# ==============================================================================
# Script de Deploy Seguro - Flow PRO
# Servidor: Ubuntu 24.04 (Docker + Nginx)
# Objetivo: Deploy isolado sem risco de conflito com aplicações existentes
# ==============================================================================

set -e

# Preserva diretório de instalação existente (/opt/devsquad, /opt/synchro ou /opt/flow)
if [ -d "/opt/devsquad" ]; then
  APP_DIR="/opt/devsquad"
elif [ -d "/opt/synchro" ]; then
  APP_DIR="/opt/synchro"
else
  APP_DIR="/opt/flow"
fi
REPO_URL="https://github.com/lleandrovalois/devsquad.git"
DEFAULT_PORT=3001

echo "========================================================"
echo "🚀 Iniciando Deploy Seguro - Flow PRO"
echo "========================================================"

# 1. Verificar permissões de root/sudo
if [ "$EUID" -ne 0 ]; then
  echo "❌ Por favor, execute este script como root ou com sudo:"
  echo "   sudo bash deploy-vps.sh"
  exit 1
fi

# 2. Obter domínio / subdomínio
# Prioridade: 1º argumento ($1) -> variável $DOMAIN -> leitura interativa do terminal
DOMAIN_NAME="${1:-$DOMAIN}"

if [ -z "$DOMAIN_NAME" ]; then
  if [ -t 0 ]; then
    read -p "👉 Informe o domínio ou subdomínio para o Flow (ex: flow.meudominio.com): " DOMAIN_NAME
  elif [ -e /dev/tty ]; then
    read -p "👉 Informe o domínio ou subdomínio para o Flow (ex: flow.meudominio.com): " DOMAIN_NAME < /dev/tty
  fi
fi

if [ -z "$DOMAIN_NAME" ]; then
  echo "❌ Domínio não informado."
  echo "👉 Dica: Você pode passar o domínio diretamente no comando, por exemplo:"
  echo "   curl -fsSL https://raw.githubusercontent.com/lleandrovalois/devsquad/main/deploy-vps.sh | sudo bash -s -- flow.meudominio.com"
  echo "   ou clonar e rodar: sudo bash deploy-vps.sh flow.meudominio.com"
  exit 1
fi

echo "🌐 Domínio configurado: $DOMAIN_NAME"

# 3. Verificação e resolução de conflito de porta
APP_PORT="${2:-$DEFAULT_PORT}"
echo "🔍 Verificando disponibilidade da porta $APP_PORT no servidor..."

if ss -tulpn | grep -q ":$APP_PORT "; then
  echo "⚠️ ATENÇÃO: A porta $APP_PORT já está sendo usada por outra aplicação no servidor!"
  
  # Buscar automaticamente a próxima porta livre a partir de 3005
  CANDIDATE_PORT=3005
  while ss -tulpn | grep -q ":$CANDIDATE_PORT "; do
    CANDIDATE_PORT=$((CANDIDATE_PORT + 1))
  done

  if [ -t 0 ]; then
    read -p "👉 Digite uma porta alternativa [Pressione Enter para usar $CANDIDATE_PORT]: " INPUT_PORT
    APP_PORT="${INPUT_PORT:-$CANDIDATE_PORT}"
  elif [ -e /dev/tty ]; then
    read -p "👉 Digite uma porta alternativa [Pressione Enter para usar $CANDIDATE_PORT]: " INPUT_PORT < /dev/tty
    APP_PORT="${INPUT_PORT:-$CANDIDATE_PORT}"
  else
    echo "⚡ Selecionando automaticamente porta livre: $CANDIDATE_PORT"
    APP_PORT=$CANDIDATE_PORT
  fi

  if ss -tulpn | grep -q ":$APP_PORT "; then
    echo "❌ A porta $APP_PORT também já está em uso! Abortando por segurança para não afetar outros serviços."
    exit 1
  fi
fi

echo "✅ Porta selecionada para escuta local segura: $APP_PORT (127.0.0.1:$APP_PORT)"

# 4. Criar ou atualizar o diretório do projeto
if [ ! -d "$APP_DIR" ]; then
  echo "📦 Clonando repositório em $APP_DIR..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
else
  echo "🔄 Diretório $APP_DIR já existe. Atualizando código (git pull)..."
  cd "$APP_DIR"
  git fetch origin main
  git reset --hard origin/main
fi

# 5. Ajustar porta no docker-compose.yml se diferente do padrão
if [ "$APP_PORT" != "$DEFAULT_PORT" ]; then
  echo "🔧 Ajustando porta local no docker-compose.yml para $APP_PORT..."
  sed -i "s/127.0.0.1:3001:3001/127.0.0.1:$APP_PORT:3001/g" docker-compose.yml
fi

# 6. Preservação e migração automática de dados de volumes legados (synchro.db / devsquad.db -> flow.db)
echo "🛡️ Verificando integridade e persistência de dados legados..."
PROJECT_SLUG=$(basename "$APP_DIR" | tr '[:upper:]' '[:lower:]')
FLOW_VOL="${PROJECT_SLUG}_flow_data"
LEGACY_VOL=$(docker volume ls -q | grep -E 'synchro.*data|devsquad.*data|synchro|devsquad' | grep -v "^${FLOW_VOL}$" | head -n 1 || true)
if [ -n "$LEGACY_VOL" ]; then
  LEGACY_DB_PATH="/var/lib/docker/volumes/$LEGACY_VOL/_data/synchro.db"
  [ ! -f "$LEGACY_DB_PATH" ] && LEGACY_DB_PATH="/var/lib/docker/volumes/$LEGACY_VOL/_data/devsquad.db"
  if [ -f "$LEGACY_DB_PATH" ]; then
    echo "📦 Base de dados legada detectada em $LEGACY_VOL ($LEGACY_DB_PATH)..."
    docker volume create "$FLOW_VOL" >/dev/null 2>&1 || true
    TARGET_DIR="/var/lib/docker/volumes/$FLOW_VOL/_data"
    mkdir -p "$TARGET_DIR"

    LEGACY_SZ=$(stat -c%s "$LEGACY_DB_PATH" 2>/dev/null || echo 0)
    TARGET_SZ=$(stat -c%s "$TARGET_DIR/flow.db" 2>/dev/null || echo 0)
    if [ ! -f "$TARGET_DIR/flow.db" ] || [ "$LEGACY_SZ" -gt "$TARGET_SZ" ]; then
      echo "🔄 Migrando base legada para o novo volume do Flow ($FLOW_VOL)..."
      cp -p "$LEGACY_DB_PATH" "$TARGET_DIR/flow.db"
      [ -f "${LEGACY_DB_PATH}-wal" ] && cp -p "${LEGACY_DB_PATH}-wal" "$TARGET_DIR/flow.db-wal" || true
      [ -f "${LEGACY_DB_PATH}-shm" ] && cp -p "${LEGACY_DB_PATH}-shm" "$TARGET_DIR/flow.db-shm" || true
      chmod 666 "$TARGET_DIR"/* 2>/dev/null || true
      echo "✅ Base de dados migrada com sucesso para o Flow PRO!"
    fi
  fi
fi

# 7. Build e execução via Docker Compose
echo "🐳 Construindo e iniciando o container isolado (flow-app)..."
docker compose up -d --no-deps --build flow

# 7. Criar arquivo de configuração isolado no Nginx
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN_NAME}"
echo "🌐 Configurando VirtualHost do Nginx em $NGINX_CONF..."

cat <<EOF > "$NGINX_CONF"
# Configuração Flow PRO - Isolada para evitar conflitos
server {
    listen 80;
    server_name $DOMAIN_NAME;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# 8. Habilitar o site no Nginx (link simbólico)
NGINX_ENABLED="/etc/nginx/sites-enabled/$(basename "$NGINX_CONF")"
if [ ! -f "$NGINX_ENABLED" ]; then
  ln -s "$NGINX_CONF" "$NGINX_ENABLED"
fi

# 9. Testar sintaxe do Nginx com segurança total
echo "🧪 Testando sintaxe do Nginx para garantir que nenhum outro site será afetado..."
if nginx -t; then
  echo "✅ Sintaxe do Nginx 100% OK! Aplicando recarga suave (zero downtime para outros apps)..."
  systemctl reload nginx
else
  echo "❌ Erro na sintaxe do Nginx! Revertendo ativação do Flow para proteger os outros sites..."
  rm -f "$NGINX_ENABLED"
  nginx -t && systemctl reload nginx
  echo "❌ Configuração cancelada. Seus outros sites continuam operando normalmente."
  exit 1
fi

echo ""
echo "========================================================"
echo "🎉 DEPLOY CONCLUÍDO COM SUCESSO E TOTAL ISOLAMENTO!"
echo "========================================================"
echo "Aplicação respondendo em: http://$DOMAIN_NAME"
echo "Container: flow-app (127.0.0.1:$APP_PORT)"
echo "Volume persistente: $FLOW_VOL"
echo ""
echo "💡 Para habilitar HTTPS gratuito com Let's Encrypt (Certbot), execute:"
echo "   sudo certbot --nginx -d $DOMAIN_NAME"
echo "========================================================"
