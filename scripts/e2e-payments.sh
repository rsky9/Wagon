#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:4020/api/v1"
SUPPLIER="9963712337"
TRANSPORTER="9491996633"
ADMIN="9999988888"

otp() { curl -s -X POST "$BASE/auth/otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$1\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['devCode'])"; }
verify() { curl -s -X POST "$BASE/auth/verify" -H 'Content-Type: application/json' -d "{\"mobile\":\"$1\",\"code\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])"; }

echo "=== auth ==="
SUP_TOKEN=$(verify "$SUPPLIER" "$(otp "$SUPPLIER")")
TR_TOKEN=$(verify "$TRANSPORTER" "$(otp "$TRANSPORTER")")
ADM_TOKEN=$(verify "$ADMIN" "$(otp "$ADMIN")")
echo "tokens ok"

echo "=== ref ids ==="
MODEL=$(docker compose exec -T postgres psql -U wagon -d wagon -t -A -c "SELECT id FROM \"TruckModel\" LIMIT 1")
MATERIAL=$(docker compose exec -T postgres psql -U wagon -d wagon -t -A -c "SELECT id FROM \"Material\" WHERE name='Packaged Boxes' LIMIT 1")

echo "=== supplier posts load ==="
LOAD_ID=$(curl -s -X POST "$BASE/loads" -H "Authorization: Bearer $SUP_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"pickupAddr\":\"Secunderabad, Hyderabad\",\"dropAddr\":\"Warangal, Telangana\",\"pickupLat\":17.4399,\"pickupLng\":78.4983,\"dropLat\":17.9689,\"dropLng\":79.5941,\"date\":\"2026-08-20T08:00:00Z\",\"truckType\":\"open\",\"modelId\":\"$MODEL\",\"weight\":25,\"distanceKm\":140,\"materialId\":\"$MATERIAL\",\"description\":\"phase2 e2e\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['load']['id'])")
echo "load=$LOAD_ID fare=$(curl -s "$BASE/loads/$LOAD_ID" -H "Authorization: Bearer $TR_TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)['load']['fareEstimate'])")"

echo "=== transporter accepts ==="
TRIP_ID=$(curl -s -X POST "$BASE/trips/accept" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d "{\"loadId\":\"$LOAD_ID\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['trip']['id'])")
echo "trip=$TRIP_ID"

echo "=== supplier pays escrow (₹5000) ==="
curl -s -X POST "$BASE/payments/escrow" -H "Authorization: Bearer $SUP_TOKEN" -H 'Content-Type: application/json' -d "{\"tripId\":\"$TRIP_ID\",\"amount\":5000}"
echo
echo "--- escrow idempotent (repeat) ---"
curl -s -X POST "$BASE/payments/escrow" -H "Authorization: Bearer $SUP_TOKEN" -H 'Content-Type: application/json' -d "{\"tripId\":\"$TRIP_ID\",\"amount\":5000}"
echo

echo "=== in-transit → delivered ==="
curl -s -X PATCH "$BASE/trips/$TRIP_ID/status" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d '{"status":"in_transit"}' > /dev/null
curl -s -X PATCH "$BASE/trips/$TRIP_ID/status" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d '{"status":"delivered"}' > /dev/null
echo "delivered"

echo "=== transporter uploads POD ==="
curl -s -X POST "$BASE/payments/pod/$TRIP_ID" -H "Authorization: Bearer $TR_TOKEN"
echo

echo "=== transporter requests payout release ==="
curl -s -X POST "$BASE/payments/release" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d "{\"tripId\":\"$TRIP_ID\"}"
echo

echo "=== supplier passbook ==="
curl -s "$BASE/payments/passbook" -H "Authorization: Bearer $SUP_TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print('balance:',d['balance']);[print(' -',e['type'],e['amount'],e['status']) for e in d['entries']]"

echo "=== transporter passbook ==="
curl -s "$BASE/payments/passbook" -H "Authorization: Bearer $TR_TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print('balance:',d['balance']);[print(' -',e['type'],e['amount'],e['status']) for e in d['entries']]"

echo "=== supplier rates transporter 5 stars ==="
curl -s -X POST "$BASE/ratings/trip/$TRIP_ID" -H "Authorization: Bearer $SUP_TOKEN" -H 'Content-Type: application/json' -d '{"score":5}'
echo
TR_USER_ID=$(docker compose exec -T postgres psql -U wagon -d wagon -t -A -c "SELECT id FROM \"User\" WHERE mobile='$TRANSPORTER'")
curl -s "$BASE/ratings/transporter/$TR_USER_ID" -H "Authorization: Bearer $TR_TOKEN"
echo

echo "=== transporter raises dispute (escrow already released) ==="
DISPUTE_ID=$(curl -s -X POST "$BASE/disputes" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d "{\"tripId\":\"$TRIP_ID\",\"subject\":\"Amount mismatch\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "dispute=$DISPUTE_ID"

echo "=== admin resolves dispute ==="
curl -s -X PATCH "$BASE/disputes/$DISPUTE_ID/resolve" -H "Authorization: Bearer $ADM_TOKEN" -H 'Content-Type: application/json' -d '{"resolution":"Confirmed payout correct"}'
echo

echo "=== security: transporter cannot list open disputes (admin only) ==="
curl -s "$BASE/disputes/open" -H "Authorization: Bearer $TR_TOKEN"
echo

echo "=== DONE ==="
