import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnConnect,
} from '@xyflow/react';
import './App.css';

type NodeKind =
  | 'source'
  | 'workspace'
  | 'process'
  | 'check'
  | 'branch'
  | 'storage'
  | 'note';

type ActionKind =
  | '取得'
  | '移動'
  | '圧縮'
  | '解凍'
  | '加工'
  | 'リネーム'
  | '確認'
  | '分岐'
  | '格納'
  | '保留'
  | '戻し'
  | '完了';

type SaveMode = 'off' | 'session' | 'local';

type FlowNodeData = {
  [key: string]: unknown;
  label: string;
  kind: NodeKind;
  action: ActionKind;
  memo: string;
};

type FlowEdgeData = {
  [key: string]: unknown;
  action: ActionKind;
  memo: string;
};

type FlowNode = Node<FlowNodeData, 'flowCard'>;
type FlowEdge = Edge<FlowEdgeData>;

type NodeTemplate = {
  kind: NodeKind;
  title: string;
  action: ActionKind;
  description: string;
  icon: string;
};

const STORAGE_KEY_SESSION = 'pathless-map-session-draft';
const STORAGE_KEY_LOCAL = 'pathless-map-local-draft';

const ACTIONS: ActionKind[] = [
  '取得',
  '移動',
  '圧縮',
  '解凍',
  '加工',
  'リネーム',
  '確認',
  '分岐',
  '格納',
  '保留',
  '戻し',
  '完了',
];

const NODE_KIND_LABELS: Record<NodeKind, string> = {
  source: '取得元',
  workspace: '作業場所',
  process: '加工工程',
  check: '確認',
  branch: '分岐',
  storage: '格納先',
  note: '注意点',
};

const NODE_TEMPLATES: NodeTemplate[] = [
  {
    kind: 'source',
    title: '取得元',
    action: '取得',
    description: 'ファイルが来る場所',
    icon: '↓',
  },
  {
    kind: 'workspace',
    title: '作業場所',
    action: '移動',
    description: '端末A・作業場所Xなど',
    icon: '□',
  },
  {
    kind: 'process',
    title: '加工工程',
    action: '加工',
    description: '解凍・加工・リネームなど',
    icon: '◇',
  },
  {
    kind: 'check',
    title: '確認ポイント',
    action: '確認',
    description: '確認・照合・判断',
    icon: '✓',
  },
  {
    kind: 'branch',
    title: '分岐ポイント',
    action: '分岐',
    description: 'OK / NG / 保留など',
    icon: 'Y',
  },
  {
    kind: 'storage',
    title: '格納先',
    action: '格納',
    description: '最終格納・一時保管',
    icon: '■',
  },
  {
    kind: 'note',
    title: '注意点',
    action: '保留',
    description: '覚えにくい点・例外',
    icon: '!',
  },
];

const DEFAULT_NODES: FlowNode[] = [
  {
    id: 'node-source',
    type: 'flowCard',
    position: { x: 20, y: 80 },
    data: {
      label: '取得元A',
      kind: 'source',
      action: '取得',
      memo: '例：共有クラウド、チャット、作業場所など。実名は入れない。',
    },
  },
  {
    id: 'node-workspace',
    type: 'flowCard',
    position: { x: 280, y: 80 },
    data: {
      label: '作業場所X',
      kind: 'workspace',
      action: '移動',
      memo: '例：端末A、作業場所X。実端末名や実パスは入れない。',
    },
  },
  {
    id: 'node-branch',
    type: 'flowCard',
    position: { x: 540, y: 80 },
    data: {
      label: '分岐ポイント',
      kind: 'branch',
      action: '分岐',
      memo: 'OKなら格納、NGなら確認へ戻す、など。',
    },
  },
  {
    id: 'node-storage',
    type: 'flowCard',
    position: { x: 800, y: 80 },
    data: {
      label: '格納先Y',
      kind: 'storage',
      action: '格納',
      memo: '例：最終格納先、一時保管先。実フォルダ名は入れない。',
    },
  },
];

const DEFAULT_EDGES: FlowEdge[] = [
  {
    id: 'edge-source-workspace',
    source: 'node-source',
    target: 'node-workspace',
    type: 'smoothstep',
    label: '取得',
    data: {
      action: '取得',
      memo: '',
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
    style: {
      strokeWidth: 2.4,
    },
  },
  {
    id: 'edge-workspace-branch',
    source: 'node-workspace',
    target: 'node-branch',
    type: 'smoothstep',
    label: '加工',
    data: {
      action: '加工',
      memo: '',
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
    style: {
      strokeWidth: 2.4,
    },
  },
  {
    id: 'edge-branch-storage',
    source: 'node-branch',
    target: 'node-storage',
    type: 'smoothstep',
    label: '格納 / OKの場合',
    data: {
      action: '格納',
      memo: 'OKの場合',
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
    style: {
      strokeWidth: 2.4,
    },
  },
];

function FlowCardNode({ data, selected }: NodeProps<FlowNode>) {
  return (
    <div className={`flow-node flow-node--${data.kind} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="flow-handle" />

      <div className="flow-node__top">
        <span>{NODE_KIND_LABELS[data.kind]}</span>
        <em>{data.action}</em>
      </div>

      <strong>{data.label}</strong>

      {data.memo && <p>{data.memo}</p>}

      <Handle type="source" position={Position.Right} className="flow-handle" />
    </div>
  );
}

function getStorage(mode: SaveMode): Storage | null {
  if (mode === 'session') {
    return window.sessionStorage;
  }

  if (mode === 'local') {
    return window.localStorage;
  }

  return null;
}

function getStorageKey(mode: SaveMode): string {
  return mode === 'session' ? STORAGE_KEY_SESSION : STORAGE_KEY_LOCAL;
}

function scanSensitiveText(values: string[]): string[] {
  const text = values.join('\n');
  const warnings: string[] = [];

  const checks = [
    {
      label: 'Windowsパスらしき文字',
      pattern: /[a-zA-Z]:\\/,
    },
    {
      label: '共有パスらしき文字',
      pattern: /\\\\/,
    },
    {
      label: 'URLらしき文字',
      pattern: /https?:\/\//i,
    },
    {
      label: 'メールアドレス・メンションらしき文字',
      pattern: /\S+@\S+/,
    },
    {
      label: '実ファイル名らしき拡張子',
      pattern: /\.(csv|xlsx?|zip|txt|pdf|docx?|pptx?|json|log|bat|sh)\b/i,
    },
    {
      label: 'IPアドレスらしき文字',
      pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
    },
    {
      label: '長い識別子らしき文字',
      pattern: /\b[A-Za-z0-9_-]{24,}\b/,
    },
  ];

  checks.forEach((check) => {
    if (check.pattern.test(text)) {
      warnings.push(check.label);
    }
  });

  return Array.from(new Set(warnings));
}

function App() {
  const [nodes, setNodes] = useState<FlowNode[]>(DEFAULT_NODES);
  const [edges, setEdges] = useState<FlowEdge[]>(DEFAULT_EDGES);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('node-source');
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [saveMode, setSaveMode] = useState<SaveMode>('off');
  const [noticeOpen, setNoticeOpen] = useState(true);
  const [statusMessage, setStatusMessage] = useState(
    '保存OFF：この画面の内容は自動保存されません。',
  );

  const nodeTypes = useMemo(
    () => ({
      flowCard: FlowCardNode,
    }),
    [],
  );

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );

  const securityWarnings = useMemo(() => {
    const nodeValues = nodes.flatMap((node) => [
      node.data.label,
      node.data.memo,
      node.data.action,
      node.data.kind,
    ]);

    const edgeValues = edges.flatMap((edge) => [
      String(edge.label ?? ''),
      edge.data?.action ?? '',
      edge.data?.memo ?? '',
    ]);

    return scanSensitiveText([...nodeValues, ...edgeValues].map(String));
  }, [nodes, edges]);

  const hasSecurityWarnings = securityWarnings.length > 0;

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    setNodes((currentNodes) => applyNodeChanges(changes, currentNodes));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<FlowEdge>[]) => {
    setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));
  }, []);

  const onConnect: OnConnect = useCallback((connection: Connection) => {
    const action: ActionKind = '移動';

    setEdges((currentEdges) =>
      addEdge(
        {
          ...connection,
          id: `edge-${Date.now()}`,
          type: 'smoothstep',
          label: action,
          data: {
            action,
            memo: '',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          style: {
            strokeWidth: 2.4,
          },
        },
        currentEdges,
      ),
    );
  }, []);

  const addNode = (template: NodeTemplate) => {
    const timestamp = Date.now();
    const newNode: FlowNode = {
      id: `node-${template.kind}-${timestamp}`,
      type: 'flowCard',
      position: {
        x: 90 + nodes.length * 34,
        y: 150 + nodes.length * 26,
      },
      data: {
        label: template.title,
        kind: template.kind,
        action: template.action,
        memo: template.description,
      },
    };

    setNodes((currentNodes) => [...currentNodes, newNode]);
    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(null);
  };

  const updateNodeData = (nodeId: string, patch: Partial<FlowNodeData>) => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            ...patch,
          },
        };
      }),
    );
  };

  const updateEdgeData = (edgeId: string, patch: Partial<FlowEdgeData>) => {
    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        if (edge.id !== edgeId) {
          return edge;
        }

        const nextData: FlowEdgeData = {
          action: edge.data?.action ?? '移動',
          memo: edge.data?.memo ?? '',
          ...patch,
        };

        return {
          ...edge,
          data: nextData,
          label: nextData.memo ? `${nextData.action} / ${nextData.memo}` : nextData.action,
        };
      }),
    );
  };

  const removeSelected = () => {
    if (selectedNodeId) {
      setNodes((currentNodes) => currentNodes.filter((node) => node.id !== selectedNodeId));
      setEdges((currentEdges) =>
        currentEdges.filter(
          (edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId,
        ),
      );
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      return;
    }

    if (selectedEdgeId) {
      setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== selectedEdgeId));
      setSelectedEdgeId(null);
    }
  };

  const saveDraft = useCallback(() => {
    if (saveMode === 'off') {
      setStatusMessage('保存OFF：保存する場合は「一時保存」か「端末保存」を選んでください。');
      return;
    }

    if (hasSecurityWarnings) {
      setStatusMessage('NG入力の可能性があります。抽象名に置き換えるまで保存しません。');
      return;
    }

    const storage = getStorage(saveMode);
    if (!storage) {
      return;
    }

    const payload = JSON.stringify({
      nodes,
      edges,
      savedAt: new Date().toISOString(),
    });

    storage.setItem(getStorageKey(saveMode), payload);

    setStatusMessage(
      saveMode === 'session'
        ? '一時保存しました。ブラウザを閉じると消える可能性があります。'
        : 'この端末に保存しました。共有端末では使わないでください。',
    );
  }, [edges, hasSecurityWarnings, nodes, saveMode]);

  const loadDraft = () => {
    if (saveMode === 'off') {
      setStatusMessage('読み込み先を「一時保存」か「端末保存」に変更してください。');
      return;
    }

    const storage = getStorage(saveMode);
    const raw = storage?.getItem(getStorageKey(saveMode));

    if (!raw) {
      setStatusMessage('読み込める保存データがありません。');
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        nodes?: FlowNode[];
        edges?: FlowEdge[];
      };

      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        throw new Error('Invalid draft format');
      }

      setNodes(parsed.nodes);
      setEdges(parsed.edges);
      setSelectedNodeId(parsed.nodes[0]?.id ?? null);
      setSelectedEdgeId(null);
      setStatusMessage('保存データを読み込みました。');
    } catch {
      setStatusMessage('保存データの読み込みに失敗しました。');
    }
  };

  const resetMap = () => {
    const ok = window.confirm('現在のマップを初期状態に戻し、保存データも削除します。');

    if (!ok) {
      return;
    }

    window.sessionStorage.removeItem(STORAGE_KEY_SESSION);
    window.localStorage.removeItem(STORAGE_KEY_LOCAL);
    setNodes(DEFAULT_NODES);
    setEdges(DEFAULT_EDGES);
    setSelectedNodeId('node-source');
    setSelectedEdgeId(null);
    setSaveMode('off');
    setStatusMessage('初期状態に戻しました。保存データも削除済みです。');
  };

  useEffect(() => {
    if (saveMode === 'off' || hasSecurityWarnings) {
      return;
    }

    const storage = getStorage(saveMode);

    if (!storage) {
      return;
    }

    const payload = JSON.stringify({
      nodes,
      edges,
      savedAt: new Date().toISOString(),
    });

    storage.setItem(getStorageKey(saveMode), payload);
  }, [edges, hasSecurityWarnings, nodes, saveMode]);

  return (
    <main className="app-shell">
      {noticeOpen && (
        <div className="notice-backdrop" role="dialog" aria-modal="true">
          <section className="notice-card">
            <p className="notice-kicker">Pathless Map 起動前の確認</p>
            <h1>機密情報を入力しないでください</h1>
            <p>
              このアプリは、実際の端末名・ファイル名・フォルダパス・URL・顧客名・個人名などを
              入力しない前提のファイル導線整理ツールです。
            </p>
            <div className="notice-ng">
              NG：実パス / 実ファイル名 / 実端末名 / 実チャンネル名 / URL / 顧客名
            </div>
            <div className="notice-ok">
              OK：端末A / 作業場所X / ファイル種別A / 共有クラウド / 確認ポイント
            </div>
            <button className="primary-button" onClick={() => setNoticeOpen(false)}>
              理解しました。抽象名のみで作成する
            </button>
          </section>
        </div>
      )}

      <header className="hero">
        <div>
          <p className="eyebrow">Pathless Map</p>
          <h1>機密を入れないファイル導線整理ツール</h1>
          <p>
            パーツを置く。工程を選ぶ。矢印でつなぐ。
            具体名を持たない、目にやさしい回路図デモ。
          </p>
        </div>

        <div className={`risk-panel ${hasSecurityWarnings ? 'danger' : 'safe'}`}>
          <span>{hasSecurityWarnings ? '注意' : '安全寄り'}</span>
          <strong>{hasSecurityWarnings ? 'NG入力の可能性あり' : '抽象入力チェック OK'}</strong>
        </div>
      </header>

      <section className="security-strip">
        <div>
          <strong>入力ルール</strong>
          <span>実パス・実ファイル名・端末名・URL・顧客名・個人名は入力しない。</span>
        </div>
        <button onClick={() => setNoticeOpen(true)}>注意を再表示</button>
      </section>

      {hasSecurityWarnings && (
        <section className="warning-box">
          <strong>機密情報に近い文字が含まれている可能性があります。</strong>
          <ul>
            {securityWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="workspace">
        <aside className="parts-panel">
          <div className="panel-heading">
            <p>Parts</p>
            <h2>パーツ追加</h2>
          </div>

          <div className="parts-list">
            {NODE_TEMPLATES.map((template) => (
              <button
                className="part-button"
                key={template.kind}
                onClick={() => addNode(template)}
              >
                <span>{template.icon}</span>
                <div>
                  <strong>{template.title}</strong>
                  <small>{template.description}</small>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="flow-card">
          <div className="flow-toolbar">
            <div>
              <strong>Flow Canvas</strong>
              <span>丸い接続点をドラッグして矢印を作成</span>
            </div>

            <button
              className="ghost-button"
              onClick={removeSelected}
              disabled={!selectedNodeId && !selectedEdgeId}
            >
              選択中を削除
            </button>
          </div>

          <div className="flow-area">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => {
                setSelectedNodeId(node.id);
                setSelectedEdgeId(null);
              }}
              onEdgeClick={(_, edge) => {
                setSelectedEdgeId(edge.id);
                setSelectedNodeId(null);
              }}
              onPaneClick={() => {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
              }}
              fitView
            >
              <Background color="#b8cbc6" gap={18} />
              <Controls position="bottom-left" />
              <MiniMap pannable zoomable nodeStrokeWidth={3} position="bottom-right" />
            </ReactFlow>
          </div>
        </section>

        <aside className="edit-panel">
          <div className="panel-heading">
            <p>Edit</p>
            <h2>詳細編集</h2>
          </div>

          {!selectedNode && !selectedEdge && (
            <div className="empty-edit">
              パーツまたは矢印をタップすると、ここで内容を編集できます。
            </div>
          )}

          {selectedNode && (
            <div className="edit-form">
              <label>
                抽象名
                <input
                  value={selectedNode.data.label}
                  onChange={(event) =>
                    updateNodeData(selectedNode.id, {
                      label: event.target.value,
                    })
                  }
                  placeholder="例：作業場所X"
                />
              </label>

              <label>
                種別
                <select
                  value={selectedNode.data.kind}
                  onChange={(event) =>
                    updateNodeData(selectedNode.id, {
                      kind: event.target.value as NodeKind,
                    })
                  }
                >
                  {NODE_TEMPLATES.map((template) => (
                    <option key={template.kind} value={template.kind}>
                      {template.title}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                主な工程
                <select
                  value={selectedNode.data.action}
                  onChange={(event) =>
                    updateNodeData(selectedNode.id, {
                      action: event.target.value as ActionKind,
                    })
                  }
                >
                  {ACTIONS.map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                メモ
                <textarea
                  value={selectedNode.data.memo}
                  onChange={(event) =>
                    updateNodeData(selectedNode.id, {
                      memo: event.target.value,
                    })
                  }
                  rows={5}
                  placeholder="実名ではなく、抽象化して記録"
                />
              </label>
            </div>
          )}

          {selectedEdge && (
            <div className="edit-form">
              <label>
                矢印の工程
                <select
                  value={selectedEdge.data?.action ?? '移動'}
                  onChange={(event) =>
                    updateEdgeData(selectedEdge.id, {
                      action: event.target.value as ActionKind,
                    })
                  }
                >
                  {ACTIONS.map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                分岐・補足メモ
                <textarea
                  value={selectedEdge.data?.memo ?? ''}
                  onChange={(event) =>
                    updateEdgeData(selectedEdge.id, {
                      memo: event.target.value,
                    })
                  }
                  rows={5}
                  placeholder="例：OKの場合 / NGなら確認へ戻す"
                />
              </label>
            </div>
          )}

          <div className="storage-box">
            <label>
              保存モード
              <select
                value={saveMode}
                onChange={(event) => {
                  const nextMode = event.target.value as SaveMode;
                  setSaveMode(nextMode);

                  if (nextMode === 'off') {
                    setStatusMessage('保存OFF：この画面の内容は自動保存されません。');
                  }

                  if (nextMode === 'session') {
                    setStatusMessage(
                      '一時保存：ブラウザ内に一時保存します。機密は入力しないでください。',
                    );
                  }

                  if (nextMode === 'local') {
                    setStatusMessage(
                      '端末保存：この端末に残ります。共有端末では使わないでください。',
                    );
                  }
                }}
              >
                <option value="off">保存OFF</option>
                <option value="session">一時保存</option>
                <option value="local">端末保存</option>
              </select>
            </label>

            <div className="storage-actions">
              <button onClick={saveDraft}>保存</button>
              <button onClick={loadDraft}>読み込み</button>
              <button className="danger-button" onClick={resetMap}>
                全削除
              </button>
            </div>

            <p>{statusMessage}</p>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;