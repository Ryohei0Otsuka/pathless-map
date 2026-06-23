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
  | 'decision'
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
  | '判定'
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
  action: string;
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

type FileRoute = {
  id: string;
  label: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
};

type TaskMap = {
  id: string;
  title: string;
  summary: string;
  activeFileId: string;
  files: FileRoute[];
};

type ConnectMode = {
  sourceId: string;
  label: string;
};

const STORAGE_KEY_SESSION = 'pathless-map-session-draft-v2';
const STORAGE_KEY_LOCAL = 'pathless-map-local-draft-v2';

const ACTIONS: ActionKind[] = [
  '取得',
  '移動',
  '圧縮',
  '解凍',
  '加工',
  'リネーム',
  '確認',
  '判定',
  '格納',
  '保留',
  '戻し',
  '完了',
];

const EDGE_LABELS = [
  '取得',
  '移動',
  '圧縮',
  '解凍',
  '加工',
  'リネーム',
  '確認',
  'OK',
  'NG',
  '保留',
  '戻し',
  '格納',
  '完了',
];

const NODE_KIND_LABELS: Record<NodeKind, string> = {
  source: '取得元',
  workspace: '作業場所',
  process: '処理',
  check: '確認',
  decision: '判定',
  storage: '格納先',
  note: 'メモ',
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
    title: '処理',
    action: '加工',
    description: '解凍・加工・リネームなど',
    icon: '◇',
  },
  {
    kind: 'check',
    title: '確認',
    action: '確認',
    description: '確認・照合・見直し',
    icon: '✓',
  },
  {
    kind: 'decision',
    title: '判定',
    action: '判定',
    description: 'OK / NG / 保留に分ける',
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
    title: 'メモ',
    action: '保留',
    description: '覚えにくい点・例外',
    icon: '!',
  },
];

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEdge(source: string, target: string, label: string, memo = ''): FlowEdge {
  return {
    id: createId('edge'),
    source,
    target,
    type: 'smoothstep',
    label: memo ? `${label} / ${memo}` : label,
    data: {
      action: label,
      memo,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
    style: {
      strokeWidth: 2.4,
    },
  };
}

function createStarterFile(label: string): FileRoute {
  const prefix = createId('flow');

  const sourceId = `${prefix}-source`;
  const workspaceId = `${prefix}-workspace`;
  const decisionId = `${prefix}-decision`;
  const storageId = `${prefix}-storage`;

  return {
    id: createId('file'),
    label,
    nodes: [
      {
        id: sourceId,
        type: 'flowCard',
        position: { x: 20, y: 90 },
        data: {
          label: '取得元A',
          kind: 'source',
          action: '取得',
          memo: '例：共有クラウド、チャット、作業場所など。実名は入れない。',
        },
      },
      {
        id: workspaceId,
        type: 'flowCard',
        position: { x: 280, y: 90 },
        data: {
          label: '作業場所X',
          kind: 'workspace',
          action: '移動',
          memo: '例：端末A、作業場所X。実端末名や実パスは入れない。',
        },
      },
      {
        id: decisionId,
        type: 'flowCard',
        position: { x: 540, y: 90 },
        data: {
          label: '加工結果の判定',
          kind: 'decision',
          action: '判定',
          memo: 'OKなら格納、NGなら確認へ戻す、保留ならメモへ。',
        },
      },
      {
        id: storageId,
        type: 'flowCard',
        position: { x: 820, y: 90 },
        data: {
          label: '格納先Y',
          kind: 'storage',
          action: '格納',
          memo: '例：最終格納先、一時保管先。実フォルダ名は入れない。',
        },
      },
    ],
    edges: [
      createEdge(sourceId, workspaceId, '取得'),
      createEdge(workspaceId, decisionId, '加工'),
      createEdge(decisionId, storageId, 'OK', '格納'),
    ],
  };
}

function createTask(title: string): TaskMap {
  const firstFile = createStarterFile('ファイル種別A');

  return {
    id: createId('task'),
    title,
    summary: 'このタスクで扱うファイル導線を抽象化して整理する。',
    activeFileId: firstFile.id,
    files: [firstFile],
  };
}

const INITIAL_TASKS: TaskMap[] = [createTask('タスクA')];

function FlowCardNode({ data, selected }: NodeProps<FlowNode>) {
  return (
    <div className={`flow-node flow-node--${data.kind} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="flow-handle" />

      <div className="flow-node__top">
        <span>{NODE_KIND_LABELS[data.kind]}</span>
        <em>{data.action}</em>
      </div>

      <strong>{data.label}</strong>

      {data.kind === 'decision' && (
        <div className="decision-preview" aria-label="判定ルート">
          <span>OK</span>
          <span>NG</span>
          <span>保留</span>
        </div>
      )}

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
  const [tasks, setTasks] = useState<TaskMap[]>(INITIAL_TASKS);
  const [activeTaskId, setActiveTaskId] = useState(INITIAL_TASKS[0].id);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    INITIAL_TASKS[0].files[0].nodes[0].id,
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [saveMode, setSaveMode] = useState<SaveMode>('off');
  const [noticeOpen, setNoticeOpen] = useState(true);
  const [connectMode, setConnectMode] = useState<ConnectMode | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    '保存OFF：この画面の内容は自動保存されません。',
  );

  const nodeTypes = useMemo(
    () => ({
      flowCard: FlowCardNode,
    }),
    [],
  );

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) ?? tasks[0],
    [activeTaskId, tasks],
  );

  const activeFile = useMemo(() => {
    return (
      activeTask.files.find((file) => file.id === activeTask.activeFileId) ??
      activeTask.files[0]
    );
  }, [activeTask]);

  const nodes = activeFile.nodes;
  const edges = activeFile.edges;

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );

  const securityWarnings = useMemo(() => {
    const values = tasks.flatMap((task) => [
      task.title,
      task.summary,
      ...task.files.flatMap((file) => [
        file.label,
        ...file.nodes.flatMap((node) => [
          node.data.label,
          node.data.memo,
          node.data.action,
          node.data.kind,
        ]),
        ...file.edges.flatMap((edge) => [
          String(edge.label ?? ''),
          edge.data?.action ?? '',
          edge.data?.memo ?? '',
        ]),
      ]),
    ]);

    return scanSensitiveText(values.map(String));
  }, [tasks]);

  const hasSecurityWarnings = securityWarnings.length > 0;

  const updateActiveTask = (patch: Partial<TaskMap>) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === activeTaskId
          ? {
              ...task,
              ...patch,
            }
          : task,
      ),
    );
  };

  const updateActiveFile = (updater: (file: FileRoute) => FileRoute) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== activeTaskId) {
          return task;
        }

        return {
          ...task,
          files: task.files.map((file) =>
            file.id === task.activeFileId ? updater(file) : file,
          ),
        };
      }),
    );
  };

  const switchTask = (taskId: string) => {
    const nextTask = tasks.find((task) => task.id === taskId);

    if (!nextTask) {
      return;
    }

    const nextFile =
      nextTask.files.find((file) => file.id === nextTask.activeFileId) ??
      nextTask.files[0];

    setActiveTaskId(taskId);
    setSelectedNodeId(nextFile.nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
    setConnectMode(null);
  };

  const addTask = () => {
    const nextTask = createTask(`タスク${tasks.length + 1}`);
    setTasks((currentTasks) => [...currentTasks, nextTask]);
    setActiveTaskId(nextTask.id);
    setSelectedNodeId(nextTask.files[0].nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
    setConnectMode(null);
    setStatusMessage('新しいタスクを追加しました。');
  };

  const removeActiveTask = () => {
    if (tasks.length <= 1) {
      setStatusMessage('タスクは最低1つ必要です。');
      return;
    }

    const ok = window.confirm('現在のタスクを削除します。');

    if (!ok) {
      return;
    }

    const remainingTasks = tasks.filter((task) => task.id !== activeTaskId);
    const nextTask = remainingTasks[0];
    const nextFile = nextTask.files[0];

    setTasks(remainingTasks);
    setActiveTaskId(nextTask.id);
    setSelectedNodeId(nextFile.nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
    setConnectMode(null);
    setStatusMessage('タスクを削除しました。');
  };

  const switchFile = (fileId: string) => {
    const nextFile = activeTask.files.find((file) => file.id === fileId);

    if (!nextFile) {
      return;
    }

    updateActiveTask({
      activeFileId: fileId,
    });

    setSelectedNodeId(nextFile.nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
    setConnectMode(null);
  };

  const addFile = () => {
    const nextFile = createStarterFile(`ファイル種別${activeTask.files.length + 1}`);

    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== activeTaskId) {
          return task;
        }

        return {
          ...task,
          activeFileId: nextFile.id,
          files: [...task.files, nextFile],
        };
      }),
    );

    setSelectedNodeId(nextFile.nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
    setConnectMode(null);
    setStatusMessage('このタスクにファイル導線を追加しました。');
  };

  const removeActiveFile = () => {
    if (activeTask.files.length <= 1) {
      setStatusMessage('ファイル導線は最低1つ必要です。');
      return;
    }

    const ok = window.confirm('現在のファイル導線を削除します。');

    if (!ok) {
      return;
    }

    const remainingFiles = activeTask.files.filter((file) => file.id !== activeFile.id);
    const nextFile = remainingFiles[0];

    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== activeTaskId) {
          return task;
        }

        return {
          ...task,
          activeFileId: nextFile.id,
          files: remainingFiles,
        };
      }),
    );

    setSelectedNodeId(nextFile.nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
    setConnectMode(null);
    setStatusMessage('ファイル導線を削除しました。');
  };

  const renameActiveFile = (label: string) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== activeTaskId) {
          return task;
        }

        return {
          ...task,
          files: task.files.map((file) =>
            file.id === task.activeFileId
              ? {
                  ...file,
                  label,
                }
              : file,
          ),
        };
      }),
    );
  };

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      updateActiveFile((file) => ({
        ...file,
        nodes: applyNodeChanges(changes, file.nodes),
      }));
    },
    [activeTaskId],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      updateActiveFile((file) => ({
        ...file,
        edges: applyEdgeChanges(changes, file.edges),
      }));
    },
    [activeTaskId],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const action = '移動';

      updateActiveFile((file) => ({
        ...file,
        edges: addEdge(createEdge(connection.source ?? '', connection.target ?? '', action), file.edges),
      }));
    },
    [activeTaskId],
  );

  const addNode = (template: NodeTemplate) => {
    const newNode: FlowNode = {
      id: createId(`node-${template.kind}`),
      type: 'flowCard',
      position: {
        x: 90 + nodes.length * 34,
        y: 160 + nodes.length * 28,
      },
      data: {
        label: template.title,
        kind: template.kind,
        action: template.action,
        memo: template.description,
      },
    };

    updateActiveFile((file) => ({
      ...file,
      nodes: [...file.nodes, newNode],
    }));

    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(null);
    setConnectMode(null);
  };

  const updateNodeData = (nodeId: string, patch: Partial<FlowNodeData>) => {
    updateActiveFile((file) => ({
      ...file,
      nodes: file.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                ...patch,
              },
            }
          : node,
      ),
    }));
  };

  const updateEdgeData = (edgeId: string, patch: Partial<FlowEdgeData>) => {
    updateActiveFile((file) => ({
      ...file,
      edges: file.edges.map((edge) => {
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
    }));
  };

  const connectNodes = (sourceId: string, targetId: string, label: string) => {
    if (sourceId === targetId) {
      setStatusMessage('同じパーツ同士は接続できません。');
      return;
    }

    updateActiveFile((file) => ({
      ...file,
      edges: [...file.edges, createEdge(sourceId, targetId, label)],
    }));

    setConnectMode(null);
    setSelectedNodeId(targetId);
    setSelectedEdgeId(null);
    setStatusMessage(`「${label}」で接続しました。`);
  };

  const addDecisionRoute = (routeLabel: 'OK' | 'NG' | '保留') => {
    if (!selectedNode) {
      return;
    }

    const routeIndex = edges.filter((edge) => edge.source === selectedNode.id).length;

    const routeSettings: Record<
      'OK' | 'NG' | '保留',
      {
        kind: NodeKind;
        action: ActionKind;
        label: string;
        memo: string;
      }
    > = {
      OK: {
        kind: 'storage',
        action: '格納',
        label: 'OK先',
        memo: '問題なければ次へ進む。',
      },
      NG: {
        kind: 'check',
        action: '戻し',
        label: 'NG時の確認',
        memo: '不備があれば確認・戻しを行う。',
      },
      保留: {
        kind: 'note',
        action: '保留',
        label: '保留メモ',
        memo: '判断を止める理由や確認待ちを残す。',
      },
    };

    const setting = routeSettings[routeLabel];

    const newNode: FlowNode = {
      id: createId(`node-${setting.kind}`),
      type: 'flowCard',
      position: {
        x: selectedNode.position.x + 300,
        y: selectedNode.position.y + routeIndex * 150,
      },
      data: {
        label: setting.label,
        kind: setting.kind,
        action: setting.action,
        memo: setting.memo,
      },
    };

    updateActiveFile((file) => ({
      ...file,
      nodes: [...file.nodes, newNode],
      edges: [...file.edges, createEdge(selectedNode.id, newNode.id, routeLabel)],
    }));

    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(null);
    setConnectMode(null);
    setStatusMessage(`判定から「${routeLabel}」ルートを追加しました。`);
  };

  const removeSelected = () => {
    if (selectedNodeId) {
      updateActiveFile((file) => ({
        ...file,
        nodes: file.nodes.filter((node) => node.id !== selectedNodeId),
        edges: file.edges.filter(
          (edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId,
        ),
      }));

      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setConnectMode(null);
      return;
    }

    if (selectedEdgeId) {
      updateActiveFile((file) => ({
        ...file,
        edges: file.edges.filter((edge) => edge.id !== selectedEdgeId),
      }));

      setSelectedEdgeId(null);
      setConnectMode(null);
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
      tasks,
      activeTaskId,
      savedAt: new Date().toISOString(),
    });

    storage.setItem(getStorageKey(saveMode), payload);

    setStatusMessage(
      saveMode === 'session'
        ? '一時保存しました。ブラウザを閉じると消える可能性があります。'
        : 'この端末に保存しました。共有端末では使わないでください。',
    );
  }, [activeTaskId, hasSecurityWarnings, saveMode, tasks]);

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
        tasks?: TaskMap[];
        activeTaskId?: string;
      };

      if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
        throw new Error('Invalid draft format');
      }

      const nextTaskId = parsed.activeTaskId ?? parsed.tasks[0].id;
      const nextTask = parsed.tasks.find((task) => task.id === nextTaskId) ?? parsed.tasks[0];
      const nextFile =
        nextTask.files.find((file) => file.id === nextTask.activeFileId) ?? nextTask.files[0];

      setTasks(parsed.tasks);
      setActiveTaskId(nextTask.id);
      setSelectedNodeId(nextFile.nodes[0]?.id ?? null);
      setSelectedEdgeId(null);
      setConnectMode(null);
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

    const nextTasks = [createTask('タスクA')];

    setTasks(nextTasks);
    setActiveTaskId(nextTasks[0].id);
    setSelectedNodeId(nextTasks[0].files[0].nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
    setSaveMode('off');
    setConnectMode(null);
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
      tasks,
      activeTaskId,
      savedAt: new Date().toISOString(),
    });

    storage.setItem(getStorageKey(saveMode), payload);
  }, [activeTaskId, hasSecurityWarnings, saveMode, tasks]);

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
            タスクを分ける。ファイルごとに導線を見る。
            判定で分けて、矢印でつなぐ、目にやさしい回路図デモ。
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

      <section className="task-board">
        <div className="tabs-row">
          <div className="tabs-scroll">
            {tasks.map((task) => (
              <button
                key={task.id}
                className={`tab-button ${task.id === activeTaskId ? 'is-active' : ''}`}
                onClick={() => switchTask(task.id)}
              >
                {task.title}
              </button>
            ))}
          </div>

          <button className="add-tab-button" onClick={addTask}>
            ＋タスク
          </button>
        </div>

        <div className="task-meta">
          <label>
            タスク名
            <input
              value={activeTask.title}
              onChange={(event) => updateActiveTask({ title: event.target.value })}
              placeholder="例：日次処理"
            />
          </label>

          <label>
            タスクメモ
            <input
              value={activeTask.summary}
              onChange={(event) => updateActiveTask({ summary: event.target.value })}
              placeholder="このタスクで整理する流れ"
            />
          </label>

          <button className="danger-outline-button" onClick={removeActiveTask}>
            タスク削除
          </button>
        </div>
      </section>

      <section className="file-board">
        <div className="file-tabs">
          <div className="tabs-scroll">
            {activeTask.files.map((file) => (
              <button
                key={file.id}
                className={`file-tab ${file.id === activeFile.id ? 'is-active' : ''}`}
                onClick={() => switchFile(file.id)}
              >
                {file.label}
              </button>
            ))}
          </div>

          <button className="add-tab-button" onClick={addFile}>
            ＋ファイル
          </button>
        </div>

        <div className="file-meta">
          <label>
            ファイル導線名
            <input
              value={activeFile.label}
              onChange={(event) => renameActiveFile(event.target.value)}
              placeholder="例：ファイル種別A"
            />
          </label>

          <button className="danger-outline-button" onClick={removeActiveFile}>
            ファイル導線削除
          </button>
        </div>
      </section>

      {connectMode && (
        <section className="connect-hint">
          <strong>接続モード中</strong>
          <span>
            接続先のパーツをタップすると「{connectMode.label}」で矢印を作ります。
          </span>
          <button onClick={() => setConnectMode(null)}>キャンセル</button>
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
              <span>
                PCは接続点ドラッグ。スマホはパーツ選択後「次につなぐ」。
              </span>
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
                if (connectMode) {
                  connectNodes(connectMode.sourceId, node.id, connectMode.label);
                  return;
                }

                setSelectedNodeId(node.id);
                setSelectedEdgeId(null);
              }}
              onEdgeClick={(_, edge) => {
                setSelectedEdgeId(edge.id);
                setSelectedNodeId(null);
                setConnectMode(null);
              }}
              onPaneClick={() => {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
                setConnectMode(null);
              }}
              fitView
            >
              <Background color="#bed2cd" gap={22} />
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
              <div className="selected-card">
                <span>{NODE_KIND_LABELS[selectedNode.data.kind]}</span>
                <strong>{selectedNode.data.label}</strong>
              </div>

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
                      action:
                        event.target.value === 'decision'
                          ? '判定'
                          : selectedNode.data.action,
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

              <div className="node-actions">
                <button
                  onClick={() =>
                    setConnectMode({
                      sourceId: selectedNode.id,
                      label: selectedNode.data.kind === 'decision' ? 'OK' : selectedNode.data.action,
                    })
                  }
                >
                  次につなぐ
                </button>
              </div>

              {selectedNode.data.kind === 'decision' && (
                <div className="decision-actions">
                  <p>判定ルートを追加</p>
                  <button onClick={() => addDecisionRoute('OK')}>OKルート</button>
                  <button onClick={() => addDecisionRoute('NG')}>NGルート</button>
                  <button onClick={() => addDecisionRoute('保留')}>保留ルート</button>
                </div>
              )}
            </div>
          )}

          {selectedEdge && (
            <div className="edit-form">
              <div className="selected-card">
                <span>矢印</span>
                <strong>{String(selectedEdge.label ?? '工程')}</strong>
              </div>

              <label>
                矢印の工程・ルート
                <select
                  value={selectedEdge.data?.action ?? '移動'}
                  onChange={(event) =>
                    updateEdgeData(selectedEdge.id, {
                      action: event.target.value,
                    })
                  }
                >
                  {EDGE_LABELS.map((action) => (
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