#!/usr/bin/env bash
# Comprehensive full-platform audit: every business flow wired end-to-end.
set -uo pipefail

BASE="http://localhost:4020/api/v1"
SUP="9963712337"; TR="9491996633"; ADM="9999988888"
PASS=0; FAIL=0

check() { if [ "$2" = "1" ]; then PASS=$((PASS+1)); echo "  ✓ $1"; else FAIL=$((FAIL+1)); echo "  ✗ $1"; fi; }
otp() { curl -s -X POST "$BASE/auth/otp" -H 'Content-Type: application/json' -d "{\"mobile\":\"$1\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['devCode'])"; }
verify() { curl -s -X POST "$BASE/auth/verify" -H 'Content-Type: application/json' -d "{\"mobile\":\"$1\",\"code\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])"; }
has() { echo "$1" | grep -qF "$2" && echo 1 || echo 0; }

echo "== 1. AUTH & RBAC =="
ST=$(verify "$SUP" "$(otp "$SUP")"); TT=$(verify "$TR" "$(otp "$TR")"); AT=$(verify "$ADM" "$(otp "$ADM")")
check "supplier OTP login -> JWT" "$(has "$ST" 'eyJ')"
check "transporter OTP login -> JWT" "$(has "$TT" 'eyJ')"
check "admin OTP login -> JWT" "$(has "$AT" 'eyJ')"
check "no-token -> 403" "$([ "$(curl -s -o /dev/null -w '%{http_code}' $BASE/loads)" = "403" ] && echo 1 || echo 0)"
check "supplier blocked from admin" "$([ "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $ST" $BASE/admin/dashboard)" = "403" ] && echo 1 || echo 0)"
check "transporter blocked from admin" "$([ "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TT" $BASE/admin/dashboard)" = "403" ] && echo 1 || echo 0)"

echo "== 2. LOAD LIFECYCLE =="
MODEL=$(docker compose exec -T postgres psql -U wagon -d wagon -t -A -c "SELECT id FROM \"TruckModel\" WHERE type='container' LIMIT 1")
MATERIAL=$(docker compose exec -T postgres psql -U wagon -d wagon -t -A -c "SELECT id FROM \"Material\" LIMIT 1")
LOAD=$(curl -s -X POST "$BASE/loads" -H "Authorization: Bearer $ST" -H 'Content-Type: application/json' \
  -d "{\"pickupAddr\":\"AUDIT-${RANDOM} Hyderabad\",\"dropAddr\":\"Vijayawada, AP\",\"pickupLat\":17.385,\"pickupLng\":78.487,\"dropLat\":16.506,\"dropLng\":80.648,\"date\":\"2026-09-01T08:00:00Z\",\"truckType\":\"container\",\"modelId\":\"$MODEL\",\"weight\":35,\"distanceKm\":250,\"materialId\":\"$MATERIAL\"}")
LID=$(echo "$LOAD" | python3 -c "import sys,json;print(json.load(sys.stdin)['load']['id'])" 2>/dev/null)
check "supplier posts load" "$(has "$LID" 'cmsk')"
check "load status=posted" "$(has "$LOAD" '"status":"posted"')"
check "fare auto-estimated > 0" "$([ "$(echo "$LOAD" | python3 -c "import sys,json;print(json.load(sys.stdin)['load']['fareEstimate']>0)" 2>/dev/null)" = "True" ] && echo 1 || echo 0)"
FEED=$(curl -s "$BASE/loads?truckType=container" -H "Authorization: Bearer $TT")
check "transporter sees load in filtered feed" "$(has "$FEED" "$LID")"

echo "== 3. TRIP + STATE MACHINE =="
TRIP=$(curl -s -X POST "$BASE/trips/accept" -H "Authorization: Bearer $TT" -H 'Content-Type: application/json' -d "{\"loadId\":\"$LID\"}")
TID=$(echo "$TRIP" | python3 -c "import sys,json;print(json.load(sys.stdin)['trip']['id'])" 2>/dev/null)
check "transporter accepts -> trip" "$(has "$TID" 'cmsk')"
check "double-accept rejected" "$([ "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $TT" -H 'Content-Type: application/json' -d "{\"loadId\":\"$LID\"}" $BASE/trips/accept)" = "400" ] && echo 1 || echo 0)"
curl -s -X PATCH "$BASE/trips/$TID/status" -H "Authorization: Bearer $TT" -H 'Content-Type: application/json' -d '{"status":"in_transit"}' > /dev/null
check "accepted -> in_transit" "$([ "$(docker compose exec -T postgres psql -U wagon -d wagon -t -A -c "SELECT status FROM \"Trip\" WHERE id='$TID'")" = "in_transit" ] && echo 1 || echo 0)"

echo "== 4. TRACKING (REST + WS) =="
curl -s -X POST "$BASE/tracking/$TID/location" -H "Authorization: Bearer $TT" -H 'Content-Type: application/json' -d '{"lat":16.9,"lng":79.4,"speedKmh":55}' > /dev/null
TRK=$(curl -s "$BASE/tracking/$TID" -H "Authorization: Bearer $ST")
check "supplier reads tracking history" "$(has "$TRK" '"locations":[')"
check "non-participant (admin) blocked" "$([ "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AT" $BASE/tracking/$TID)" = "400" ] && echo 1 || echo 0)"
# WS broadcast check
cat > /tmp/ws-audit.mjs <<'EOF'
import { io } from 'socket.io-client'
const s = io('http://localhost:4020/tracking', { transports: ['websocket'] })
s.on('connect', () => s.emit('join', { tripId: process.argv[2] }))
s.on('location', () => { console.log('WS_OK'); s.disconnect(); process.exit(0) })
setTimeout(() => { console.log('WS_TIMEOUT'); process.exit(1) }, 6000)
EOF
cp /tmp/ws-audit.mjs ./ws-audit.mjs
(node ./ws-audit.mjs "$TID" > /tmp/ws-res.log 2>&1 &) ; sleep 2
curl -s -X POST "$BASE/tracking/$TID/location" -H "Authorization: Bearer $TT" -H 'Content-Type: application/json' -d '{"lat":16.5,"lng":79.8,"speedKmh":60}' > /dev/null
sleep 2
check "WebSocket live broadcast received" "$(has "$(cat /tmp/ws-res.log)" 'WS_OK')"
rm -f ws-audit.mjs /tmp/ws-audit.mjs

echo "== 5. PAYMENTS =="
ESC=$(curl -s -X POST "$BASE/payments/escrow" -H "Authorization: Bearer $ST" -H 'Content-Type: application/json' -d "{\"tripId\":\"$TID\",\"amount\":5000}")
check "supplier captures escrow" "$(has "$ESC" '"status":"succeeded"')"
ESC2=$(curl -s -X POST "$BASE/payments/escrow" -H "Authorization: Bearer $ST" -H 'Content-Type: application/json' -d "{\"tripId\":\"$TID\",\"amount\":5000}")
check "escrow idempotent (same payment id)" "$(has "$ESC2" '"alreadyCaptured":true')"

echo "== 6. DELIVERY + POD + PAYOUT =="
curl -s -X PATCH "$BASE/trips/$TID/status" -H "Authorization: Bearer $TT" -H 'Content-Type: application/json' -d '{"status":"delivered"}' > /dev/null
check "in_transit -> delivered" "$([ "$(docker compose exec -T postgres psql -U wagon -d wagon -t -A -c "SELECT status FROM \"Trip\" WHERE id='$TID'")" = "delivered" ] && echo 1 || echo 0)"
POD=$(curl -s -X POST "$BASE/kyc/pod/$TID" -H "Authorization: Bearer $TT" -H 'Content-Type: application/json' -d '{"mimeType":"application/pdf","size":100}')
PU=$(echo "$POD" | python3 -c "import sys,json;print(json.load(sys.stdin)['uploadUrl'])" 2>/dev/null)
check "POD presigned URL issued" "$(has "$PU" 'http')"
PAYOUT=$(curl -s -X POST "$BASE/payments/release" -H "Authorization: Bearer $TT" -H 'Content-Type: application/json' -d "{\"tripId\":\"$TID\"}")
check "payout processed" "$(has "$PAYOUT" '"type":"payout"')"
check "payout succeeded" "$(has "$PAYOUT" '"status":"succeeded"')"
PB=$(curl -s "$BASE/payments/passbook" -H "Authorization: Bearer $TT")
check "transporter passbook balance nets 0" "$([ "$(echo "$PB" | python3 -c "import sys,json;print(json.load(sys.stdin)['balance'])")" = "0" ] && echo 1 || echo 0)"

echo "== 7. RATINGS =="
RATE=$(curl -s -X POST "$BASE/ratings/trip/$TID" -H "Authorization: Bearer $ST" -H 'Content-Type: application/json' -d '{"score":5}')
check "supplier rates 5" "$(has "$RATE" '"rating":5')"
check "out-of-range rejected" "$([ "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $ST" -H 'Content-Type: application/json' -d '{"score":9}' $BASE/ratings/trip/$TID)" = "400" ] && echo 1 || echo 0)"

echo "== 8. E-WAY BILL =="
EWB=$(curl -s -X POST "$BASE/ewb/loads/$LID" -H "Authorization: Bearer $ST")
check "EWB generated" "$(has "$EWB" 'EWB786')"
EWB2=$(curl -s -X POST "$BASE/ewb/loads/$LID" -H "Authorization: Bearer $ST")
check "EWB idempotent" "$(has "$EWB2" '"alreadyGenerated":true')"

echo "== 9. NOTIFICATIONS & PUSH =="
NT=$(curl -s "$BASE/notifications" -H "Authorization: Bearer $ST")
check "supplier has notifications" "$([ "$(echo "$NT" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['items'])>0)")" = "True" ] && echo 1 || echo 0)"
check "supplier saw order_accepted" "$(has "$NT" 'order_accepted')"
check "supplier saw trip_delivered" "$(has "$NT" 'trip_delivered')"
# Push is verified separately (requires an FCM token); not part of the passing tally here.
echo "  (push chain verified separately: register FCM token -> notification -> mock-push log)"

echo "== 10. DISPUTES + AUDIT =="
DIS=$(curl -s -X POST "$BASE/disputes" -H "Authorization: Bearer $TT" -H 'Content-Type: application/json' -d "{\"tripId\":\"$TID\",\"subject\":\"audit dispute\"}")
DID=$(echo "$DIS" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])" 2>/dev/null)
check "transporter raises dispute" "$(has "$DID" 'cmsk')"
RES=$(curl -s -X PATCH "$BASE/disputes/$DID/resolve" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"resolution":"audit resolved"}')
check "admin resolves dispute" "$(has "$RES" '"status":"resolved"')"
AUD=$(curl -s "$BASE/admin/audit" -H "Authorization: Bearer $AT")
check "audit log has dispute.resolve" "$(has "$AUD" 'dispute.resolve')"

echo "== 11. ADMIN CONSOLE API =="
DASH=$(curl -s "$BASE/admin/dashboard" -H "Authorization: Bearer $AT")
check "dashboard KPIs numeric" "$(has "$DASH" '"loadsThisWeek"')"
USERS=$(curl -s "$BASE/admin/users" -H "Authorization: Bearer $AT")
check "users list" "$(has "$USERS" '"users":[')"
ADM_LOADS=$(curl -s "$BASE/admin/loads" -H "Authorization: Bearer $AT")
check "admin loads list" "$(has "$ADM_LOADS" '"loads":[')"
ADM_TRIPS=$(curl -s "$BASE/admin/trips" -H "Authorization: Bearer $AT")
check "admin trips list" "$(has "$ADM_TRIPS" '"trips":[')"

echo "== 12. KYC + UPLOADS =="
KYC=$(curl -s -X POST "$BASE/kyc/upload" -H "Authorization: Bearer $ST" -H 'Content-Type: application/json' -d '{"kind":"pan","mimeType":"image/jpeg","size":1000}')
check "KYC presigned URL" "$(has "$KYC" 'uploadUrl')"
KYC2=$(curl -s -X POST "$BASE/kyc/upload" -H "Authorization: Bearer $ST" -H 'Content-Type: application/json' -d '{"kind":"bogus","mimeType":"image/jpeg","size":100}')
check "invalid KYC kind rejected" "$([ "$(echo "$KYC2" | python3 -c "import sys,json;print(json.load(sys.stdin).get('statusCode'))" 2>/dev/null)" = "400" ] && echo 1 || echo 0)"

echo ""
echo "======================================"
echo "PASS: $PASS   FAIL: $FAIL"
echo "======================================"
[ "$FAIL" = "0" ] && echo "ALL FLOWS WIRED ✅" || echo "GAPS FOUND ❌"
