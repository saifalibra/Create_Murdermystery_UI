# マーダーミステリーシナリオ生成

GPS / Bluetooth 接触データなどを入力に、マーダーミステリーシナリオを生成するシステムです。  
仕様は `マーダーミステリーシナリオ生成.docx` を参照してください。

## 構成

- **Backend**: Python 3.10+ / FastAPI
- **Frontend**: React 18 + TypeScript + Vite

## セットアップ

### 1. バックエンド

```bash
cd backend
python -m venv .venv
```

**Windows (PowerShell)**:
```powershell
.\.venv\Scripts\Activate.ps1
```
※ 「スクリプトの実行が無効です」と出る場合:  
`Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` を一度実行してから再度 Activate。

**Windows (cmd)**:
```cmd
.venv\Scripts\activate.bat
```

**macOS / Linux**:
```bash
source .venv/bin/activate
```

その後:
```bash
pip install -r requirements.txt
```

必要なら `.env` をプロジェクトルートに作成（`backend/.env` やルートの `backend` 実行時用）。

```bash
# .env 例
DEBUG=false
```

### 2. フロントエンド

```bash
cd frontend
npm install
```

グラフタブ（ドラッグ可能なノードエディタ）は `@xyflow/react` を使用しています。`npm install` で自動的に入ります。未インストールの場合は `npm install @xyflow/react` を実行してください。

## 起動

**バックエンド**（別ターミナル）:

```bash
cd backend
.\.venv\Scripts\Activate.ps1   # PowerShell
# .venv\Scripts\activate.bat   # cmd
# source .venv/bin/activate    # macOS / Linux
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**cmd で一括起動**（安定しやすい）:
```cmd
run-backend.bat
```

**PowerShell で一括起動**:
```powershell
.\run-backend.ps1
```

**フロントエンド**:

```bash
cd frontend
npm run dev
```

- フロント: http://localhost:5173  
- API docs: http://localhost:8000/docs  
- API ヘルス: http://localhost:8000/health  

フロントの開発サーバーは `/api`, `/docs`, `/health` をバックエンド (8000) にプロキシします。

## API 概要

| プレフィックス | 内容 |
|----------------|------|
| `/api/scenarios` | シナリオ設定 (ScenarioConfig) |
| `/api/characters` | キャラクター |
| `/api/locations` | 場所 |
| `/api/events` | イベント |
| `/api/evidence` | 証拠 |
| `/api/secrets` | 秘密 |
| `/api/claims` | 主張・否認 |
| `/api/timeline` | キャラクター別タイムライン |
| `/api/graph` | グラフ（ノード・エッジ） |
| `/api/validation` | タイムライン・グラフ・犯人整合性チェック |
| `/api/import` | CSV 取り込み（Bluetooth 接触など） |

## 今後の拡張

- GPS / Bluetooth CSV のパース実装（`backend/app/services/import_service.py`）
- タイムライン→イベント変換、妥当性検証の実装
- 犯人推論・PromptPack 生成（`inference_service`）
- LLM 連携（GM用・公開用・キャラクターシート出力）
- ダッシュボード UI（シナリオ・キャラ・タイムライン・グラフ編集）
- データの永続化（JSON / DB）

## トラブルシューティング

- **PowerShell で `モジュール '.venv' を読み込むことができませんでした`**  
  - **cmd で `run-backend.bat`** を使うと安定することが多い。  
  - または `.venv\Scripts\activate` ではなく **`.\.venv\Scripts\Activate.ps1`** を使う。  
  - または **`.\run-backend.ps1`** で起動（venv を activate せずそのまま uvicorn を実行）。
- **「スクリプトの実行が無効です」**  
  - `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` を実行してから再度試す。
- **`pip install` で "No matching distribution found"**  
  - `python -m pip install --upgrade pip` のあと再実行  
  - 社内プロキシの場合は `pip config set global.proxy ...` などで設定
- **バックエンド起動で `ModuleNotFoundError: app`**  
  - `uvicorn` は **`backend` ディレクトリで**実行してください（`app` がカレントになるよう）

## ライセンス

プロジェクトに従ってください。
