#!/usr/bin/env bash
# ==============================================================================
# Script de Deploy Seguro - DevSquad PRO
# Servidor: Ubuntu 24.04 (Docker + Nginx)
# Objetivo: Deploy isolado sem risco de conflito com aplicações existentes
# ==============================================================================

set -e

APP_DIR="/opt/devsquad"
REPO_URL="https://github.com/lleandrovalois/devsquad.git"
DEFAULT_PORT=3001

echo "========================================================"
echo "🚀 Iniciando Deploy Seguro - DevSquad PRO"
echo "========================================================"

# 1. Verificar permissões de root/sudo
if [ "$EUID" -ne 0 ]; then
  echo "❌ Por favor, execute este script como root ou com sudo:"
  echo "   sudo bash deploy-vps.sh"
  exit 1
fi

# 2. Perguntar o domínio / subdomínio
read -p "👉 Informe o domínio ou subdomínio para o DevSquad (ex: devsquad.meudominio.com): " DOMAIN_NAME
if [ -z "$DOMAIN_NAME" ]; then
  echo "❌ Domínio não pode ser vazio. Abortando."
  exit 1
fi

# 3. Verificação de conflito de porta
APP_PORT=$DEFAULT_PORT
echo "🔍 Verificando se a porta $APP_PORT já está em uso no servidor..."

if ss -tulpn | grep -q ":$APP_PORT "; then
  echo "⚠️ ATENÇÃO: A porta $APP_PORT já está sendo usada por outra aplicação no servidor!"
  echo "Para evitar conflitos, escolha outra porta interna (ex: 3005, 3010, 3100)."
  read -p "👉 Digite a porta alternativa para o DevSquad: " APP_PORT
  if [ -z "$APP_PORT" ]; then
    echo "❌ Nenhuma porta informada. Abortando para garantir a integridade dos outros sistemas."
    exit 1
  fi
  # Validação da nova porta
  if ss -tulpn | grep -q ":$APP_PORT "; then
    echo "❌ A porta $APP_PORT também já está em uso! Abortando por segurança."
    exit 1
  fi
fi

echo "✅ Porta selecionada para escuta local: $APP_PORT (127.0.0.1:$APP_PORT)"

# 4. Criar ou atualizar o diretório do projeto
if [ ! -d "$APP_DIR" ]; then
  echo "📦 Clonando repositório em $APP_DIR..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
else
  echo "🔄 Repositório já existe em $APP_DIR. Atualizando código (git pull)..."
  cd "$APP_DIR"
  git pull origin main
fi

# 5. Ajustar porta no docker-compose.yml se diferente do padrão
if [ "$APP_PORT" != "$DEFAULT_PORT" ]; then
  echo "🔧 Ajustando porta local no docker-compose.yml para $APP_PORT..."
  sed -i "s/127.0.0.1:3001:3001/127.0.0.1:$APP_PORT:3001/g" docker-compose.yml
fi

# 6. Build e execução via Docker Compose
echo "🐳 Construindo e iniciando o container isolado..."
docker compose down || true
docker compose up -d --build

# 7. Criar arquivo de configuração isolado no Nginx
NGINX_CONF="/etc/nginx/sites-available/devsquad.conf"
echo "🌐 Configurando VirtualHost do Nginx em $NGINX_CONF..."

cat <<EOF > "$NGINX_CONF"
# Configuração DevSquad PRO - Isolada para evitar conflitos
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
if [ ! -f "/etc/nginx/sites-enabled/devsquad.conf" ]; then
  ln -s "$NGINX_CONF" /etc/nginx/sites-enabled/devsquad.conf
fi

# 9. Testar sintaxe do Nginx com segurança total
echo "🧪 Testando sintaxe do Nginx para garantir que nenhum outro site será afetado..."
if nginx -t; then
  echo "✅ Sintaxe do Nginx 100% OK! Aplicando recarga suave (zero downtime para outros apps)..."
  systemctl reload nginx
else
  echo "❌ Erro na sintaxe do Nginx! Revertendo ativação do DevSquad para proteger os outros sites..."
  rm -f /etc/nginx/sites-enabled/devsquad.conf
  nginx -t && systemctl reload nginx
  echo "❌ Configuração cancelada. Seus outros sites continuam operando normalmente."
  exit 1
fi

echo ""
echo "========================================================"
echo "🎉 DEPLOY CONCLUÍDO COM SUCESSO E TOTAL ISOLAMENTO!"
echo "========================================================"
echo "Aplicação rodando em: http://$DOMAIN_NAME"
echo "Container: devsquad-app (127.0.0.1:$APP_PORT)"
echo "Volume persistente: devsquad_data"
echo ""
echo "💡 Para habilitar HTTPS gratuito com Let's Encrypt (Certbot), execute:"
echo "   sudo certbot --nginx -d $DOMAIN_NAME"
echo "========================================================"
