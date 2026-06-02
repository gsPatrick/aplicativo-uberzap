#!/usr/bin/env bash
# Simula o fluxo do motorista via API (aceitar → chegar → iniciar → finalizar).
# Uso típico:
#   1. Rode o app passageiro no Expo e solicite uma corrida
#   2. Em outro terminal: ./scripts/simulate-driver-flow.sh --poll
#
# Requisitos: curl, python3

set -euo pipefail

API_BASE="${API_BASE:-https://geral-uberzap-api.r954jc.easypanel.host/_}"
API_BASE="${API_BASE%/}"
SECRET="${SECRET:-abc1234}"

DRIVER_ID="${DRIVER_ID:-1006}"
CIDADE_ID="${CIDADE_ID:-7}"
DRIVER_LAT="${DRIVER_LAT:--12.9323131}"
DRIVER_LNG="${DRIVER_LNG:--38.3645496}"

PASS_TELEFONE="${PASS_TELEFONE:-71983141370}"
PASS_SENHA="${PASS_SENHA:-123456}"

POLL_INTERVAL="${POLL_INTERVAL:-3}"
POLL_MAX="${POLL_MAX:-120}"
STEP_DELAY="${STEP_DELAY:-2}"

RIDE_ID=""
MODE="all"
DO_POLL=0

usage() {
  cat <<'EOF'
Simula motorista na API UbeZap.

Uso:
  ./scripts/simulate-driver-flow.sh [opções]

Opções:
  --poll              Aguarda corrida disponível (status 0) antes de aceitar
  --ride-id ID        Usa corrida específica (pula poll)
  --step STEP         Só executa: online | accept | arrived | start | finish | status | all
  --pass-telefone T   Telefone passageiro para checar status (default: 71983141370)
  --pass-senha S      Senha passageiro (default: 123456)
  --driver-id ID      ID motorista (default: 1006)
  --cidade-id ID      Cidade (default: 7)
  -h, --help          Ajuda

Exemplos:
  ./scripts/simulate-driver-flow.sh --poll
  ./scripts/simulate-driver-flow.sh --ride-id 566 --step all
  ./scripts/simulate-driver-flow.sh --ride-id 566 --step status
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --poll) DO_POLL=1; shift ;;
    --ride-id) RIDE_ID="$2"; shift 2 ;;
    --step) MODE="$2"; shift 2 ;;
    --pass-telefone) PASS_TELEFONE="$2"; shift 2 ;;
    --pass-senha) PASS_SENHA="$2"; shift 2 ;;
    --driver-id) DRIVER_ID="$2"; shift 2 ;;
    --cidade-id) CIDADE_ID="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Opção desconhecida: $1"; usage; exit 1 ;;
  esac
done

log() { printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

api_post() {
  local endpoint="$1"
  shift
  curl -sS -X POST "${API_BASE}/${endpoint}" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    "$@"
}

passenger_status() {
  api_post 'app/get_status_chamado.php' \
    --data-urlencode "telefone=${PASS_TELEFONE}" \
    --data-urlencode "senha=${PASS_SENHA}"
}

show_passenger_status() {
  local raw
  raw="$(passenger_status)"
  log "Passageiro get_status_chamado →"
  python3 - <<PY "$raw"
import json, sys
raw = sys.argv[1]
try:
    d = json.loads(raw)
except Exception:
    print(raw)
    sys.exit(0)
status = d.get('status')
labels = {0:'buscando',1:'a caminho',2:'no local',3:'em viagem',4:'finalizada',5:'cancelada'}
print(f"  corrida id={d.get('id')} status={status} ({labels.get(status, '?')}) taxa={d.get('taxa')}")
if d.get('motorista'):
    m = d['motorista']
    print(f"  motorista: {m.get('nome')} ({m.get('placa')})")
PY
}

driver_online() {
  log "Marcando motorista ${DRIVER_ID} online (GPS)..."
  local res
  res="$(api_post 'motoristas/atualiza_local.php' \
    --data-urlencode "secret=${SECRET}" \
    --data-urlencode "id_motorista=${DRIVER_ID}" \
    --data-urlencode "status=1" \
    --data-urlencode "latitude=${DRIVER_LAT}" \
    --data-urlencode "longitude=${DRIVER_LNG}")"
  echo "  → ${res}"
}

poll_ride() {
  log "Aguardando corrida disponível (poll a cada ${POLL_INTERVAL}s, máx ${POLL_MAX}s)..."
  local elapsed=0
  while [[ "$elapsed" -lt "$POLL_MAX" ]]; do
    show_passenger_status
    local raw
    raw="$(api_post 'motoristas/busca_corridas_disponiveis.php' \
      --data-urlencode "secret=${SECRET}" \
      --data-urlencode "id_motorista=${DRIVER_ID}" \
      --data-urlencode "cidade_id=${CIDADE_ID}")"

    if [[ "$raw" != "no" && -n "$raw" ]]; then
      RIDE_ID="$(python3 - <<PY "$raw"
import json, sys
raw = sys.argv[1].strip()
if raw.startswith('['):
    arr = json.loads(raw)
    if arr:
        print(arr[0].get('id', ''))
elif raw.startswith('{'):
    d = json.loads(raw)
    if isinstance(d, list) and d:
        print(d[0].get('id', ''))
    elif d.get('id'):
        print(d['id'])
PY
)"
      if [[ -n "$RIDE_ID" ]]; then
        log "Corrida encontrada: #${RIDE_ID}"
        return 0
      fi
    fi

    sleep "$POLL_INTERVAL"
    elapsed=$((elapsed + POLL_INTERVAL))
  done
  echo "Nenhuma corrida encontrada no tempo limite." >&2
  exit 1
}

accept_ride() {
  log "Aceitando corrida #${RIDE_ID}..."
  local res
  res="$(api_post 'motoristas/aceitar.php' \
    --data-urlencode "secret=${SECRET}" \
    --data-urlencode "id_motorista=${DRIVER_ID}" \
    --data-urlencode "id_corrida=${RIDE_ID}")"
  echo "  → ${res}"
  [[ "$res" == "ok" ]] || { echo "Falha ao aceitar (esperado 'ok')." >&2; exit 1; }
}

update_status() {
  local status="$1"
  local label="$2"
  local taxa="${3:-}"
  log "${label} (status API=${status})..."
  local args=(
    --data-urlencode "secret=${SECRET}"
    --data-urlencode "id_corrida=${RIDE_ID}"
    --data-urlencode "status=${status}"
    --data-urlencode "id_cidade=${CIDADE_ID}"
  )
  if [[ -n "$taxa" ]]; then
    args+=(--data-urlencode "taxa=${taxa}")
  fi
  local res
  res="$(api_post 'motoristas/atualiza.php' "${args[@]}")"
  echo "  → ${res:-'(vazio)'}"
}

finish_ride() {
  log "Finalizando corrida #${RIDE_ID}..."
  local raw taxa km tempo endereco res body
  raw="$(passenger_status)"
  taxa="$(python3 - <<PY "$raw"
import json, sys
try:
    d = json.loads(sys.argv[1])
    print(d.get('taxa') or '10.00')
except Exception:
    print('10.00')
PY
)"
  km="2.50"
  tempo="8"
  endereco="Destino simulado (script)"

  res="$(api_post 'motoristas/atualiza_taxi.php' \
    --data-urlencode "secret=${SECRET}" \
    --data-urlencode "id_motorista=${DRIVER_ID}" \
    --data-urlencode "id_cidade=${CIDADE_ID}" \
    --data-urlencode "id_corrida=${RIDE_ID}" \
    --data-urlencode "taxa=${taxa}" \
    --data-urlencode "km=${km}" \
    --data-urlencode "tempo=${tempo}" \
    --data-urlencode "endereco_fim=${endereco}")"
  body="$(echo "$res" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"

  if [[ "$body" != "ok" ]]; then
    log "atualiza_taxi falhou (resposta: '${res:-vazio}') — tentando atualiza.php status=4..."
    res="$(api_post 'motoristas/atualiza.php' \
      --data-urlencode "secret=${SECRET}" \
      --data-urlencode "id_corrida=${RIDE_ID}" \
      --data-urlencode "status=4" \
      --data-urlencode "id_cidade=${CIDADE_ID}" \
      --data-urlencode "taxa=${taxa}")"
    body="$(echo "$res" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
    [[ "$body" == "ok" ]] || { echo "Falha ao finalizar corrida." >&2; exit 1; }
  fi
  echo "  → ok"

  log "Voltando motorista para online..."
  api_post 'motoristas/atualiza_local.php' \
    --data-urlencode "secret=${SECRET}" \
    --data-urlencode "id_motorista=${DRIVER_ID}" \
    --data-urlencode "status=1" \
    --data-urlencode "latitude=${DRIVER_LAT}" \
    --data-urlencode "longitude=${DRIVER_LNG}" >/dev/null
}

run_step() {
  case "$1" in
    online)
      driver_online
      show_passenger_status
      ;;
    accept)
      [[ -n "$RIDE_ID" ]] || { echo "Defina --ride-id ou use --poll" >&2; exit 1; }
      driver_online
      accept_ride
      sleep "$STEP_DELAY"
      show_passenger_status
      ;;
    arrived)
      [[ -n "$RIDE_ID" ]] || { echo "Defina --ride-id" >&2; exit 1; }
      update_status 2 "Motorista chegou ao embarque"
      sleep "$STEP_DELAY"
      show_passenger_status
      ;;
    start)
      [[ -n "$RIDE_ID" ]] || { echo "Defina --ride-id" >&2; exit 1; }
      update_status 3 "Corrida iniciada"
      sleep "$STEP_DELAY"
      show_passenger_status
      ;;
    finish)
      [[ -n "$RIDE_ID" ]] || { echo "Defina --ride-id" >&2; exit 1; }
      finish_ride
      sleep "$STEP_DELAY"
      show_passenger_status
      ;;
    status)
      show_passenger_status
      ;;
    all)
      if [[ "$DO_POLL" -eq 1 && -z "$RIDE_ID" ]]; then
        poll_ride
      fi
      [[ -n "$RIDE_ID" ]] || {
        echo "Informe --ride-id ID ou use --poll após solicitar corrida no app." >&2
        exit 1
      }
      driver_online
      accept_ride; sleep "$STEP_DELAY"; show_passenger_status
      update_status 2 "Motorista chegou ao embarque"; sleep "$STEP_DELAY"; show_passenger_status
      update_status 3 "Corrida iniciada"; sleep "$STEP_DELAY"; show_passenger_status
      finish_ride; sleep "$STEP_DELAY"; show_passenger_status
      log "Fluxo completo concluído."
      ;;
    *)
      echo "Step inválido: $1" >&2
      exit 1
      ;;
  esac
}

run_step "$MODE"
