#!/bin/bash
# Test script to verify VetCare API endpoints
# Run this on the server to test API connectivity and responses

API_URL="https://vet.talkhub.me/api"

echo "========================================="
echo "VetCare API Endpoint Tests"
echo "========================================="
echo ""

echo "1. Testing /health endpoint..."
curl -s "$API_URL/../health" | jq '.' || echo "Health endpoint failed"
echo ""
echo ""

echo "2. Testing /clientes endpoint..."
CLIENTS=$(curl -s "$API_URL/clientes" | jq 'length')
echo "✓ Found $CLIENTS clients"
echo "Sample client:"
curl -s "$API_URL/clientes" | jq '.[0]' || echo "Clients endpoint failed"
echo ""
echo ""

echo "3. Testing /pets endpoint..."
PETS=$(curl -s "$API_URL/pets" | jq 'length')
if [ "$PETS" = "null" ]; then
    echo "❌ /pets endpoint returned null or invalid JSON"
    echo "Raw response:"
    curl -s "$API_URL/pets"
else
    echo "✓ Found $PETS pets"
    echo "Sample pet:"
    curl -s "$API_URL/pets" | jq '.[0]'
fi
echo ""
echo ""

echo "4. Testing /agendamentos endpoint..."
APPOINTMENTS=$(curl -s "$API_URL/agendamentos" | jq 'length')
echo "✓ Found $APPOINTMENTS agendamentos"
echo "Sample agendamento:"
curl -s "$API_URL/agendamentos" | jq '.[0]' || echo "Agendamentos endpoint failed"
echo ""
echo ""

echo "5. Testing /financeiro/contas-receber endpoint..."
FINANCIAL=$(curl -s "$API_URL/financeiro/contas-receber" | jq 'length')
if [ "$FINANCIAL" = "null" ]; then
    echo "⚠️  /financeiro/contas-receber returned null (might need cliente_id parameter)"
    echo "Testing with cliente_id=1..."
    curl -s "$API_URL/financeiro/contas-receber?cliente_id=1" | jq '.'
else
    echo "✓ Found $FINANCIAL contas a receber"
    echo "Sample conta:"
    curl -s "$API_URL/financeiro/contas-receber" | jq '.[0]'
fi
echo ""
echo ""

echo "========================================="
echo "Testing specific pet details..."
echo "========================================="
echo ""

# Get first pet ID to test details endpoint
FIRST_PET_ID=$(curl -s "$API_URL/pets" | jq '.[0].id')
if [ "$FIRST_PET_ID" != "null" ] && [ -n "$FIRST_PET_ID" ]; then
    echo "6. Testing /pets/$FIRST_PET_ID endpoint..."
    curl -s "$API_URL/pets/$FIRST_PET_ID" | jq '.'
    echo ""
    echo ""

    echo "7. Testing /pets/$FIRST_PET_ID/vacinacoes endpoint..."
    curl -s "$API_URL/pets/$FIRST_PET_ID/vacinacoes" | jq '.'
else
    echo "❌ Could not get pet ID for testing"
fi

echo ""
echo "========================================="
echo "Tests completed!"
echo "========================================="
