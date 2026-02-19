#!/bin/bash
# 確保腳本在出錯時不會中斷容器啟動，但會輸出錯誤訊息
set -e

echo "[Custom-Init] Starting certificate installation..."

# 定義來源與目標路徑
SOURCE_CA="/mnt/certs/ca-certificates.crt"
TARGET_SYS_CA="/etc/ssl/certs/ca-certificates.crt"
TARGET_EMBY_CA="/app/emby/etc/ssl/certs/ca-certificates.crt"

if [ -f "$SOURCE_CA" ]; then
    echo "[Custom-Init] Found CA certificate at $SOURCE_CA"
    
    # 複製到系統證書目錄
    echo "[Custom-Init] Copying to $TARGET_SYS_CA..."
    cp "$SOURCE_CA" "$TARGET_SYS_CA"
    chmod 644 "$TARGET_SYS_CA"
    
    # 複製到 Emby 內部證書目錄
    # 注意：需確保目標目錄存在
    if [ -d "$(dirname "$TARGET_EMBY_CA")" ]; then
        echo "[Custom-Init] Copying to $TARGET_EMBY_CA..."
        cp "$SOURCE_CA" "$TARGET_EMBY_CA"
        chmod 644 "$TARGET_EMBY_CA"
    else
        echo "[Custom-Init] Warning: Target directory for Emby CA not found: $(dirname "$TARGET_EMBY_CA")"
    fi
    
    echo "[Custom-Init] Certificate installation complete."
else
    echo "[Custom-Init] Warning: Source CA certificate not found at $SOURCE_CA"
    echo "[Custom-Init] This is expected on first run if cert-gen hasn't finished yet, but cert-gen should run before emby starts."
fi
