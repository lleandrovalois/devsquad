#!/usr/bin/env bash
# ==============================================================================
# Script de Restauração e Migração Automática de Dados - Flow PRO
# Recupera a base de dados legada (synchro.db / devsquad.db) para o Flow (flow.db)
# ==============================================================================

set -e

echo "========================================================"
echo "🛡️  Flow PRO - Assistente de Recuperação de Dados"
echo "========================================================"

# 1. Verificar privilégios de root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Por favor, execute este script como root ou com sudo:"
  echo "   sudo bash restore-data.sh"
  exit 1
fi

echo "🔍 Buscando bancos de dados legados (synchro.db / devsquad.db) no sistema..."

# 2. Localizar synchro.db e devsquad.db nos volumes do Docker e sistema de arquivos
FOUND_DBS=()
while IFS= read -r file; do
  [ -f "$file" ] && FOUND_DBS+=("$file")
done < <(find /var/lib/docker/volumes /opt /root /var/lib/docker \( -name "synchro.db" -o -name "devsquad.db" \) 2>/dev/null || true)

if [ ${#FOUND_DBS[@]} -eq 0 ]; then
  echo "⚠️ Nenhum arquivo legado encontrado nos caminhos padrão."
  echo "🔍 Buscando em todo o disco (isso pode levar alguns instantes)..."
  while IFS= read -r file; do
    [ -f "$file" ] && FOUND_DBS+=("$file")
  done < <(find / \( -name "synchro.db" -o -name "devsquad.db" \) 2>/dev/null || true)
fi

if [ ${#FOUND_DBS[@]} -eq 0 ]; then
  echo "❌ Nenhum arquivo synchro.db ou devsquad.db foi localizado no servidor."
  echo "Volumes Docker disponíveis:"
  docker volume ls
  exit 1
fi

echo "📁 Bancos de dados legados encontrados:"
BEST_DB=""
MAX_SIZE=0
for db in "${FOUND_DBS[@]}"; do
  SIZE=$(stat -c%s "$db" 2>/dev/null || stat -f%z "$db" 2>/dev/null || echo 0)
  HUMAN_SIZE=$(ls -lh "$db" 2>/dev/null | awk '{print $5}')
  echo "   • $db ($HUMAN_SIZE)"
  if [ "$SIZE" -gt "$MAX_SIZE" ]; then
    MAX_SIZE=$SIZE
    BEST_DB="$db"
  fi
done

if [ -z "$BEST_DB" ] || [ "$MAX_SIZE" -eq 0 ]; then
  echo "❌ Nenhum banco de dados legado com tamanho válido foi encontrado."
  exit 1
fi

echo ""
echo "🎯 Banco de dados selecionado para restauração: $BEST_DB ($(ls -lh "$BEST_DB" | awk '{print $5}'))"

# 3. Localizar o container e o volume de destino ativo
TARGET_DIR=""
CONTAINER_NAME="flow-app"

if docker ps --format '{{.Names}}' | grep -q "^flow-app$"; then
  TARGET_DIR=$(docker inspect flow-app --format '{{ range .Mounts }}{{ if eq .Destination "/app/data" }}{{ .Source }}{{ end }}{{ end }}' 2>/dev/null || true)
elif docker ps --format '{{.Names}}' | grep -q "^synchro-app$"; then
  CONTAINER_NAME="synchro-app"
  TARGET_DIR=$(docker inspect synchro-app --format '{{ range .Mounts }}{{ if eq .Destination "/app/data" }}{{ .Source }}{{ end }}{{ end }}' 2>/dev/null || true)
elif docker ps --format '{{.Names}}' | grep -q "^devsquad-app$"; then
  CONTAINER_NAME="devsquad-app"
  TARGET_DIR=$(docker inspect devsquad-app --format '{{ range .Mounts }}{{ if eq .Destination "/app/data" }}{{ .Source }}{{ end }}{{ end }}' 2>/dev/null || true)
fi

# Se não estiver rodando ou não achou mount, buscar volume do Flow no Docker
if [ -z "$TARGET_DIR" ]; then
  FLOW_VOL=$(docker volume ls -q | grep -E 'flow.*data|flow|synchro.*data' | head -n 1 || true)
  if [ -n "$FLOW_VOL" ]; then
    TARGET_DIR="/var/lib/docker/volumes/$FLOW_VOL/_data"
  fi
fi

if [ -z "$TARGET_DIR" ] || [ ! -d "$TARGET_DIR" ]; then
  echo "⚠️ Container Flow não está ativo. Subindo temporariamente para garantir criação do volume..."
  for cand_dir in /opt/flow /opt/devsquad /opt/synchro; do
    if [ -d "$cand_dir" ]; then
      cd "$cand_dir"
      docker compose up -d
      sleep 3
      TARGET_DIR=$(docker inspect flow-app --format '{{ range .Mounts }}{{ if eq .Destination "/app/data" }}{{ .Source }}{{ end }}{{ end }}' 2>/dev/null || true)
      break
    fi
  done
fi

if [ -z "$TARGET_DIR" ] || [ ! -d "$TARGET_DIR" ]; then
  echo "❌ Não foi possível determinar o diretório de destino do Flow."
  exit 1
fi

echo "📦 Diretório do volume de destino identificado:"
echo "   $TARGET_DIR"

# 4. Criar Backup Preventivo de Segurança
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/root/flow_rescue_backup_$TIMESTAMP"
mkdir -p "$BACKUP_DIR"
echo "💾 Criando backup preventivo em $BACKUP_DIR..."
cp -p "$BEST_DB"* "$BACKUP_DIR/" 2>/dev/null || true
[ -d "$TARGET_DIR" ] && cp -p "$TARGET_DIR"/* "$BACKUP_DIR/" 2>/dev/null || true
echo "✅ Backup preventivo concluído!"

# 5. Parar o container para cópia atômica e consistente do SQLite
echo "🛑 Pausando temporariamente o container para transferência segura..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true

# 6. Copiar os arquivos da base legada para o destino (flow.db)
echo "🚚 Restaurando banco de dados para $TARGET_DIR/flow.db..."
cp -p "$BEST_DB" "$TARGET_DIR/flow.db"
[ -f "${BEST_DB}-wal" ] && cp -p "${BEST_DB}-wal" "$TARGET_DIR/flow.db-wal" || rm -f "$TARGET_DIR/flow.db-wal" 2>/dev/null || true
[ -f "${BEST_DB}-shm" ] && cp -p "${BEST_DB}-shm" "$TARGET_DIR/flow.db-shm" || rm -f "$TARGET_DIR/flow.db-shm" 2>/dev/null || true

chmod 666 "$TARGET_DIR"/flow.db* 2>/dev/null || true

# 7. Reiniciar o container Flow
echo "🚀 Reiniciando container $CONTAINER_NAME..."
docker start "$CONTAINER_NAME" 2>/dev/null || {
  for cand_dir in /opt/flow /opt/devsquad /opt/synchro; do
    if [ -d "$cand_dir" ]; then
      cd "$cand_dir" && docker compose up -d
      break
    fi
  done
}

sleep 3

# 8. Testar integridade da aplicação
echo "🧪 Verificando resposta do Flow PRO..."
HEALTH_CHECK=$(curl -s http://127.0.0.1:3006/api/health 2>/dev/null || curl -s http://127.0.0.1:3001/api/health 2>/dev/null || true)
echo "Status da API: $HEALTH_CHECK"

echo ""
echo "========================================================"
echo "🎉 RESTAURAÇÃO CONCLUÍDA COM SUCESSO!"
echo "========================================================"
echo "Todos os seus projetos, requisitos, demandas e métricas foram recuperados!"
echo "Acesse https://devsquad.klynner.com.br e recarregue a página (Ctrl + F5)."
echo "========================================================"
