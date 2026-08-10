#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:4020/api/v1"
SUPPLIER="9963712337"
TRANSPORTER="9491996633"
ADMIN="9999988888"

echo "=== 1. OTP for supplier & transporter ==="
SUP_CODE=$(curl -s -X POST "$BASE/auth/otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$SUPPLIER\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['devCode'])")
TR_CODE=$(curl -s -X POST "$BASE/auth/otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$TRANSPORTER\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['devCode'])")
echo "supplier otp=$SUP_CODE transporter otp=$TR_CODE"

echo "=== 2. Verify OTP -> JWT ==="
SUP_TOKEN=$(curl -s -X POST "$BASE/auth/verify" -H 'Content-Type: application/json' -d "{\"mobile\":\"$SUPPLIER\",\"code\":\"$SUP_CODE\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
TR_TOKEN=$(curl -s -X POST "$BASE/auth/verify" -H 'Content-Type: application/json' -d "{\"mobile\":\"$TRANSPORTER\",\"code\":\"$TR_CODE\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
echo "tokens acquired"

echo "=== 3. Supplier: get reference data (models & materials via load create flow) ==="
MODEL_ID=$(curl -s -X POST "$BASE/auth/otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$ADMIN\"}" >/dev/null; echo "skip")

# fetch a truck model id + material id through a direct DB check via API is not exposed; hardcode from seed structure
# Instead, get ids from admin users listing? We'll just create with ids we look up below.

echo "=== 4. Supplier: post a load ==="
# We need model + material ids; query them from the backend DB through admin dashboard is not enough.
# Simplest: create load referencing ids we fetch from DB via psql
MODEL=$(docker compose exec -T postgres psql -U wagon -d wagon -t -A -c "SELECT id FROM \"TruckModel\" LIMIT 1")
MATERIAL=$(docker compose exec -T postgres psql -U wagon -d wagon -t -A -c "SELECT id FROM \"Material\" WHERE name='Packaged Boxes' LIMIT 1")
echo "model=$MODEL material=$MATERIAL"

LOAD_RESP=$(curl -s -X POST "$BASE/loads" -H "Authorization: Bearer $SUP_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"pickupAddr\":\"Ameerpet, Hyderabad\",\"dropAddr\":\"Vijayawada, AP\",\"pickupLat\":17.4375,\"pickupLng\":78.4482,\"dropLat\":16.5062,\"dropLng\":80.6480,\"date\":\"2026-08-15T08:00:00Z\",\"truckType\":\"container\",\"modelId\":\"$MODEL\",\"weight\":35,\"distanceKm\":250,\"materialId\":\"$MATERIAL\",\"description\":\"e2e test load\"}")
echo "$LOAD_RESP"
LOAD_ID=$(echo "$LOAD_RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['load']['id'])")

echo "=== 5. Transporter: list load feed ==="
curl -s "$BASE/loads?truckType=container" -H "Authorization: Bearer $TR_TOKEN" | python3 -m json.tool | head -20

echo "=== 6. Transporter: accept the load ==="
ACCEPT=$(curl -s -X POST "$BASE/trips/accept" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d "{\"loadId\":\"$LOAD_ID\"}")
echo "$ACCEPT"
TRIP_ID=$(echo "$ACCEPT" | python3 -c "import sys,json;print(json.load(sys.stdin)['trip']['id'])")

echo "=== 7. Transporter: mark in-transit ==="
curl -s -X PATCH "$BASE/trips/$TRIP_ID/status" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d '{"status":"in_transit"}'
echo

echo "=== 8. Transporter: mark delivered ==="
curl -s -X PATCH "$BASE/trips/$TRIP_ID/status" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d '{"status":"delivered"}'
echo

echo "=== 9. Supplier: notifications received ==="
curl -s "$BASE/notifications" -H "Authorization: Bearer $SUP_TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print('unread:',d['unread']);[print(' -',n['type'],'|',n['title']) for n in d['items']]"

echo "=== 10. Admin: dashboard + verify ==="
ADM_CODE=$(curl -s -X POST "$BASE/auth/otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$ADMIN\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['devCode'])")
ADM_TOKEN=$(curl -s -X POST "$BASE/auth/verify" -H 'Content-Type: application/json' -d "{\"mobile\":\"$ADMIN\",\"code\":\"$ADM_CODE\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
curl -s "$BASE/admin/dashboard" -H "Authorization: Bearer $ADM_TOKEN"
echo

echo "=== 11. Security: supplier cannot access admin endpoint ==="
curl -s "$BASE/admin/dashboard" -H "Authorization: Bearer $SUP_TOKEN"
echo

echo "=== DONE ==="
