#!/bin/bash
set -e

# ============================================================
# cert-gen entrypoint.sh
# 自動簽發 mb3admin.com 的 CA 根憑證與主機憑證
# 當憑證不存在、即將過期（≤30天）或已過期時，自動重新生成
# ============================================================

CERT_DIR="/certs"
WORK_DIR="/tmp/sign-work"
SIGN_DIR="/sign"

# 輸出路徑
CA_DIR="$CERT_DIR/ca"
HOST_DIR="$CERT_DIR/host"
CA_CERT="$CA_DIR/cacert.pem"
CA_KEY="$CA_DIR/cakey.pem"
HOST_CERT="$HOST_DIR/mb3admin.com.crt"
HOST_KEY="$HOST_DIR/mb3admin.com.key"

# 最終給 nginx / emby 使用的路徑
NGINX_CERT="$CERT_DIR/cert.crt"
NGINX_KEY="$CERT_DIR/cert.key"
CA_BUNDLE="$CERT_DIR/ca-certificates.crt"

# 參數
CA_VALIDITY_DAYS=7300
HOST_VALIDITY_DAYS=3650
RENEW_THRESHOLD_DAYS=30
HOSTNAME="mb3admin.com"

# ============================================================
# 函數：檢查憑證是否需要更新
# 返回 0 = 需要更新, 1 = 不需要
# ============================================================
need_renew() {
    local cert_file="$1"

    # 檔案不存在 → 需要生成
    if [ ! -f "$cert_file" ]; then
        echo "[INFO] 憑證不存在: $cert_file"
        return 0
    fi

    # 檢查是否在 RENEW_THRESHOLD_DAYS 天內過期
    if ! openssl x509 -checkend $((RENEW_THRESHOLD_DAYS * 86400)) -noout -in "$cert_file" 2>/dev/null; then
        local expiry
        expiry=$(openssl x509 -enddate -noout -in "$cert_file" 2>/dev/null | cut -d= -f2)
        echo "[INFO] 憑證即將過期或已過期: $cert_file (到期日: $expiry)"
        return 0
    fi

    local expiry
    expiry=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
    echo "[OK] 憑證有效: $cert_file (到期日: $expiry)"
    return 1
}

# ============================================================
# 步驟 1: CA 根憑證
# ============================================================
generate_ca() {
    echo ""
    echo "========================================"
    echo " 生成 CA 根憑證"
    echo "========================================"

    mkdir -p "$CA_DIR"

    # 建立工作目錄（模擬 selfsign_ca.sh 的 demoCA 結構）
    mkdir -p "$WORK_DIR/demoCA/private" "$WORK_DIR/demoCA/newcerts"
    touch "$WORK_DIR/demoCA/index.txt"
    echo "01" > "$WORK_DIR/demoCA/serial"

    echo "[STEP] 生成 CA 根密鑰..."
    openssl genrsa -out "$WORK_DIR/demoCA/private/cakey.pem" 2048

    echo "[STEP] 自簽發 CA 根憑證..."
    openssl req -new -x509 \
        -key "$WORK_DIR/demoCA/private/cakey.pem" \
        -out "$WORK_DIR/demoCA/cacert.pem" \
        -days "$CA_VALIDITY_DAYS" \
        -config "$SIGN_DIR/root.conf" \
        -batch

    # 複製到輸出目錄
    cp "$WORK_DIR/demoCA/cacert.pem" "$CA_CERT"
    cp "$WORK_DIR/demoCA/private/cakey.pem" "$CA_KEY"

    echo "[DONE] CA 根憑證已生成: $CA_CERT"
}

# ============================================================
# 步驟 2: 主機憑證
# ============================================================
generate_host_cert() {
    echo ""
    echo "========================================"
    echo " 簽發主機憑證: $HOSTNAME"
    echo "========================================"

    mkdir -p "$HOST_DIR"

    # 確保 demoCA 結構存在（使用最新的 CA）
    mkdir -p "$WORK_DIR/demoCA/private" "$WORK_DIR/demoCA/newcerts"
    cp "$CA_CERT" "$WORK_DIR/demoCA/cacert.pem"
    cp "$CA_KEY" "$WORK_DIR/demoCA/private/cakey.pem"

    # 重置 index 和 serial（避免重複簽發衝突）
    : > "$WORK_DIR/demoCA/index.txt"
    echo "01" > "$WORK_DIR/demoCA/serial"

    local host_dir="$WORK_DIR/$HOSTNAME"
    mkdir -p "$host_dir"

    echo "[STEP] 生成主機 RSA 密鑰..."
    openssl genrsa -out "$host_dir/$HOSTNAME.key" 2048

    echo "[STEP] 生成主機憑證請求 (CSR)..."
    openssl req -new \
        -key "$host_dir/$HOSTNAME.key" \
        -out "$host_dir/$HOSTNAME.csr" \
        -config "$SIGN_DIR/server.conf" \
        -batch

    echo "[STEP] 使用 CA 簽發主機憑證..."
    openssl ca \
        -in "$host_dir/$HOSTNAME.csr" \
        -out "$host_dir/$HOSTNAME.crt" \
        -days "$HOST_VALIDITY_DAYS" \
        -extensions x509_ext \
        -extfile "$SIGN_DIR/server.conf" \
        -config <(cat <<EOF
[ ca ]
default_ca = CA_default

[ CA_default ]
dir               = $WORK_DIR/demoCA
certs             = \$dir
new_certs_dir     = \$dir/newcerts
database          = \$dir/index.txt
serial            = \$dir/serial
certificate       = \$dir/cacert.pem
private_key       = \$dir/private/cakey.pem
default_md        = sha256
default_days      = $HOST_VALIDITY_DAYS
policy            = policy_anything

[ policy_anything ]
countryName             = optional
stateOrProvinceName     = optional
localityName            = optional
organizationName        = optional
organizationalUnitName  = optional
commonName              = supplied
emailAddress            = optional
EOF
        ) \
        -batch

    # 複製到輸出目錄
    cp "$host_dir/$HOSTNAME.crt" "$HOST_CERT"
    cp "$host_dir/$HOSTNAME.key" "$HOST_KEY"

    echo "[DONE] 主機憑證已簽發: $HOST_CERT"
}

# ============================================================
# 步驟 3: 產生信任清單和 nginx 用憑證
# ============================================================
generate_bundles() {
    echo ""
    echo "========================================"
    echo " 產生信任清單與 nginx 憑證"
    echo "========================================"

    # 產生包含自簽 CA 的 ca-certificates.crt
    # 合併系統憑證 + 自簽 CA
    if [ -f /etc/ssl/certs/ca-certificates.crt ]; then
        cat /etc/ssl/certs/ca-certificates.crt "$CA_CERT" > "$CA_BUNDLE"
    else
        cp "$CA_CERT" "$CA_BUNDLE"
    fi
    echo "[DONE] CA 信任清單已產生: $CA_BUNDLE"

    # 產生 nginx 使用的 cert.crt（包含主機憑證 + CA 憑證鏈）
    cat "$HOST_CERT" "$CA_CERT" > "$NGINX_CERT"
    cp "$HOST_KEY" "$NGINX_KEY"
    echo "[DONE] Nginx 憑證已產生: $NGINX_CERT, $NGINX_KEY"
}

# ============================================================
# 主流程
# ============================================================
echo "========================================"
echo " cert-gen: 自動憑證簽發服務"
echo " $(date)"
echo "========================================"

mkdir -p "$CERT_DIR" "$WORK_DIR"
cd "$WORK_DIR"

CA_RENEWED=false
HOST_RENEWED=false

# 檢查並生成 CA
if need_renew "$CA_CERT"; then
    generate_ca
    CA_RENEWED=true
fi

# 若 CA 已更新，主機憑證也需要重新簽發
if [ "$CA_RENEWED" = true ] || need_renew "$HOST_CERT"; then
    generate_host_cert
    HOST_RENEWED=true
fi

# 若有任何憑證更新，重新生成 bundles
if [ "$CA_RENEWED" = true ] || [ "$HOST_RENEWED" = true ]; then
    generate_bundles
else
    # 確保 bundles 至少存在
    if [ ! -f "$CA_BUNDLE" ] || [ ! -f "$NGINX_CERT" ]; then
        generate_bundles
    fi
fi

# 清理工作目錄
rm -rf "$WORK_DIR"

echo ""
echo "========================================"
echo " cert-gen: 完成！"
echo "========================================"
echo " CA 憑證:      $CA_CERT"
echo " 主機憑證:     $HOST_CERT"
echo " Nginx 憑證:   $NGINX_CERT"
echo " CA 信任清單:  $CA_BUNDLE"
echo "========================================"
