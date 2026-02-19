# 思路

**偽造一個 emby 授權回應網站，瞞騙 emby 服務端程式取得 Emby Premiere 資格**

具體原理分析查閱：https://imrbq.cn/exp/emby_hack.html

本專案是按文章所述方法，使用 Docker Compose 編排整合
以實現簡單一鍵部署

1. **自動證書生成**：集成 `cert-gen` 容器，首次運行時自動生成所需的自簽名 CA 和偽造證書。
2. **零配置部署**：通過目錄掛載和初始化腳本，自動將證書注入到 Emby 容器，無需手動操作檔。

<img src="https://github.com/fejich/docker-embyhack/raw/main/working.jpg">

---

# 使用方法


### 1）拉取本專案相關檔
```
git clone https://github.com/fejich/docker-embyhack.git && cd docker-embyhack
```


### 2）(可選) 修改 docker-compose.yml
`embyhack/docker-compose.yml` 已經通過自動化腳本進行了優化，通常無需修改。

主要改動說明：
- **Cert-Gen 服務**：新增了 `cert-gen` 服務，負責在啟動時檢查並生成證書。
- **Nginx 服務**：掛載 `certs` 目錄，自動使用生成的證書。
- **Emby 服務**：
    - 掛載 `certs` 目錄到 `/mnt/certs`。
    - 掛載 `emby-init` 腳本，在容器啟動時自動將 CA 證書安裝到系統信任區。

### 3）運行命令 docker-compose 命令一鍵部署
```
cd embyhack
docker-compose up -d
```
首次啟動時：
1. `cert-gen` 會生成證書到 `embyhack/certs` 目錄。
2. `nginx` 啟動並載入證書。
3. `emby` 啟動，執行初始化腳本安裝證書，然後正常運行。

### 4) Windows 使用注意
如果您在 Windows 上使用 Docker Desktop，請確保使用 WSL 2 後端，否則 `/dev/dri` (硬體解碼) 映射可能會導致錯誤。如果不使用硬體解碼，可在 `docker-compose.yml` 中註解掉 `devices` 區塊。
