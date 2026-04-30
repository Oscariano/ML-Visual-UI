import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  AlertTriangle,
  Bot,
  Braces,
  Check,
  ChevronDown,
  Code2,
  Database,
  Download,
  FileJson,
  FlaskConical,
  GitBranch,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Save,
  Scissors,
  Upload,
  Workflow,
  Zap,
} from "lucide-react";
import {
  actionFromPrompt,
  applyActions,
  componentGroups,
  generatePipelineYaml,
  generatePython,
  inferDatasetFromCsv,
  makeInitialState,
  parseCodePatch,
  runsJson,
  selectedNodeYaml,
  updateEdgesForState,
  warningsForState,
} from "./pipeline";
import { AssistantAction, NodeKind, PipelineEdge, PipelineNode, PipelineState } from "./types";

type DragState = { id: string; offsetX: number; offsetY: number };
type PanState = { startX: number; startY: number; originX: number; originY: number };
type Tab = "pipeline.yml" | "train.py" | "selected-node.yml" | "runs.json";

const nodeIcons: Record<NodeKind, ReactElement> = {
  data: <Database size={14} />,
  prep: <Workflow size={14} />,
  split: <Scissors size={14} />,
  modelPrep: <GitBranch size={14} />,
  model: <FlaskConical size={14} />,
  eval: <Check size={14} />,
  deploy: <Upload size={14} />,
  assistant: <Bot size={14} />,
  impact: <Zap size={14} />,
};

const titanicSample = `PassengerId,Survived,Pclass,Name,Sex,Age,SibSp,Parch,Fare,Embarked
1,0,3,"Braund, Mr. Owen Harris",male,22,1,0,7.25,S
2,1,1,"Cumings, Mrs. John Bradley",female,38,1,0,71.2833,C
3,1,3,"Heikkinen, Miss. Laina",female,26,0,0,7.925,S
4,1,1,"Futrelle, Mrs. Jacques Heath",female,35,1,0,53.1,S
5,0,3,"Allen, Mr. William Henry",male,35,0,0,8.05,S
6,0,3,"Moran, Mr. James",male,,0,0,8.4583,Q
7,0,1,"McCarthy, Mr. Timothy J",male,54,0,0,51.8625,S
8,0,3,"Palsson, Master. Gosta Leonard",male,2,3,1,21.075,S
9,1,3,"Johnson, Mrs. Oscar W",female,27,0,2,11.1333,S
10,1,2,"Nasser, Mrs. Nicholas",female,14,1,0,30.0708,C`;

function savedOrInitial(): PipelineState {
  try {
    const saved = localStorage.getItem("ml-visual-ui-project-v3");
    if (saved) return JSON.parse(saved) as PipelineState;
  } catch {
    // ignore malformed local state
  }
  return makeInitialState();
}

function hydrateState(): PipelineState {
  const state = savedOrInitial();
  return { ...state, edges: updateEdgesForState(state), code: generatePipelineYaml(state) };
}

export function App() {
  const [state, setState] = useState<PipelineState>(() => hydrateState());
  const [activeTab, setActiveTab] = useState<Tab>("pipeline.yml");
  const [editorText, setEditorText] = useState(state.code);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [shelfDrag, setShelfDrag] = useState<{ component: string; kind: NodeKind; x: number; y: number } | null>(null);
  const [edgeHover, setEdgeHover] = useState<{ edge: PipelineEdge; x: number; y: number } | null>(null);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("ml-visual-ui-openai-key") ?? "");
  const [zoom, setZoom] = useState(0.52);
  const [pan, setPan] = useState({ x: 10, y: 18 });
  const [panDrag, setPanDrag] = useState<PanState | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLElement | null>>({});

  const selected = state.nodes.find((node) => node.id === state.selectedNodeId) ?? state.nodes[0];
  const generatedPython = useMemo(() => generatePython(state), [state]);
  const selectedYaml = useMemo(() => selectedNodeYaml(state), [state]);
  const runs = useMemo(() => runsJson(state), [state]);
  const warnings = useMemo(() => warningsForState(state), [state]);

  useEffect(() => {
    if (!state.dataset) void loadTitanicDemo();
  }, []);

  useEffect(() => {
    if (activeTab === "pipeline.yml") setEditorText(state.code);
    if (activeTab === "train.py") setEditorText(generatedPython);
    if (activeTab === "selected-node.yml") setEditorText(selectedYaml);
    if (activeTab === "runs.json") setEditorText(runs);
  }, [activeTab, generatedPython, runs, selectedYaml, state.code]);

  useEffect(() => {
    const next = { ...state, code: generatePipelineYaml(state), edges: updateEdgesForState(state) };
    localStorage.setItem("ml-visual-ui-project-v3", JSON.stringify(next));
  }, [state]);

  function updateState(next: PipelineState) {
    setState({ ...next, code: generatePipelineYaml(next), edges: updateEdgesForState(next) });
  }

  function selectNode(id: string) {
    setState((current) => ({ ...current, selectedNodeId: id, lastMessage: `Selected ${current.nodes.find((node) => node.id === id)?.component}` }));
  }

  function onNodePointerDown(event: React.PointerEvent, node: PipelineNode) {
    if ((event.target as HTMLElement).closest("button,input,select,label")) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setDrag({ id: node.id, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top });
    selectNode(node.id);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onCanvasPointerMove(event: React.PointerEvent) {
    if (shelfDrag) setShelfDrag({ ...shelfDrag, x: event.clientX, y: event.clientY });
    if (panDrag) {
      setPan({
        x: panDrag.originX + event.clientX - panDrag.startX,
        y: panDrag.originY + event.clientY - panDrag.startY,
      });
      return;
    }
    if (!drag || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setState((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (node.id !== drag.id) return node;
        const workspaceWidth = 1320;
        const workspaceHeight = 760;
        const maxX = Math.max(12, workspaceWidth - 210);
        const maxY = Math.max(12, workspaceHeight - 178);
        return {
          ...node,
          x: Math.round(Math.max(12, Math.min(maxX, (event.clientX - rect.left - pan.x) / zoom - drag.offsetX / zoom))),
          y: Math.round(Math.max(12, Math.min(maxY, (event.clientY - rect.top - pan.y) / zoom - drag.offsetY / zoom))),
        };
      }),
      lastMessage: "Moved block and redrew typed wires.",
    }));
  }

  function stopDrag(event: React.PointerEvent) {
    setDrag(null);
    setPanDrag(null);
    if (!shelfDrag || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (inside) {
      const id = `${shelfDrag.kind}-${Date.now()}`;
      const node: PipelineNode = {
        id,
        component: shelfDrag.component,
        kind: shelfDrag.kind,
        x: Math.round((event.clientX - rect.left - pan.x) / zoom - 92),
        y: Math.round((event.clientY - rect.top - pan.y) / zoom - 26),
        status: "New",
        summary: "Dropped from the component library. Connect or configure it next.",
        config: { input: "Unconnected", output: `${shelfDrag.component}.output` },
      };
      setState((current) => ({ ...current, nodes: [...current.nodes, node], selectedNodeId: id, lastMessage: `Added ${shelfDrag.component}` }));
    }
    setShelfDrag(null);
  }

  function edgePath(edge: PipelineEdge) {
    const from = state.nodes.find((node) => node.id === edge.from);
    const to = state.nodes.find((node) => node.id === edge.to);
    if (!from || !to) return "";
    const fromEl = nodeRefs.current[from.id];
    const toEl = nodeRefs.current[to.id];
    const fw = fromEl?.offsetWidth ?? 188;
    const fh = fromEl?.offsetHeight ?? 150;
    const th = toEl?.offsetHeight ?? 150;
    const fromX = from.x + fw;
    const laneOffset = {
      "e-prep-agent": 18,
      "e-model-agent": -18,
      "e-model-eval": 12,
      "e-prep-split": -10,
    }[edge.id] ?? 0;
    const fromY = from.y + fh / 2 + laneOffset;
    const toX = to.x;
    const toY = to.y + th / 2 - laneOffset * 0.35;
    const dx = Math.abs(toX - fromX);
    const direction = toX >= fromX ? 1 : -1;
    const curve = Math.min(76, Math.max(32, dx * 0.18));
    return `M ${fromX} ${fromY} C ${fromX + direction * curve} ${fromY}, ${toX - direction * curve} ${toY}, ${toX} ${toY}`;
  }

  async function readCsv(file: File) {
    const text = await file.text();
    loadCsvText(text, file.name);
  }

  async function loadTitanicDemo() {
    try {
      const response = await fetch("/titanic.csv");
      if (!response.ok) throw new Error("missing titanic asset");
      loadCsvText(await response.text(), "titanic.csv");
    } catch {
      loadCsvText(titanicSample, "titanic.csv");
    }
  }

  function loadCsvText(text: string, fileName: string) {
    const dataset = inferDatasetFromCsv(text, fileName);
    const target = dataset.columns.find((column) => column.role === "target")?.name ?? dataset.columns.at(-1)?.name ?? "target";
    setState((current) => {
      const next = {
        ...current,
        dataset,
        transforms: ["Drop Name, PassengerId, Ticket, Cabin", "Fill missing Age/Embarked with median/mode", "One-hot encode Sex and Embarked", "Standard scale numeric features"],
        nodes: current.nodes.map((node) => {
          if (node.id === "data") return { ...node, status: "Loaded", summary: `${dataset.rows} rows, ${dataset.columns.length} columns. Target: ${target}.`, config: { ...node.config, source: fileName, alias: dataset.name, target } };
          if (node.id === "prep") return { ...node, status: "Ready", summary: "Titanic-friendly prep: fill Age, drop identifiers, encode Sex and Embarked." };
          if (node.id === "split") return { ...node, status: "Ready" };
          if (node.id === "modelPrep") return { ...node, status: "Ready" };
          return node;
        }),
        selectedNodeId: "data",
        lastMessage: `Loaded ${fileName}`,
      };
      return { ...next, code: generatePipelineYaml(next), edges: updateEdgesForState(next) };
    });
  }

  function runPipeline() {
    setActiveTab("runs.json");
    setState((current) => {
      const next = {
        ...current,
        nodes: current.nodes.map((node) => {
          if (node.id === "model") return { ...node, status: "Fitted", summary: `${node.component} trained on the current split.` };
          if (node.id === "eval") return { ...node, status: "F1 0.84", summary: "Simulated run complete: accuracy 0.82, precision 0.79, recall 0.87, F1 0.84." };
          return node;
        }),
        assistantLog: [...current.assistantLog, "Run: validated schema, generated model-ready data, trained model, and produced metrics."],
        lastMessage: "Pipeline run complete",
      };
      return { ...next, code: generatePipelineYaml(next), edges: updateEdgesForState(next) };
    });
  }

  function applyDemoActions(actions: AssistantAction[], message: string, tab: Tab = "train.py") {
    setActiveTab(tab);
    setState((current) => {
      const next = applyActions(current, actions, message);
      return actions.some((action) => action.type === "set_framework" && action.framework === "pytorch")
        ? { ...next, selectedNodeId: "modelPrep" }
        : next;
    });
  }

  function applyEditor() {
    const actions = parseCodePatch(editorText);
    if (activeTab === "pipeline.yml" || activeTab === "train.py") {
      updateState(applyActions({ ...state, code: editorText }, actions, actions.length ? "Applied code edits" : "Validated editor text"));
    }
  }

  async function runAssistant() {
    const prompt = assistantPrompt.trim();
    if (!prompt) return;
    setAssistantPrompt("");
    const actions = await planAssistantActions(prompt);
    updateState(applyActions({ ...state, assistantLog: [...state.assistantLog, `You: ${prompt}`] }, actions, "Assistant applied patch"));
  }

  async function planAssistantActions(prompt: string): Promise<AssistantAction[]> {
    const key = apiKey || (import.meta.env.VITE_OPENAI_API_KEY as string | undefined);
    if (!key) return actionFromPrompt(prompt);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: (import.meta.env.VITE_OPENAI_MODEL as string | undefined) ?? "gpt-4o-mini",
          messages: [
            { role: "system", content: "Return JSON only: {\"actions\":[...]} where actions use type switch_model,set_split,add_transform,set_framework,set_metric. Valid frameworks: sklearn,pytorch,recommender." },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
        }),
      });
      const json = await response.json();
      const content = json.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(content.replace(/```json|```/g, ""));
      if (Array.isArray(parsed.actions)) return parsed.actions as AssistantAction[];
    } catch {
      return actionFromPrompt(prompt);
    }
    return actionFromPrompt(prompt);
  }

  function saveProject() {
    localStorage.setItem("ml-visual-ui-project-v3", JSON.stringify({ ...state, code: generatePipelineYaml(state), edges: updateEdgesForState(state) }));
    setState((current) => ({ ...current, lastMessage: "Saved project locally." }));
  }

  function exportProject() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ml-visual-ui-project.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function updateSelectedConfig(key: string, value: string | number | boolean) {
    setState((current) => {
      if (key === "component") {
        const action: AssistantAction = { type: "switch_model", model: String(value) };
        return applyActions(current, [action], "Changed model from canvas");
      }
      const next = {
        ...current,
        nodes: current.nodes.map((node) => node.id === current.selectedNodeId ? { ...node, config: { ...node.config, [key]: value } } : node),
        lastMessage: `Updated ${key}`,
      };
      return { ...next, code: generatePipelineYaml(next), edges: updateEdgesForState(next) };
    });
  }

  function addPreprocessTransform(transform: string) {
    setState((current) => {
      const transforms = current.transforms.includes(transform) ? current.transforms : [...current.transforms, transform];
      const isTorchPrep = /tensor|dataloader|torch/i.test(transform);
      const next = {
        ...current,
        transforms,
        nodes: current.nodes.map((node) =>
          node.id === "prep"
            ? { ...node, status: "Ready", summary: `${transforms.length} preprocessing operations configured.` }
            : node.id === "modelPrep" && isTorchPrep
              ? { ...node, status: "Ready", summary: "PyTorch tensor conversion and DataLoader checkpoints configured.", config: { ...node.config, checkpoints: "torch.Tensor conversion, TensorDataset, DataLoader, batch size=32" } }
            : node,
        ),
        selectedNodeId: isTorchPrep ? "modelPrep" : "prep",
        lastMessage: `Added transform: ${transform}`,
      };
      return { ...next, code: generatePipelineYaml(next), edges: updateEdgesForState(next) };
    });
  }

  function startCanvasPan(event: React.PointerEvent) {
    const target = event.target as Element;
    if (shelfDrag || target.closest(".flow-node,.zoom-controls,.edge-tooltip,button,input,select,textarea,label")) return;
    setPanDrag({ startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function resetView() {
    setZoom(0.52);
    setPan({ x: 10, y: 18 });
  }

  function fitView() {
    setZoom(0.48);
    setPan({ x: 8, y: 24 });
  }

  function isStageDone(node: PipelineNode | undefined) {
    return ["Loaded", "Ready", "Fitted"].includes(node?.status ?? "") || Boolean(node?.status?.includes("F1"));
  }

  function stageGuidance(node: PipelineNode) {
    if (isStageDone(node)) return `Opened ${node.component}.`;
    if (node.id === "data") return "DatasetLoader needs config: upload a CSV or use Titanic demo, then confirm source and target.";
    if (node.id === "prep") return "PrepareData needs config: add missing-value handling, categorical encoding, and numeric scaling.";
    if (node.id === "split") return "TrainTestSplit needs config: adjust test size, seed, and stratification.";
    if (node.id === "modelPrep") return state.framework === "pytorch"
      ? "ModelPrep needs config: set tensor conversion, dtype, batch size, shuffle, and workers."
      : "ModelPrep needs config: verify encoded matrix and target-vector checkpoints.";
    if (node.id === "model") return "Training needs config: choose the model and metric on the train node, then run.";
    if (node.id === "eval") return "MetricReport needs config: run the pipeline to generate evaluation metrics.";
    return `${node.component} needs config: review this node in the inspector.`;
  }

  function panToNodeIfNeeded(node: PipelineNode) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nodeEl = nodeRefs.current[node.id];
    const nodeWidth = nodeEl?.offsetWidth ?? 188;
    const nodeHeight = nodeEl?.offsetHeight ?? 150;
    const margin = 28;
    const ribbonOffset = 58;
    const nodeLeft = pan.x + node.x * zoom;
    const nodeTop = pan.y + node.y * zoom;
    const nodeRight = nodeLeft + nodeWidth * zoom;
    const nodeBottom = nodeTop + nodeHeight * zoom;
    const isVisible = nodeLeft >= margin
      && nodeRight <= rect.width - margin
      && nodeTop >= ribbonOffset
      && nodeBottom <= rect.height - margin;
    if (isVisible) return;
    setPan({
      x: Math.round(rect.width / 2 - (node.x + nodeWidth / 2) * zoom),
      y: Math.round(rect.height / 2 - (node.y + nodeHeight / 2) * zoom),
    });
  }

  function openStage(nodeId: string) {
    const node = state.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    setRightPanelOpen(true);
    setActiveTab(isStageDone(node) && nodeId === "eval" ? "runs.json" : "selected-node.yml");
    panToNodeIfNeeded(node);
    setState((current) => ({
      ...current,
      selectedNodeId: nodeId,
      lastMessage: stageGuidance(node),
    }));
  }

  return (
    <div
      className={`app-shell ${rightPanelOpen ? "" : "right-collapsed"}`}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={stopDrag}
    >
      <aside className="components-panel">
        <div className="components-title"><Workflow size={16} /> ML Visual UI</div>
        {componentGroups.map((group) => (
          <section className="component-group" key={group.name}>
            <button className="group-header"><span>{group.name}</span><ChevronDown size={14} /></button>
            {group.items.map((item) => (
              <button
                className={`component-item ${group.kind}`}
                key={item}
                onPointerDown={(event) => {
                  event.preventDefault();
                  setShelfDrag({ component: item, kind: group.kind as NodeKind, x: event.clientX, y: event.clientY });
                }}
              >
                <span>{item}</span><Braces size={13} />
              </button>
            ))}
          </section>
        ))}
        <div className="created-by">Code-native ML pipeline builder</div>
      </aside>

      <main className="flow-area">
        <header className="flow-topbar">
          <div className="flow-tabs"><button className="flow-tab active">Industry ML Flow</button><button className="add-flow">+</button></div>
          <div className="top-actions">
            <button onClick={loadTitanicDemo}><Database size={14} /> Titanic demo</button>
            <label className="top-button"><Upload size={14} /> CSV<input type="file" accept=".csv,text/csv" onChange={(event) => event.target.files?.[0] && readCsv(event.target.files[0])} /></label>
            <button onClick={() => applyDemoActions([{ type: "switch_model", model: "XGBoostClassifier" }, { type: "set_metric", metric: "f1" }], "Switched to XGBoost")}>XGBoost</button>
            <button onClick={() => applyDemoActions([{ type: "set_framework", framework: "pytorch" }], "Converted to PyTorch")}>PyTorch</button>
            <button onClick={runPipeline}><Play size={14} /> Run</button>
            <button onClick={saveProject}><Save size={14} /> Save</button>
            <button onClick={exportProject}><Download size={14} /> Export</button>
            <button onClick={() => setRightPanelOpen((open) => !open)}>{rightPanelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />} Panel</button>
          </div>
        </header>

        <div className="flow-content">
          <aside className="ide-panel">
            <div className="editor-strip">
              {(["pipeline.yml", "train.py", "selected-node.yml", "runs.json"] as Tab[]).map((tab) => (
                <button className={`file-tab ${activeTab === tab ? "active" : ""}`} key={tab} onClick={() => setActiveTab(tab)}>
                  {tab === "train.py" ? <Code2 size={13} /> : tab === "runs.json" ? <FileJson size={13} /> : <Braces size={13} />} {tab}
                </button>
              ))}
            </div>
            <div className="editor-breadcrumb"><span>ml-visual-ui</span><span>›</span><span>flows</span><span>›</span><strong>{activeTab}</strong><em>{state.lastMessage}</em></div>
            <section className="code-workbench">
              <div className="line-numbers">{editorText.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div>
              <textarea value={editorText} spellCheck={false} onChange={(event) => setEditorText(event.target.value)} />
            </section>
            <footer className="editor-statusbar"><span>{activeTab === "pipeline.yml" ? "Apply config to graph; graph changes regenerate this file." : "Generated artifact. Edit and apply known patterns."}</span><button onClick={applyEditor}>Apply code</button></footer>
          </aside>

          <section
            className={`canvas ${shelfDrag ? "drag-over" : ""} ${panDrag ? "panning" : ""}`}
            ref={canvasRef}
            onPointerDown={startCanvasPan}
            onWheel={(event) => {
              if (!event.metaKey && !event.ctrlKey) {
                setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
                event.preventDefault();
                return;
              }
              setZoom((value) => Math.max(0.48, Math.min(1.45, Number((value - event.deltaY * 0.001).toFixed(2)))));
              event.preventDefault();
            }}
          >
            <PipelineRibbon state={state} onSelectStage={openStage} />
            <div className="canvas-viewport" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
              <svg className="wires" viewBox="0 0 1320 760">
                {state.edges.map((edge) => (
                  <path
                    key={edge.id}
                    className={`wire ${edge.from === "model" ? "red" : edge.from === "modelPrep" ? "purple" : edge.from === "split" ? "amber" : "blue"}`}
                    d={edgePath(edge)}
                    onPointerEnter={(event) => setEdgeHover({ edge, x: event.clientX, y: event.clientY })}
                    onPointerMove={(event) => setEdgeHover({ edge, x: event.clientX, y: event.clientY })}
                    onPointerLeave={() => setEdgeHover(null)}
                  />
                ))}
              </svg>
              {state.nodes.map((node) => (
                <article
                  className={`flow-node ${node.kind} ${state.selectedNodeId === node.id ? "selected" : ""} ${drag?.id === node.id ? "dragging" : ""}`}
                  key={node.id}
                  ref={(el) => { nodeRefs.current[node.id] = el; }}
                  style={{ left: node.x, top: node.y }}
                  onPointerDown={(event) => onNodePointerDown(event, node)}
                  onClick={() => selectNode(node.id)}
                >
                  <div className="node-title"><span className="node-icon">{nodeIcons[node.kind]}</span><strong>{node.component}</strong><span className="node-status">{node.status}</span></div>
                  <p className="node-desc">{node.summary}</p>
                  <NodeDetails node={node} state={state} updateSelectedConfig={updateSelectedConfig} addPreprocessTransform={addPreprocessTransform} readCsv={readCsv} loadTitanicDemo={loadTitanicDemo} />
                </article>
              ))}
            </div>
            {edgeHover && <EdgeTooltip edgeHover={edgeHover} />}
            {shelfDrag && <div className="drag-ghost" style={{ left: shelfDrag.x + 10, top: shelfDrag.y + 10 }}>{shelfDrag.component}</div>}
            <div className="zoom-controls">
              <button onClick={() => setZoom((value) => Math.min(1.45, Number((value + 0.1).toFixed(2))))}>+</button>
              <button onClick={() => setZoom((value) => Math.max(0.48, Number((value - 0.1).toFixed(2))))}>-</button>
              <button onClick={() => setZoom(1)}><Maximize2 size={12} /></button>
              <button className="fit-button" onClick={fitView}>Fit</button>
              <button onClick={resetView}>⌂</button>
              <span>{Math.round(zoom * 100)}%</span>
            </div>
          </section>

          {rightPanelOpen && (
          <aside className="right-panel">
            <section className="inspector">
              <div className="inspector-head"><strong>{selected.component}</strong><span>{state.framework}</span></div>
              <button className="panel-close" onClick={() => setRightPanelOpen(false)}><PanelRightClose size={14} /> Hide</button>
              <div className="pill-row">{warnings.map((warning) => <span className="warning-pill" key={warning}><AlertTriangle size={12} /> {warning}</span>)}</div>
              <SchemaTable state={state} />
              <div className="assistant-box">
                <div className="assistant-log">{state.assistantLog.slice(-4).map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div>
                <details className="api-key-row">
                  <summary>OpenAI settings</summary>
                  <input
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      localStorage.setItem("ml-visual-ui-openai-key", event.target.value);
                    }}
                    placeholder="OpenAI API key (optional)"
                    type="password"
                  />
                </details>
                <div className="assistant-input"><input value={assistantPrompt} onChange={(event) => setAssistantPrompt(event.target.value)} onKeyDown={(event) => event.key === "Enter" && runAssistant()} placeholder="Ask: turn this into PyTorch..." /><button onClick={runAssistant}><Play size={14} /></button></div>
              </div>
            </section>
          </aside>
          )}
        </div>
      </main>
    </div>
  );
}

function NodeDetails({ node, state, updateSelectedConfig, addPreprocessTransform, readCsv, loadTitanicDemo }: { node: PipelineNode; state: PipelineState; updateSelectedConfig: (key: string, value: string | number | boolean) => void; addPreprocessTransform: (transform: string) => void; readCsv: (file: File) => void; loadTitanicDemo: () => void }) {
  if (node.id === "data") {
    return <><label className="node-upload"><Upload size={13} /> Upload CSV<input type="file" accept=".csv,text/csv" onChange={(event) => event.target.files?.[0] && readCsv(event.target.files[0])} /></label><button className="node-action" onClick={loadTitanicDemo}>Use Titanic demo</button><div className="node-input">{String(node.config.source)}</div><div className="node-foot">{state.dataset ? `${state.dataset.rows} rows / ${state.dataset.columns.length} cols` : "Output: pandas.DataFrame"}<i /></div></>;
  }
  if (node.id === "prep") {
    return (
      <>
        <div className="transform-list">
          {state.transforms.slice(0, 4).map((transform) => <span key={transform}>{transform}</span>)}
        </div>
        <button className="node-action" onClick={() => addPreprocessTransform("Fill missing Age/Embarked with median/mode")}>Fill missing</button>
        <button className="node-action" onClick={() => addPreprocessTransform("One-hot encode Sex and Embarked")}>One-hot encode</button>
        <button className="node-action" onClick={() => addPreprocessTransform("Standard scale numeric features")}>Scale numeric</button>
        <div className="node-foot">Output: PreparedData<i /></div>
      </>
    );
  }
  if (node.id === "split") {
    return <><label>Test size: {String(node.config.testSize)}</label><input className="range" type="range" min="0.1" max="0.4" step="0.05" value={Number(node.config.testSize)} onChange={(event) => updateSelectedConfig("testSize", Number(event.target.value))} /><div className="node-foot">Output: train/test tuple<i /></div></>;
  }
  if (node.id === "model") {
    return <><label>Model</label><select value={node.component} onChange={(event) => updateSelectedConfig("component", event.target.value)}><option>LogisticRegression</option><option>RandomForestClassifier</option><option>XGBoostClassifier</option><option>TorchMLPClassifier</option><option>FactorizationMachine</option></select><div className="node-foot">Output: ModelArtifact<i /></div></>;
  }
  if (node.id === "modelPrep") {
    if (state.framework === "pytorch") {
      return (
        <>
          <div className="checkpoint">{String(node.config.checkpoints)}</div>
          <label className="node-check"><input type="checkbox" checked={Boolean(node.config.tensorConversion)} onChange={(event) => updateSelectedConfig("tensorConversion", event.target.checked)} /> Tensor conversion</label>
          <label>Dtype</label>
          <select value={String(node.config.tensorDtype ?? "float32")} onChange={(event) => updateSelectedConfig("tensorDtype", event.target.value)}>
            <option value="float32">float32</option>
            <option value="float64">float64</option>
          </select>
          <label>Batch size</label>
          <input className="node-number" type="number" min="1" max="512" value={Number(node.config.batchSize ?? 32)} onChange={(event) => updateSelectedConfig("batchSize", Number(event.target.value))} />
          <label className="node-check"><input type="checkbox" checked={Boolean(node.config.shuffle ?? true)} onChange={(event) => updateSelectedConfig("shuffle", event.target.checked)} /> Shuffle DataLoader</label>
          <label>Workers</label>
          <input className="node-number" type="number" min="0" max="8" value={Number(node.config.numWorkers ?? 0)} onChange={(event) => updateSelectedConfig("numWorkers", Number(event.target.value))} />
          <div className="node-foot">Output: DataLoader<i /></div>
        </>
      );
    }
    return <><div className="checkpoint">{String(node.config.checkpoints)}</div><div className="node-foot">Output: ModelReadyData<i /></div></>;
  }
  return <><div className="node-input">{Object.values(node.config)[0] ? String(Object.values(node.config)[0]) : "Configured"}</div><div className="node-foot">Output: {String(node.config.output ?? node.component)}<i /></div></>;
}

function EdgeTooltip({ edgeHover }: { edgeHover: { edge: PipelineEdge; x: number; y: number } }) {
  return <div className="edge-tooltip" style={{ left: edgeHover.x + 12, top: edgeHover.y + 12 }}><strong>{edgeHover.edge.label}</strong><span>{edgeHover.edge.dtype}</span><span>{edgeHover.edge.shape}</span><p>{edgeHover.edge.detail}</p></div>;
}

function PipelineRibbon({ state, onSelectStage }: { state: PipelineState; onSelectStage: (nodeId: string) => void }) {
  const stages = [
    ["Load", "data"],
    ["Preprocess", "prep"],
    ["Split", "split"],
    ["Model Prep", "modelPrep"],
    ["Train", "model"],
    ["Evaluate", "eval"],
  ] as const;

  return (
    <div className="stage-ribbon" style={{ pointerEvents: "auto" }}>
      {stages.map(([label, id], index) => {
        const node = state.nodes.find((item) => item.id === id);
        const done = ["Loaded", "Ready", "Fitted"].includes(node?.status ?? "") || Boolean(node?.status?.includes("F1"));
        return (
          <button
            className={`stage-chip ${done ? "done" : "needs-action"}`}
            key={id}
            onClick={() => onSelectStage(id)}
            style={{ pointerEvents: "auto" }}
            title={done ? `Open ${label}` : `Configure ${node?.component ?? label}`}
          >
            <span>{index + 1}</span>
            <strong>{label}</strong>
            <em>{node?.status}</em>
          </button>
        );
      })}
    </div>
  );
}

function SchemaTable({ state }: { state: PipelineState }) {
  if (!state.dataset) return <div className="schema-empty">Upload a CSV to see df.info-style schema, missing values, roles, and samples.</div>;
  return <div className="schema-table"><div className="schema-title">{state.dataset.name}: {state.dataset.rows} rows</div>{state.dataset.columns.slice(0, 7).map((column) => <div className="schema-row" key={column.name}><strong>{column.name}</strong><span>{column.type}</span><span>{column.role}</span><span>{column.missing} missing</span></div>)}</div>;
}
