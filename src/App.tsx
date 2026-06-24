import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  getSmoothStepPath,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type OnConnect,
} from '@xyflow/react';
import './App.css';

type NodeKind =
  | 'source'
  | 'device'
  | 'operation'
  | 'tool'
  | 'folder'
  | 'split'
  | 'service'
  | 'storage'
  | 'memo';

type ActionKind =
  | '取得'
  | '移動'
  | '圧縮'
  | '解凍'
  | '加工'
  | 'リネーム'
  | 'ツール使用'
  | 'フォルダ作成'
  | '分岐'
  | '格納'
  | '戻し'
  | '保留'
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

type FlowNode = Node<FlowNodeData, 'routeCard'>;
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

type EditModalAnchor = {
  x: number;
  y: number;
  width: number;
  maxHeight: number;
  placement: 'above' | 'below';
};

const STORAGE_KEY_SESSION = 'pathless-map-session-draft-v8';
const STORAGE_KEY_LOCAL = 'pathless-map-local-draft-v8';

const ACTIONS: ActionKind[] = [
  '取得',
  '移動',
  '圧縮',
  '解凍',
  '加工',
  'リネーム',
  'ツール使用',
  'フォルダ作成',
  '分岐',
  '格納',
  '戻し',
  '保留',
  '完了',
];

const ROUTE_LABELS = [
  '取得',
  '移動',
  '圧縮',
  '解凍',
  '加工',
  'リネーム',
  'ツール使用',
  'フォルダ作成',
  '分岐',
  'ルートA',
  'ルートB',
  '格納先A',
  '格納先B',
  '別ファイル生成',
  '再加工',
  '戻し',
  '保留',
  '格納',
  '完了',
];

const SPLIT_ROUTE_LABELS = [
  'ルートA',
  'ルートB',
  '格納先A',
  '格納先B',
  '別ファイル生成',
  '再加工',
  '戻し',
  '保留',
] as const;

type SplitRouteLabel = (typeof SPLIT_ROUTE_LABELS)[number];

const NODE_KIND_LABELS: Record<NodeKind, string> = {
  source: '取得元',
  device: '端末・場所',
  operation: '工程',
  tool: 'ツール',
  folder: 'フォルダ作成',
  split: '分岐',
  service: '一般サービス',
  storage: '格納先',
  memo: 'メモ',
};

const NODE_TEMPLATES: NodeTemplate[] = [
  {
    kind: 'source',
    title: '取得元',
    action: '取得',
    description: 'ファイルが来る起点',
    icon: 'IN',
  },
  {
    kind: 'device',
    title: '端末・場所',
    action: '移動',
    description: '端末A・作業場所Xなど',
    icon: 'PC',
  },
  {
    kind: 'operation',
    title: '工程',
    action: '加工',
    description: '圧縮・解凍・加工など',
    icon: 'OP',
  },
  {
    kind: 'tool',
    title: 'ツール使用',
    action: 'ツール使用',
    description: 'ツールAで処理する',
    icon: 'TL',
  },
  {
    kind: 'folder',
    title: 'フォルダ作成',
    action: 'フォルダ作成',
    description: '格納前に抽象フォルダを作る',
    icon: 'FD',
  },
  {
    kind: 'split',
    title: '分岐',
    action: '分岐',
    description: 'ルートが分かれる地点',
    icon: 'Y',
  },
  {
    kind: 'service',
    title: '一般サービス',
    action: '移動',
    description: 'Slack / SharePoint など',
    icon: 'SV',
  },
  {
    kind: 'storage',
    title: '格納先',
    action: '格納',
    description: '最終格納・一時保管',
    icon: 'OUT',
  },
  {
    kind: 'memo',
    title: 'メモ',
    action: '保留',
    description: '補足・注意・例外',
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
    type: 'route',
    label: memo ? `${label} / ${memo}` : label,
    data: {
      action: label,
      memo,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
  };
}

function createStarterFile(label: string): FileRoute {
  const prefix = createId('flow');

  const sourceId = `${prefix}-source`;
  const deviceId = `${prefix}-device`;
  const operationId = `${prefix}-operation`;
  const toolId = `${prefix}-tool`;
  const folderId = `${prefix}-folder`;
  const serviceId = `${prefix}-service`;
  const storageId = `${prefix}-storage`;

  return {
    id: createId('file'),
    label,
    nodes: [
      {
        id: sourceId,
        type: 'routeCard',
        position: { x: 20, y: 100 },
        data: {
          label: '取得元A',
          kind: 'source',
          action: '取得',
          memo: 'どこからファイルを取得するか。実名は入れない。',
        },
      },
      {
        id: deviceId,
        type: 'routeCard',
        position: { x: 270, y: 100 },
        data: {
          label: '端末A',
          kind: 'device',
          action: '移動',
          memo: '作業する端末・場所。実端末名や実パスは入れない。',
        },
      },
      {
        id: operationId,
        type: 'routeCard',
        position: { x: 520, y: 100 },
        data: {
          label: '工程A',
          kind: 'operation',
          action: '加工',
          memo: '圧縮・解凍・加工・リネームなど。',
        },
      },
      {
        id: toolId,
        type: 'routeCard',
        position: { x: 770, y: 100 },
        data: {
          label: 'ツールA',
          kind: 'tool',
          action: 'ツール使用',
          memo: '処理に使うツール。実ツール名が機密の場合は抽象化する。',
        },
      },
      {
        id: folderId,
        type: 'routeCard',
        position: { x: 1020, y: 100 },
        data: {
          label: 'フォルダ作成A',
          kind: 'folder',
          action: 'フォルダ作成',
          memo: '格納前に抽象フォルダを作成する。実フォルダ名や実パスは入れない。',
        },
      },
      {
        id: serviceId,
        type: 'routeCard',
        position: { x: 1270, y: 100 },
        data: {
          label: '一般サービスA',
          kind: 'service',
          action: '移動',
          memo: 'Slack / SharePoint など。格納・共有に近い経由先として扱う。',
        },
      },
      {
        id: storageId,
        type: 'routeCard',
        position: { x: 1520, y: 100 },
        data: {
          label: '格納先Y',
          kind: 'storage',
          action: '格納',
          memo: 'どこへ格納するか。実パスは入れない。',
        },
      },
    ],
    edges: [
      createEdge(sourceId, deviceId, '取得'),
      createEdge(deviceId, operationId, '移動'),
      createEdge(operationId, toolId, '加工'),
      createEdge(toolId, folderId, 'ツール使用'),
      createEdge(folderId, serviceId, 'フォルダ作成'),
      createEdge(serviceId, storageId, '格納'),
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

function RouteNode(props: NodeProps<FlowNode>) {
  const data = props.data as FlowNodeData;
  const selected = props.selected;

  return (
    <div className={`route-node route-node--${data.kind} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="route-handle route-handle--target" />

      <div className="route-node__top">
        <span>{NODE_KIND_LABELS[data.kind]}</span>
        <em>{data.action}</em>
      </div>

      <strong>{data.label}</strong>

      {data.kind === 'split' && (
        <div className="split-preview" aria-label="分岐ルート">
          <span>ルートA</span>
          <span>格納先B</span>
          <span>戻し</span>
        </div>
      )}

      {data.memo && <p>{data.memo}</p>}

      <Handle type="source" position={Position.Right} className="route-handle route-handle--source" />
    </div>
  );
}

function RouteEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    data,
    label,
    selected,
  } = props;

  const edgeData = data as FlowEdgeData | undefined;
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 18,
  });

  const edgeLabel = edgeData?.memo
    ? `${edgeData.action} / ${edgeData.memo}`
    : edgeData?.action ?? String(label ?? '');

  return (
    <>
      <path
        id={id}
        d={edgePath}
        className={`react-flow__edge-path route-edge-path ${selected ? 'is-selected' : ''}`}
        markerEnd={markerEnd}
      />

      <circle r="4" className="route-particle">
        <animateMotion dur="2.2s" repeatCount="indefinite" path={edgePath} />
      </circle>

      <circle r="3" className="route-particle route-particle--soft">
        <animateMotion dur="2.2s" repeatCount="indefinite" begin="0.72s" path={edgePath} />
      </circle>

      <circle r="3" className="route-particle route-particle--soft">
        <animateMotion dur="2.2s" repeatCount="indefinite" begin="1.44s" path={edgePath} />
      </circle>

      <EdgeLabelRenderer>
        <div
          className="route-edge-label"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {edgeLabel}
        </div>
      </EdgeLabelRenderer>
    </>
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

function buildRouteSummaries(file: FileRoute): string[] {
  const nodeMap = new Map(file.nodes.map((node) => [node.id, node]));
  const outgoingMap = new Map<string, FlowEdge[]>();
  const incomingCount = new Map<string, number>();

  file.nodes.forEach((node) => {
    outgoingMap.set(node.id, []);
    incomingCount.set(node.id, 0);
  });

  file.edges.forEach((edge) => {
    outgoingMap.set(edge.source, [...(outgoingMap.get(edge.source) ?? []), edge]);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  });

  const startNodes = file.nodes.filter(
    (node) => node.data.kind === 'source' || (incomingCount.get(node.id) ?? 0) === 0,
  );

  const summaries: string[] = [];

  const walk = (nodeId: string, routeText: string, visited: Set<string>) => {
    const node = nodeMap.get(nodeId);

    if (!node) {
      return;
    }

    const outgoing = outgoingMap.get(nodeId) ?? [];

    if (outgoing.length === 0 || visited.has(nodeId)) {
      summaries.push(routeText);
      return;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);

    outgoing.forEach((edge) => {
      const targetNode = nodeMap.get(edge.target);

      if (!targetNode) {
        summaries.push(routeText);
        return;
      }

      const edgeLabel = edge.data?.memo
        ? `${edge.data.action} / ${edge.data.memo}`
        : edge.data?.action ?? '移動';

      walk(
        targetNode.id,
        `${routeText} --${edgeLabel}→ ${targetNode.data.label}`,
        nextVisited,
      );
    });
  };

  startNodes.forEach((node) => {
    walk(node.id, node.data.label, new Set<string>());
  });

  return summaries.length > 0 ? summaries.slice(0, 12) : ['まだ導線がありません。'];
}

const INITIAL_TASKS: TaskMap[] = [createTask('タスクA')];

function App() {
  const [tasks, setTasks] = useState<TaskMap[]>(INITIAL_TASKS);
  const [activeTaskId, setActiveTaskId] = useState(INITIAL_TASKS[0].id);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    INITIAL_TASKS[0].files[0].nodes[0].id,
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [saveMode, setSaveMode] = useState<SaveMode>('off');
  const flowCardRef = useRef<HTMLElement | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalAnchor, setEditModalAnchor] = useState<EditModalAnchor | null>(null);
  const [connectMode, setConnectMode] = useState<ConnectMode | null>(null);
  const [insertKind, setInsertKind] = useState<NodeKind>('operation');
  const [statusMessage, setStatusMessage] = useState(
    '保存OFF：この画面の内容は自動保存されません。',
  );

  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      routeCard: RouteNode,
    }),
    [],
  );

  const edgeTypes = useMemo<EdgeTypes>(
    () => ({
      route: RouteEdge,
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

  const selectedNodeOutgoingCount = selectedNode
    ? edges.filter((edge) => edge.source === selectedNode.id).length
    : 0;

  const selectedNodeCanStartRoute =
    !!selectedNode &&
    (selectedNode.data.kind === 'split' || selectedNodeOutgoingCount === 0);

  const routeSummaries = useMemo(() => buildRouteSummaries(activeFile), [activeFile]);

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

  const openEditModalAt = (event?: { clientX: number; clientY: number }) => {
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const isMobile = window.matchMedia('(max-width: 720px)').matches;

    if (isMobile) {
      const margin = 10;
      const width = Math.min(360, Math.max(280, viewportWidth - margin * 2));
      const maxHeight = Math.max(320, viewportHeight - margin * 2);
      const left = viewportLeft + Math.max(margin, (viewportWidth - width) / 2);
      const top = viewportTop + margin;

      setEditModalAnchor({
        x: left,
        y: top,
        width,
        maxHeight,
        placement: 'below',
      });
      setEditModalOpen(true);
      return;
    }

    if (!event) {
      setEditModalAnchor(null);
      setEditModalOpen(true);
      return;
    }

    const margin = 14;
    const gap = 12;
    const width = Math.min(480, Math.max(300, viewportWidth - margin * 2));
    const maxHeight = Math.min(560, Math.max(320, viewportHeight - margin * 2));

    const left = viewportLeft + Math.min(
      Math.max(event.clientX - width / 2, margin),
      Math.max(margin, viewportWidth - width - margin),
    );

    const canShowAbove = event.clientY - maxHeight - gap >= margin;
    const placement: EditModalAnchor['placement'] = canShowAbove ? 'above' : 'below';
    const preferredTop = canShowAbove
      ? event.clientY - maxHeight - gap
      : event.clientY + gap;
    const top = viewportTop + Math.min(
      Math.max(preferredTop, margin),
      Math.max(margin, viewportHeight - maxHeight - margin),
    );

    setEditModalAnchor({ x: left, y: top, width, maxHeight, placement });
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
  };

  const canCreateOutgoingFrom = (sourceId: string) => {
    const sourceNode = nodes.find((node) => node.id === sourceId);

    if (!sourceNode) {
      return false;
    }

    if (sourceNode.data.kind === 'split') {
      return true;
    }

    const outgoingCount = edges.filter((edge) => edge.source === sourceId).length;
    return outgoingCount === 0;
  };

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
    setEditModalOpen(false);
    setConnectMode(null);
  };

  const addTask = () => {
    const nextTask = createTask(`タスク${tasks.length + 1}`);
    setTasks((currentTasks) => [...currentTasks, nextTask]);
    setActiveTaskId(nextTask.id);
    setSelectedNodeId(nextTask.files[0].nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
    setEditModalOpen(false);
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
    setEditModalOpen(false);
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
    setEditModalOpen(false);
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
    setEditModalOpen(false);
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
    setEditModalOpen(false);
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

  const onNodesChange = (changes: NodeChange<FlowNode>[]) => {
    updateActiveFile((file) => ({
      ...file,
      nodes: applyNodeChanges(changes, file.nodes),
    }));
  };

  const onEdgesChange = (changes: EdgeChange<FlowEdge>[]) => {
    updateActiveFile((file) => ({
      ...file,
      edges: applyEdgeChanges(changes, file.edges),
    }));
  };

  const onConnect: OnConnect = (connection: Connection) => {
    const sourceId = connection.source;
    const targetId = connection.target;

    if (!sourceId || !targetId) {
      return;
    }

    if (sourceId === targetId) {
      setStatusMessage('同じパーツ同士は接続できません。');
      return;
    }

    if (!canCreateOutgoingFrom(sourceId)) {
      setStatusMessage('通常パーツから出せる導線は1本までです。複数ルートにしたい場合は「分岐」を使ってください。');
      return;
    }

    const alreadyConnected = edges.some(
      (edge) => edge.source === sourceId && edge.target === targetId,
    );

    if (alreadyConnected) {
      setStatusMessage('そのパーツ同士はすでに接続されています。');
      return;
    }

    updateActiveFile((file) => ({
      ...file,
      edges: addEdge(createEdge(sourceId, targetId, '移動'), file.edges),
    }));

    setStatusMessage('導線を追加しました。');
  };

  const addNode = (template: NodeTemplate) => {
    const newNode: FlowNode = {
      id: createId(`node-${template.kind}`),
      type: 'routeCard',
      position: {
        x: 90 + nodes.length * 34,
        y: 170 + nodes.length * 28,
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
    setEditModalOpen(true);
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

    if (!canCreateOutgoingFrom(sourceId)) {
      setStatusMessage('通常パーツから出せる導線は1本までです。複数ルートにしたい場合は「分岐」を使ってください。');
      setConnectMode(null);
      return;
    }

    const alreadyConnected = edges.some(
      (edge) => edge.source === sourceId && edge.target === targetId,
    );

    if (alreadyConnected) {
      setStatusMessage('そのパーツ同士はすでに接続されています。');
      setConnectMode(null);
      return;
    }

    updateActiveFile((file) => ({
      ...file,
      edges: [...file.edges, createEdge(sourceId, targetId, label)],
    }));

    setConnectMode(null);
    setSelectedNodeId(targetId);
    setSelectedEdgeId(null);
    setEditModalOpen(true);
    setStatusMessage(`「${label}」で接続しました。`);
  };

  const addSplitRoute = (routeLabel: SplitRouteLabel) => {
    if (!selectedNode) {
      return;
    }

    if (selectedNode.data.kind !== 'split') {
      setStatusMessage('複数ルートを作る場合は「分岐」パーツを選んでください。');
      return;
    }

    const routeIndex = edges.filter((edge) => edge.source === selectedNode.id).length;

    const routeSettings: Record<
      SplitRouteLabel,
      {
        kind: NodeKind;
        action: ActionKind;
        label: string;
        memo: string;
      }
    > = {
      ルートA: {
        kind: 'operation',
        action: '加工',
        label: '別工程A',
        memo: '分岐後に進む別ルート。',
      },
      ルートB: {
        kind: 'operation',
        action: '加工',
        label: '別工程B',
        memo: '分岐後に進む別ルート。',
      },
      格納先A: {
        kind: 'storage',
        action: '格納',
        label: '格納先A',
        memo: '分岐後の格納先。',
      },
      格納先B: {
        kind: 'storage',
        action: '格納',
        label: '格納先B',
        memo: '分岐後の別格納先。',
      },
      別ファイル生成: {
        kind: 'operation',
        action: '加工',
        label: '別ファイル生成',
        memo: '加工により別ファイルが発生する流れ。',
      },
      再加工: {
        kind: 'operation',
        action: '戻し',
        label: '再加工',
        memo: '前工程へ戻す、または再処理する。',
      },
      戻し: {
        kind: 'operation',
        action: '戻し',
        label: '戻し先',
        memo: '前工程へ戻す、または再処理する。',
      },
      保留: {
        kind: 'memo',
        action: '保留',
        label: '保留メモ',
        memo: '一時停止・確認待ち・例外など。',
      },
    };

    const setting = routeSettings[routeLabel];

    const newNode: FlowNode = {
      id: createId(`node-${setting.kind}`),
      type: 'routeCard',
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
    setEditModalOpen(true);
    setConnectMode(null);
    setStatusMessage(`分岐から「${routeLabel}」を追加しました。`);
  };

  const insertNodeOnSelectedEdge = () => {
    if (!selectedEdge) {
      return;
    }

    const template = NODE_TEMPLATES.find((item) => item.kind === insertKind) ?? NODE_TEMPLATES[2];
    const sourceNode = nodes.find((node) => node.id === selectedEdge.source);
    const targetNode = nodes.find((node) => node.id === selectedEdge.target);

    if (!sourceNode || !targetNode) {
      setStatusMessage('挿入先の導線を取得できませんでした。');
      return;
    }

    const newNode: FlowNode = {
      id: createId(`node-${template.kind}`),
      type: 'routeCard',
      position: {
        x: (sourceNode.position.x + targetNode.position.x) / 2,
        y: (sourceNode.position.y + targetNode.position.y) / 2 + 70,
      },
      data: {
        label: template.title,
        kind: template.kind,
        action: template.action,
        memo: template.description,
      },
    };

    const firstEdge = createEdge(
      selectedEdge.source,
      newNode.id,
      selectedEdge.data?.action ?? '移動',
      selectedEdge.data?.memo ?? '',
    );
    const secondEdge = createEdge(newNode.id, selectedEdge.target, template.action);

    updateActiveFile((file) => ({
      ...file,
      nodes: [...file.nodes, newNode],
      edges: [
        ...file.edges.filter((edge) => edge.id !== selectedEdge.id),
        firstEdge,
        secondEdge,
      ],
    }));

    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(null);
    setEditModalOpen(true);
    setConnectMode(null);
    setStatusMessage('導線の間にパーツを挿入しました。');
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
      setEditModalOpen(false);
      setConnectMode(null);
      return;
    }

    if (selectedEdgeId) {
      updateActiveFile((file) => ({
        ...file,
        edges: file.edges.filter((edge) => edge.id !== selectedEdgeId),
      }));

      setSelectedEdgeId(null);
      setEditModalOpen(false);
      setConnectMode(null);
    }
  };

  const saveDraft = () => {
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
  };

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
      setEditModalOpen(false);
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
    setEditModalOpen(false);
    setConnectMode(null);
    setStatusMessage('初期状態に戻しました。保存データも削除済みです。');
  };

  const startConnectMode = () => {
    if (!selectedNode) {
      return;
    }

    setConnectMode({
      sourceId: selectedNode.id,
      label: selectedNode.data.kind === 'split' ? '分岐' : selectedNode.data.action,
    });
    setEditModalOpen(false);
  };

  const renderNodeEditForm = () => {
    if (!selectedNode) {
      return null;
    }

    return (
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
            placeholder="例：端末A / フォルダ作成A / 一般サービスA / 格納先Y"
          />
        </label>

        <label>
          種別
          <select
            value={selectedNode.data.kind}
            onChange={(event) => {
              const nextKind = event.target.value as NodeKind;
              const template = NODE_TEMPLATES.find((item) => item.kind === nextKind);

              updateNodeData(selectedNode.id, {
                kind: nextKind,
                action: template?.action ?? selectedNode.data.action,
              });
            }}
          >
            {NODE_TEMPLATES.map((template) => (
              <option key={template.kind} value={template.kind}>
                {template.title}
              </option>
            ))}
          </select>
        </label>

        <label>
          工程
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
          <button disabled={!selectedNodeCanStartRoute} onClick={startConnectMode}>
            次につなぐ
          </button>

          <button className="danger-inline-button" onClick={removeSelected}>
            このパーツを削除
          </button>

          {!selectedNodeCanStartRoute && (
            <p className="route-rule-message">
              このパーツはすでに次の導線があります。複数ルートにしたい場合は「分岐」パーツを使ってください。
            </p>
          )}
        </div>

        {selectedNode.data.kind === 'split' && (
          <div className="split-actions">
            <p>分岐ルートを追加</p>
            {SPLIT_ROUTE_LABELS.map((label) => (
              <button key={label} onClick={() => addSplitRoute(label)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderEdgeEditForm = () => {
    if (!selectedEdge) {
      return null;
    }

    return (
      <div className="edit-form">
        <div className="selected-card">
          <span>導線</span>
          <strong>{String(selectedEdge.label ?? '工程')}</strong>
        </div>

        <label>
          導線ラベル
          <select
            value={selectedEdge.data?.action ?? '移動'}
            onChange={(event) =>
              updateEdgeData(selectedEdge.id, {
                action: event.target.value,
              })
            }
          >
            {ROUTE_LABELS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>

        <label>
          補足メモ
          <textarea
            value={selectedEdge.data?.memo ?? ''}
            onChange={(event) =>
              updateEdgeData(selectedEdge.id, {
                memo: event.target.value,
              })
            }
            rows={5}
            placeholder="例：経由する / 戻す / 別ルートへ"
          />
        </label>

        <div className="insert-box">
          <p>この導線の間にパーツを挿入</p>
          <label>
            挿入するパーツ
            <select
              value={insertKind}
              onChange={(event) => setInsertKind(event.target.value as NodeKind)}
            >
              {NODE_TEMPLATES.filter((template) => template.kind !== 'source').map(
                (template) => (
                  <option key={template.kind} value={template.kind}>
                    {template.title}
                  </option>
                ),
              )}
            </select>
          </label>
          <button onClick={insertNodeOnSelectedEdge}>導線の間に挿入</button>
        </div>

        <div className="node-actions">
          <button className="danger-inline-button" onClick={removeSelected}>
            この導線を削除
          </button>
        </div>
      </div>
    );
  };

  const renderStorageControls = (mobile = false) => (
    <div className={mobile ? 'storage-box storage-box--mobile' : 'storage-box'}>
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
        <button onClick={loadDraft}>読込</button>
        <button className="danger-button" onClick={resetMap}>
          全削除
        </button>
      </div>

      <p>{statusMessage}</p>
    </div>
  );

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
              OK：取得元A / 端末A / 工程A / ツールA / フォルダ作成A / 一般サービスA / 格納先Y
            </div>
            <button className="primary-button" onClick={() => setNoticeOpen(false)}>
              理解しました。抽象名のみで作成する
            </button>
          </section>
        </div>
      )}


      <header className="hero">
        <div>
          <p className="eyebrow">機密を入れないファイル導線整理ツール</p>
          <h1>Pathless Map</h1>
          <p>
            具体名ではなく、流れを見る。実パスではなく、導線を見る。
            ファイル名ではなく、役割を見るためのローカル導線マップ。
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

      <section className="map-control-panel" aria-label="マップ切替">
        <div className="control-line control-line--task">
          <div className="control-label">
            <span>Task</span>
            <strong>タスク</strong>
          </div>

          <div className="tabs-scroll control-tabs" role="tablist" aria-label="タスク一覧">
            {tasks.map((task) => (
              <button
                key={task.id}
                role="tab"
                aria-selected={task.id === activeTaskId}
                className={`tab-button ${task.id === activeTaskId ? 'is-active' : ''}`}
                onClick={() => switchTask(task.id)}
              >
                {task.title}
              </button>
            ))}
          </div>

          <div className="control-line-actions">
            <button className="add-tab-button" onClick={addTask}>
              ＋タスク
            </button>
            <button className="mobile-control-delete-button" onClick={removeActiveTask}>
              削除
            </button>
          </div>
        </div>

        <div className="control-detail-row control-detail-row--task">
          <label className="control-field control-field--name">
            タスク名
            <input
              value={activeTask.title}
              onChange={(event) => updateActiveTask({ title: event.target.value })}
              placeholder="例：日次処理"
            />
          </label>

          <label className="control-field control-field--memo">
            タスクメモ
            <input
              value={activeTask.summary}
              onChange={(event) => updateActiveTask({ summary: event.target.value })}
              placeholder="このタスクで整理するファイルの流れ"
            />
          </label>

          <button className="danger-outline-button" onClick={removeActiveTask}>
            タスク削除
          </button>
        </div>

        <div className="control-line control-line--file">
          <div className="control-label">
            <span>File</span>
            <strong>ファイル導線</strong>
          </div>

          <div className="tabs-scroll control-tabs file-space" role="tablist" aria-label="ファイル導線一覧">
            {activeTask.files.map((file) => (
              <button
                key={file.id}
                role="tab"
                aria-selected={file.id === activeFile.id}
                className={`file-tab ${file.id === activeFile.id ? 'is-active' : ''}`}
                onClick={() => switchFile(file.id)}
              >
                {file.label}
              </button>
            ))}
          </div>

          <div className="control-line-actions">
            <button className="add-tab-button" onClick={addFile}>
              ＋ファイル
            </button>
            <button className="mobile-control-delete-button" onClick={removeActiveFile}>
              削除
            </button>
          </div>
        </div>

        <div className="control-detail-row control-detail-row--file">
          <label className="control-field control-field--file-name">
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

      <section className="route-summary-card desktop-route-summary">
        <div className="route-summary-heading">
          <div>
            <p>Route Summary</p>
            <h2>このファイルのルート一覧</h2>
          </div>
          <span>{activeFile.label}</span>
        </div>

        <ol>
          {routeSummaries.map((summary, index) => (
            <li key={`${summary}-${index}`}>{summary}</li>
          ))}
        </ol>
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

        <section className="flow-card" ref={flowCardRef}>
          <div className="flow-toolbar">
            <div>
              <strong>Route Canvas</strong>
              <span>
                通常パーツは導線1本。複数ルートは「分岐」パーツから作成。
              </span>
            </div>

            <div className="flow-toolbar-actions">
              <button
                className="danger-ghost-button"
                onClick={removeSelected}
                disabled={!selectedNodeId && !selectedEdgeId}
              >
                選択中を削除
              </button>
            </div>
          </div>

          <div className="flow-area">
            <ReactFlow<FlowNode, FlowEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
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
                openEditModalAt(_);
              }}
              onEdgeClick={(_, edge) => {
                setSelectedEdgeId(edge.id);
                setSelectedNodeId(null);
                setConnectMode(null);
                openEditModalAt(_);
              }}
              onPaneClick={() => {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
                setConnectMode(null);
              }}
              panOnDrag
              panOnScroll={false}
              zoomOnPinch
              zoomOnDoubleClick={false}
              preventScrolling
              selectionOnDrag={false}
              fitView
            >
              <Background color="#bfd5cf" gap={24} />
              <Controls position="bottom-left" />
              <MiniMap pannable zoomable nodeStrokeWidth={3} position="bottom-right" />
            </ReactFlow>
          </div>

        </section>

        <details className="route-summary-card mobile-route-summary">
          <summary className="mobile-summary-toggle">
            <span>ルート一覧</span>
            <strong>{activeFile.label}</strong>
          </summary>
          <ol>
            {routeSummaries.map((summary, index) => (
              <li key={`mobile-${summary}-${index}`}>{summary}</li>
            ))}
          </ol>
        </details>

        <section className="mobile-storage-card">
          <div className="mobile-card-heading">
            <p>Storage</p>
            <h2>保存設定</h2>
          </div>
          {renderStorageControls(true)}
        </section>

        <aside className="edit-panel">
          <div className="panel-heading">
            <p>Edit</p>
            <h2>詳細編集</h2>
          </div>

          {!selectedNode && !selectedEdge && (
            <div className="empty-edit">
              パーツまたは矢印をタップすると、モーダルで編集できます。
            </div>
          )}

          {selectedNode && renderNodeEditForm()}
          {selectedEdge && renderEdgeEditForm()}

          {renderStorageControls()}
        </aside>
      </section>

      {editModalOpen && (selectedNode || selectedEdge) && (
        <div
          className="edit-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={closeEditModal}
        >
          <section
            className="edit-modal-card"
            data-placement={editModalAnchor?.placement ?? 'above'}
            style={
              editModalAnchor
                ? {
                    left: `${editModalAnchor.x}px`,
                    top: `${editModalAnchor.y}px`,
                    width: `${editModalAnchor.width}px`,
                    maxHeight: `${editModalAnchor.maxHeight}px`,
                  }
                : undefined
            }
            onClick={(event) => event.stopPropagation()}
          >
            <div className="edit-modal-heading">
              <div>
                <p>Edit</p>
                <h2>{selectedNode ? 'パーツを編集' : '導線を編集'}</h2>
              </div>
              <button
                className="modal-close-button"
                onClick={closeEditModal}
                aria-label="編集を閉じる"
              >
                ×
              </button>
            </div>

            <div className="edit-modal-body">
              {selectedNode ? renderNodeEditForm() : renderEdgeEditForm()}
            </div>
          </section>
        </div>
      )}

    </main>
  );
}

export default App;
