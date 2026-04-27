#!/bin/sh
cat > config.local.js << EOF
window.HINT_BOARD_CONFIG = {
  ...window.HINT_BOARD_CONFIG,
  SUPABASE_PUBLISH_KEY: "${SUPABASE_PUBLISH_KEY}",
  ADMIN_CODE: "${ADMIN_CODE}"
};
EOF
