#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:4020/api/v1"
SUPPLIER="9963712337"
TRANSPORTER="9491996633"

otp() { curl -s -X POST "$BASE/auth/otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$1\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['devCode'])"; }
verify() { curl -s -X POST "$BASE/auth/verify" -H 'Content-Type: application/json' -d "{\"mobile\":\"$1\",\"code\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])"; }

SUP_TOKEN=$(verify "$SUPPLIER" "$(otp "$SUPPLIER")")
TR_TOKEN=$(verify "$TRANSPORTER" "$(otp "$TRANSPORTER")")

echo "=== 1. KYC: supplier requests upload URL for PAN ==="
KYC=$(curl -s -X POST "$BASE/kyc/upload" -H "Authorization: Bearer $SUP_TOKEN" -H 'Content-Type: application/json' -d '{"kind":"pan","mimeType":"image/jpeg","size":50000}')
echo "$KYC" | python3 -c "import sys,json;d=json.load(sys.stdin);print('docId:',d['documentId']);print('uploadUrl:',d['uploadUrl'][:70]+'...');print('key:',d['key'])"

echo "=== 2. KYC: reject invalid kind ==="
curl -s -X POST "$BASE/kyc/upload" -H "Authorization: Bearer $SUP_TOKEN" -H 'Content-Type: application/json' -d '{"kind":"notreal","mimeType":"image/jpeg","size":100}' | python3 -m json.tool

echo "=== 3. KYC: list my documents ==="
curl -s "$BASE/kyc/mine" -H "Authorization: Bearer $SUP_TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);[print(' -',doc['kind'],doc['status']) for doc in d['docs']]"

echo "=== 4. Supplier posts load + generates E-way bill ==="
MODEL=$(cd apps/backend && pnpm exec prisma db execute --stdin <<< "SELECT id FROM \"TruckModel\" WHERE type='container' LIMIT 1;" 2>/dev/null || true)
MODEL=$(docker compose exec -T postgres psql -U wagon -d wagon -t -A -c "SELECT id FROM \"TruckModel\" WHERE type='container' LIMIT 1")
MATERIAL=$(docker compose exec -T postgres psql -U wagon -d wagon -t -A -c "SELECT id FROM \"Material\" WHERE name='Packaged Boxes' LIMIT 1")
LOAD_ID=$(curl -s -X POST "$BASE/loads" -H "Authorization: Bearer $SUP_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"pickupAddr\":\"Hyderabad, Telangana\",\"dropAddr\":\"Delhi, Delhi\",\"pickupLat\":17.385,\"pickupLng\":78.487,\"dropLat\":28.613,\"dropLng\":77.209,\"date\":\"2026-09-10T08:00:00Z\",\"truckType\":\"container\",\"modelId\":\"$MODEL\",\"weight\":40,\"distanceKm\":1500,\"materialId\":\"$MATERIAL\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['load']['id'])")
echo "load=$LOAD_ID"

echo "--- EWB generate ---"
curl -s -X POST "$BASE/ewb/loads/$LOAD_ID" -H "Authorization: Bearer $SUP_TOKEN" | python3 -m json.tool

echo "--- EWB idempotent (already generated) ---"
curl -s -X POST "$BASE/ewb/loads/$LOAD_ID" -H "Authorization: Bearer $SUP_TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print('alreadyGenerated:',d['alreadyGenerated'],'ewb:',d['ewbNumber'])"

echo "=== 5. Transporter accepts, in-transit, POD presigned URL ==="
TRIP_ID=$(curl -s -X POST "$BASE/trips/accept" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d "{\"loadId\":\"$LOAD_ID\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['trip']['id'])")
curl -s -X PATCH "$BASE/trips/$TRIP_ID/status" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d '{"status":"in_transit"}' > /dev/null
curl -s -X PATCH "$BASE/trips/$TRIP_ID/status" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d '{"status":"delivered"}' > /dev/null
echo "trip=$TRIP_ID delivered"
POD=$(curl -s -X POST "$BASE/kyc/pod/$TRIP_ID" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d '{"mimeType":"application/pdf","size":200000}')
echo "$POD" | python3 -c "import sys,json;d=json.load(sys.stdin);print('podUrl:',d['uploadUrl'][:70]+'...')"

echo "=== 6. Notifications still flow + push in mock mode ==="
curl -s "$BASE/notifications" -H "Authorization: Bearer $SUP_TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print('unread:',d['unread']);[print(' -',n['type']) for n in d['items'][:3]]"

echo "=== DONE ==="
