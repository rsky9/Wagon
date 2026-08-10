#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:4020/api/v1"
SUPPLIER="9963712337"
TRANSPORTER="9491996633"

otp() { curl -s -X POST "$BASE/auth/otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$1\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['devCode'])"; }
verify() { curl -s -X POST "$BASE/auth/verify" -H 'Content-Type: application/json' -d "{\"mobile\":\"$1\",\"code\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])"; }

SUP_TOKEN=$(verify "$SUPPLIER" "$(otp "$SUPPLIER")")
TR_TOKEN=$(verify "$TRANSPORTER" "$(otp "$TRANSPORTER")")

echo "=== transporter saves a lane alert (Hyderabad) ==="
ALERT_ID=$(curl -s -X POST "$BASE/alerts" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d '{"fromLane":"Hyderabad","truckType":"container"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['alert']['id'])")
echo "alert=$ALERT_ID"
curl -s "$BASE/alerts/mine" -H "Authorization: Bearer $TR_TOKEN" | python3 -c "import sys,json;[print(' -',a['fromLane'],a['truckType']) for a in json.load(sys.stdin)['alerts']]"

echo "=== supplier posts a load from Hyderabad ==="
MODEL=$(docker compose exec -T postgres psql -U wagon -d wagon -t -A -c "SELECT id FROM \"TruckModel\" WHERE type='container' LIMIT 1")
MATERIAL=$(docker compose exec -T postgres psql -U wagon -d wagon -t -A -c "SELECT id FROM \"Material\" WHERE name='Packaged Boxes' LIMIT 1")
LOAD_ID=$(curl -s -X POST "$BASE/loads" -H "Authorization: Bearer $SUP_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"pickupAddr\":\"Hyderabad, Telangana\",\"dropAddr\":\"Chennai, Tamil Nadu\",\"pickupLat\":17.385,\"pickupLng\":78.487,\"dropLat\":13.083,\"dropLng\":80.27,\"date\":\"2026-08-25T08:00:00Z\",\"truckType\":\"container\",\"modelId\":\"$MODEL\",\"weight\":35,\"distanceKm\":513,\"materialId\":\"$MATERIAL\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['load']['id'])")
echo "load=$LOAD_ID"

echo "=== transporter got a lane-match notification ==="
curl -s "$BASE/notifications" -H "Authorization: Bearer $TR_TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);[print(' -',n['type'],'|',n['title']) for n in d['items'][:3]]"

echo "=== transporter accepts and marks in-transit ==="
TRIP_ID=$(curl -s -X POST "$BASE/trips/accept" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d "{\"loadId\":\"$LOAD_ID\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['trip']['id'])")
curl -s -X PATCH "$BASE/trips/$TRIP_ID/status" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d '{"status":"in_transit"}' > /dev/null
echo "trip=$TRIP_ID in-transit"

echo "=== transporter ingests 3 location points ==="
curl -s -X POST "$BASE/tracking/$TRIP_ID/location" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d '{"lat":17.385,"lng":78.487,"speedKmh":45}' > /dev/null
sleep 1
curl -s -X POST "$BASE/tracking/$TRIP_ID/location" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d '{"lat":16.5,"lng":79.5,"speedKmh":55}' > /dev/null
sleep 1
curl -s -X POST "$BASE/tracking/$TRIP_ID/location" -H "Authorization: Bearer $TR_TOKEN" -H 'Content-Type: application/json' -d '{"lat":15.8,"lng":80.1,"speedKmh":60}' > /dev/null
echo "ingested"

echo "=== supplier reads tracking history ==="
curl -s "$BASE/tracking/$TRIP_ID" -H "Authorization: Bearer $SUP_TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print('points:',len(d['locations']));[print(' -',p['lat'],p['lng'],str(p['speedKmh'])+'km/h') for p in d['locations']]"

echo "=== security: a random supplier (999) cannot track this trip ==="
OTP_9=$(otp "9999911111")
T9=$(verify "9999911111" "$OTP_9")
curl -s "$BASE/tracking/$TRIP_ID" -H "Authorization: Bearer $T9"
echo

echo "=== DONE ==="
