# グラフタブ 要件定義

## 概要
グラフタブでは、証拠・秘密・場所・人物のノードとそれらの関係（エッジ）を視覚的に管理し、ロジック（連結成分）ごとに整理する。React Flowを使用してインタラクティブなグラフビューを提供する。

## 機能要件

### 1. ノード追加機能

#### 1.1 通常のノード追加（ボタンから）
- **2段階UI**: 
  1. 「ノードを追加」ボタンをクリック → 種類選択（証拠 / 秘密 / 場所 / 人物）
  2. 選択した種類の既存要素一覧が表示され、既存要素を選択するか「新規作成」を選択
- **既存要素選択**: 既存の証拠・秘密・場所・人物から選択してノードを作成
- **新規作成**: 選択した種類の新規要素を作成し、同時にノードも作成

#### 1.2 ハンドルドラッグによるノード追加
- **ハンドルドラッグ**: ノードのハンドル（接続点）をキャンバスにドラッグしてドロップすると、種類選択モーダルが開く
- **自動接続**: ハンドルからドラッグした場合、新規ノードは自動的に接続元ノードとエッジで接続される
- **接続元の保持**: `connectFromSource` ステートで接続元ノードIDを保持し、ノード作成時にエッジも同時に作成

### 2. ノード表示

#### 2.1 ノードラベル
- **タイトル表示**: ノードはIDではなく、意味が分かるタイトルで表示する
  - 証拠: `evidence.name`（`evidence` が存在しない場合は `reference_id`）
  - 秘密: `secret.title || secret.description || reference_id`
  - 場所: `location.name`（`location` が存在しない場合は `reference_id`）
  - 人物: `character.name`（`character` が存在しない場合は `reference_id`）

#### 2.2 ノードの色
- **種類別の色**: ノードタイプごとに固定色を使用
  - 証拠: `#2563eb`（青）
  - 秘密: `#dc2626`（赤）
  - 場所: `#ea580c`（オレンジ）
  - 人物: `#7c3aed`（紫）
  - デフォルト: `#6b7280`（グレー）

#### 2.3 ハンドル（接続点）
- **表示位置**: ノード上部にターゲットハンドル、下部にソースハンドル
- **サイズ**: 16x16ピクセル、白色背景
- **機能**: ハンドルからドラッグして新規ノードを追加・接続可能

### 3. レイアウト・整列

#### 3.1 ロジックごとの階層整列
- **ロジック分離**: ノードはロジック（連結成分）ごとに横方向に分離して配置
- **階層構造**: 各ロジック内でノードを階層的に配置
  - 入エッジがないノード（ルート）をレベル0に配置
  - エッジに沿って階層を計算（BFS）
  - 各階層のノードは縦方向に配置

#### 3.2 分岐処理
- **分岐ノードの配置**: 複数の出エッジを持つノード（分岐ノード）は一番左の列（列0）に縦に並べる
- **非分岐ノード**: 分岐しないノードは分岐ノードの右側に横に並べる

#### 3.3 同階層の横並び
- **重なり防止**: 同じ階層のノードは重ならないように横に並べる
- **間隔**: ノード間の間隔は `W + GAP`（180 + 40 = 220ピクセル）
- **縦間隔**: 階層間の間隔は `H + GAP`（90 + 40 = 130ピクセル）

#### 3.4 整列ボタン
- **手動整列**: 「整列」ボタンを押したときのみレイアウトを適用する
- **動作**: `layoutRevision` をインクリメントしてレイアウトを再適用
- **ノード追加時**: ノード追加時は自動整列しない（既存ノードの位置を保持）

### 4. イベントグループ

#### 4.1 親子関係
- **親ノード**: イベントに属するノードは、親イベントノード（枠）内に子ノードとして表示される
- **親ノードの表示**: 
  - ID: `event_group_${eventId}`
  - ラベル: `イベント: ${event.title || eventId}`
  - スタイル: ダーク背景（`#1c2128`）、青い枠線（`3px solid #58a6ff`）
  - サイズ: 最小300x200ピクセル、子ノード数に応じて拡張

#### 4.2 子ノードの配置
- **グリッド配置**: イベントグループ内の子ノードは3列のグリッドに配置
- **位置計算**: `x = 20 + (idx % 3) * 160`, `y = 50 + Math.floor(idx / 3) * 80`
- **固定位置**: 子ノードは固定位置に配置され、ユーザーが動かした位置は失われる（仕様として受け入れる）

#### 4.3 一体化移動
- **親ノードのドラッグ**: 親イベントノードをドラッグすると、その中の子ノードも一緒に移動する
- **実装**: React Flowの `parentId` と `extent: "parent"` を使用

#### 4.4 子ノードの固定
- **ドラッグ無効**: イベントグループ内の子ノードは個別にドラッグできない（`draggable: false`）
- **理由**: 親ノードとの一体化を維持するため

#### 4.5 複数ノードのグループ化
- **自動グループ化**: 複数のノードが同じイベントに紐づく場合、それらすべてが同じ親イベントノード内に子ノードとして配置される
- **グループ計算**: `eventGroups` は `graphNodes` から `event_id` でグループ化して計算

#### 4.6 イベント追加機能
- **後から設定**: 既存のノードに後から `event_id` を設定できる
- **編集モーダル**: 各ノードの編集モーダルで `event_id` を設定・変更可能
- **構造変更**: 設定・変更時は、ノードをイベントグループ内に移動させる（構造変更として扱い、レイアウトを更新）
- **レイアウト更新**: `eventGroups` の変更を検知して、`layoutRevision` をインクリメントしてレイアウトを再適用

### 5. ノード編集

#### 5.1 クリックで編集
- **ノードクリック**: ノードをクリックすると、そのノードの種類に応じた編集モーダルが開く
- **モーダル対応表**:
  - 証拠ノード → `EditEvidenceModal`
  - 秘密ノード → `EditSecretModal`
  - 場所ノード → `EditLocationModal`
  - 人物ノード → `EditCharacterModal`

#### 5.2 イベントグループ親ノードのクリック
- **編集無効**: イベントグループの親ノード（枠）をクリックしても編集モーダルは開かない
- **判定**: `node.data.isEventGroup === true` または `node.data.node === null` の場合は編集モーダルを開かない

### 6. エッジ（接続）

#### 6.1 エッジの表示
- **ラベル非表示**: エッジの中間に「supports」などのラベルは表示しない
- **矢印**: エッジの終端に矢印（`MarkerType.ArrowClosed`）を表示
- **線の太さ**: 2ピクセル

#### 6.2 エッジの色分け
- **ロジックごとの色**: エッジはロジックごとに色分けされる
- **色の決定**: ソースノードのロジックIDから色を取得
  - ロジックに色が設定されている場合はその色を使用
  - 設定されていない場合は `hashColor(logicId)` でハッシュベースの色を生成
- **同じロジック内**: 同じロジック内のエッジは同じ色になる

#### 6.3 エッジの作成
- **手動接続**: ハンドル同士をドラッグして接続することでエッジを作成
- **自動接続**: ハンドルドラッグでノード追加時、自動的にエッジが作成される
- **API送信**: エッジ作成時は `/api/graph/edges` にPOSTリクエストを送信

### 7. ロジック詳細

#### 7.1 右クリックメニュー
- **右クリック**: ノードを右クリックすると、そのノードが属するロジックの詳細が表示される
- **モーダル表示**: ロジック詳細モーダルが開く

#### 7.2 ロジック詳細の内容
- **参照ID**: クリックしたノードの `reference_id` を表示
- **ロジック一覧**: 同じ `reference_id` を持つノードが属するすべてのロジックを表示
- **各ロジックの情報**:
  - ロジック名（編集可能）
  - ロジックの色（編集可能）
  - 詳細テキスト（編集可能、`logic_details[logicId]`）
  - このロジックに属するノード数
  - 関連事象（エッジで接続されているノード）

#### 7.3 ロジック管理
- **ロジック管理ボタン**: 「ロジック管理」ボタンで全ロジックの一覧を表示
- **ロジックの編集**: 各ロジックの名前と色を編集可能
- **ロジックの削除**: ロジックを削除可能（確認ダイアログ付き）

### 8. その他の機能

#### 8.1 グラフの更新
- **自動更新**: ノード・エッジの追加・編集・削除後、`refreshGraph` を呼び出してグラフデータを再取得
- **ロジック再計算**: グラフデータ更新後、`computeLogics` を呼び出してロジック（連結成分）を再計算

#### 8.2 ビュー操作
- **ズーム**: React FlowのControlsでズーム可能（ただし `showZoom={false}` で無効化されている）
- **フィットビュー**: `fitView` プロップでビューをフィット
- **ミニマップ**: ミニマップで全体を確認可能

## 技術要件

### データ構造

#### GraphNode
```typescript
{
  node_id: string;
  node_type: "Evidence" | "Secret" | "Location" | "Character";
  reference_id: string;
  event_id?: string;
  logic_details: Record<string, string>;
  logic_related_entities: Record<string, unknown>;
}
```

#### GraphEdge
```typescript
{
  edge_id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string;
}
```

#### Logic
```typescript
{
  logic_id: string;
  name: string;
  color?: string;
}
```

### React Flow ノード構造

#### 通常ノード
```typescript
{
  id: node.node_id,
  type: "custom",
  position: { x: number, y: number },
  data: {
    label: string,
    node: GraphNode,
    color: string,
    logicName?: string,
  }
}
```

#### イベントグループ親ノード
```typescript
{
  id: `event_group_${eventId}`,
  type: "custom",
  position: { x: number, y: number },
  data: {
    label: `イベント: ${event.title || eventId}`,
    node: null,
    color: string,
    isEventGroup: true,
    eventId: string,
  },
  width: number,
  height: number,
}
```

#### イベントグループ子ノード
```typescript
{
  id: node.node_id,
  type: "custom",
  position: { x: number, y: number },
  parentId: `event_group_${eventId}`,
  extent: "parent",
  draggable: false,
  data: {
    label: string,
    node: GraphNode,
    color: string,
    parentId: string,
    logicName?: string,
  }
}
```

### レイアウト管理

#### layoutRevision
- **目的**: レイアウト適用のバージョン管理
- **初期値**: 0
- **更新タイミング**:
  - 初期レイアウト適用時: `graphNodes.length > 0` かつ `hasInitialLayout.current === false` のとき
  - 整列ボタンクリック時: `layoutRevision` をインクリメント
  - イベントグループ変更時: `eventGroups` の変更を検知してインクリメント

#### 初期レイアウト
- **適用条件**: グラフデータが初めて読み込まれたとき（`graphNodes.length > 0` かつ `hasInitialLayout.current === false`）
- **動作**: `hasInitialLayout.current = true` に設定し、`layoutRevision` をインクリメント

#### 整列ボタン
- **動作**: `layoutRevision` をインクリメントしてレイアウトを再適用
- **処理**: `computeLogics()` → `fetchGraphData()` → `setLayoutRevision((r) => r + 1)`

#### ノード追加時
- **動作**: 既存ノードの位置を保持しつつ、新規ノードのみ追加（マージ）
- **実装**: `setNodes((nds) => { ... })` で既存ノードと新規ノードをマージ

#### イベントグループ変更時
- **検知**: `eventGroups` の変更を `useEffect` で検知
- **比較**: 前回の `eventGroups`（`prevEventGroups.current`）と現在の `eventGroups` を比較
- **変更検知**: イベントIDの追加・削除、または各イベント内のノード数の変更を検知
- **レイアウト更新**: 変更が検知された場合、`layoutRevision` をインクリメントしてレイアウトを再適用

### API エンドポイント

#### グラフデータ取得
- `GET /api/graph/nodes` - 全ノードを取得
- `GET /api/graph/edges` - 全エッジを取得

#### ロジック計算
- `POST /api/graph/compute-logics` - 連結成分を計算してロジックを生成

#### ノード操作
- `POST /api/graph/nodes` - ノードを作成
- `PUT /api/graph/nodes/:nodeId` - ノードを更新

#### エッジ操作
- `POST /api/graph/edges` - エッジを作成

#### ロジック操作
- `PUT /api/graph/logics/:logicId` - ロジックを更新
- `DELETE /api/graph/logics/:logicId` - ロジックを削除

## 実装上の注意点

### イベントグループ
- イベントグループへの移動は「構造変更」として扱い、明示的にレイアウトを更新する（整列ボタンとは別の処理）
- イベントグループの子ノードは固定位置（グリッド配置）に配置され、ユーザーが動かした位置は失われる（仕様として受け入れる）
- 編集モーダルで `event_id` を設定・変更した後、`refreshGraph` が呼ばれると、`eventGroups` が再計算され、変更が検知されてレイアウトが更新される

### ノードクリック
- ノードクリック時は `node.data.node`（`GraphNode`）を直接使用
- イベントグループ親ノード（`data.node` が `null` または `data.isEventGroup === true`）の場合は編集モーダルを開かない

### レイアウト計算
- `logicLayout` は `useMemo` で計算され、`graphNodes`、`graphEdges`、`nodeToLogic` に依存
- 階層計算はBFS（幅優先探索）で実装
- 分岐ノードの判定は出エッジ数（`outDeg`）が1より大きいかで判定

### パフォーマンス
- `toRFNodes` と `toRFEdges` は `useMemo` でメモ化
- `eventGroups` は `useMemo` でメモ化
- 不要な再レンダリングを避けるため、依存配列を適切に設定
