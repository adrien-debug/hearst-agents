#!/bin/bash
# Run database cleanup via Supabase CLI or API

echo "============================================"
echo "HEARST OS - Database Cleanup & Setup"
echo "============================================"
echo ""
echo "This script will:"
echo "1. Insert/update all LLM provider profiles (Anthropic, OpenAI, Gemini)"
echo "2. Setup fallback chains (Claude → GPT-4o → Gemini)"
echo "3. Cleanup stuck runs (>24h)"
echo "4. Cleanup orphaned traces and old data"
echo ""

SUPABASE_URL="https://jnijwpqbanazuapznrzu.supabase.co"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuaWp3cHFiYW5henVhcHpucnp1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA1ODA0OSwiZXhwIjoyMDkxNjM0MDQ5fQ.AuTTTeCWGYXImi7jK1hPs4x2OYt_yxhv_QSo-tMPinM"

echo "Option 1: Run via Supabase CLI (if installed)"
echo "   supabase db execute --file ./scripts/db-cleanup.sql"
echo ""
echo "Option 2: Copy/paste SQL into Supabase SQL Editor:"
echo "   $SUPABASE_URL/project/sql"
echo ""
echo "Option 3: Run this curl command (executes SQL via REST):"
echo ""

# Create a function to execute SQL if not exists
SQL=$(cat ./scripts/db-cleanup.sql | sed 's/"/\\"/g' | tr '\n' ' ')

echo "curl -X POST \"$SUPABASE_URL/rest/v1/rpc/exec\" \\"
echo "  -H \"apikey: $SERVICE_KEY\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"sql\": \"$SQL\"}'"
echo ""
echo "============================================"
echo "SQL file location: ./scripts/db-cleanup.sql"
echo "Migration file: ./supabase/migrations/0019_model_profiles_all_providers.sql"
echo "============================================"
