#!/bin/bash

# Скрипт для регистрации MAX webhook
# Использование: ./register-webhook.sh

# Замени эти значения на свои:
MAX_BOT_TOKEN="<твой-токен-бота>"
WEBHOOK_URL="https://<твой-vercel-домен>/api/max-webhook"

echo "🔗 Регистрирую webhook в MAX..."
echo "URL: $WEBHOOK_URL"
echo ""

response=$(curl -s -w "\n%{http_code}" -X POST https://platform-api.max.ru/subscriptions \
  -H "Authorization: $MAX_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"$WEBHOOK_URL\",
    \"events\": [\"message\"]
  }")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "HTTP Status: $http_code"
echo "Response: $body"

if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
  echo "✅ Webhook успешно зарегистрирован!"
else
  echo "❌ Ошибка регистрации webhook"
fi
