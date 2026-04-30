import { AssistantAction, ColumnProfile, DatasetProfile, PipelineEdge, PipelineNode, PipelineState } from "./types";

export const componentGroups = [
  { name: "Data", kind: "data", items: ["DatasetLoader", "FeatureTable"] },
  { name: "Prepare", kind: "prep", items: ["SchemaCheck", "TrainTestSplit", "CategoricalEncoder"] },
  { name: "Models", kind: "model", items: ["LogisticRegression", "XGBoostClassifier", "TransformerModel"] },
  { name: "Evaluation", kind: "eval", items: ["MetricReport", "CompareRuns"] },
  { name: "Deploy", kind: "deploy", items: ["FastAPIEndpoint", "BatchInference"] },
] as const;

export const initialNodes: PipelineNode[] = [
  {
    id: "data",
    component: "DatasetLoader",
    kind: "data",
    x: 32,
    y: 100,
    status: "Ready",
    summary: "Upload a CSV, infer schema, select target, and name the dataset.",
    config: { source: "Upload CSV", target: "churned", alias: "customers" },
  },
  {
    id: "prep",
    component: "PrepareData",
    kind: "prep",
    x: 260,
    y: 96,
    status: "Needs data",
    summary: "Validate schema, handle missing values, encode categories, and scale numeric features.",
    config: { transforms: "drop columns, fill missing, one-hot encode" },
  },
  {
    id: "split",
    component: "TrainTestSplit",
    kind: "split",
    x: 260,
    y: 330,
    status: "Configured",
    summary: "Scissor split with stratification, seed, and train/test ratio controls.",
    config: { testSize: 0.2, seed: 42, stratify: true },
  },
  {
    id: "modelPrep",
    component: "ModelPrep",
    kind: "modelPrep",
    x: 500,
    y: 200,
    status: "Dynamic",
    summary: "Shows required checkpoints based on selected model family.",
    config: { checkpoints: "encoded matrix, target vector" },
  },
  {
    id: "model",
    component: "LogisticRegression",
    kind: "model",
    x: 728,
    y: 100,
    status: "Baseline",
    summary: "Baseline classifier optimized for fast iteration.",
    config: { metric: "f1", maxIter: 500 },
  },
  {
    id: "eval",
    component: "MetricReport",
    kind: "eval",
    x: 728,
    y: 330,
    status: "Preview",
    summary: "Compare accuracy, precision, recall, F1, ROC AUC, and confusion matrix.",
    config: { primary: "f1", simulatedScore: "0.84" },
  },
  {
    id: "agent",
    component: "PipelineAssistant",
    kind: "assistant",
    x: 500,
    y: 500,
    status: "Guiding",
    summary: "Proposes graph patches, explains warnings, and can use OpenAI when configured.",
    config: { mode: "structured patch planner" },
  },
];

export const initialEdges: PipelineEdge[] = [
  { id: "e-data-prep", from: "data", to: "prep", label: "Raw dataset", dtype: "pandas.DataFrame", shape: "unknown", detail: "CSV rows and columns after upload." },
  { id: "e-prep-split", from: "prep", to: "split", label: "Feature table", dtype: "pandas.DataFrame", shape: "unknown", detail: "Cleaned dataframe with transformations applied." },
  { id: "e-split-modelprep", from: "split", to: "modelPrep", label: "Train/test sets", dtype: "tuple[np.ndarray]", shape: "80/20", detail: "X_train, X_test, y_train, y_test." },
  { id: "e-modelprep-model", from: "modelPrep", to: "model", label: "Model-ready tensors", dtype: "numpy.ndarray", shape: "n x features", detail: "Prepared inputs matching the selected model family." },
  { id: "e-model-eval", from: "model", to: "eval", label: "Model artifact", dtype: "sklearn estimator", shape: "fitted model", detail: "Trained model plus prediction interface." },
  { id: "e-prep-agent", from: "prep", to: "agent", label: "Schema context", dtype: "PipelineContext", shape: "warnings", detail: "Column roles, transformations, and compatibility notes." },
  { id: "e-model-agent", from: "model", to: "agent", label: "Training plan", dtype: "ModelSpec", shape: "config", detail: "Selected model, metric, and framework requirements." },
];

export function makeInitialState(): PipelineState {
  const state: PipelineState = {
    nodes: initialNodes,
    edges: initialEdges,
    selectedNodeId: "data",
    framework: "sklearn",
    transforms: ["Fill missing values", "One-hot encode categoricals"],
    code: "",
    assistantLog: ["Assistant ready. Try: switch to XGBoost, change split to 80/20, turn this into PyTorch."],
    lastMessage: "Ready",
  };
  return { ...state, code: generatePipelineYaml(state) };
}

export function inferDatasetFromCsv(text: string, filename: string): DatasetProfile {
  const rows = text.trim().split(/\r?\n/).filter(Boolean).map((line) => parseCsvLine(line));
  const headers = rows[0] ?? [];
  const body = rows.slice(1);
  const columns: ColumnProfile[] = headers.map((name, index) => {
    const values = body.map((row) => row[index] ?? "");
    const nonEmpty = values.filter((value) => value.trim() !== "");
    const unique = new Set(nonEmpty).size;
    const sample = Array.from(new Set(nonEmpty.slice(0, 20))).slice(0, 4);
    const numeric = nonEmpty.length > 0 && nonEmpty.every((value) => !Number.isNaN(Number(value)));
    const booleanish = nonEmpty.every((value) => /^(true|false|0|1|yes|no)$/i.test(value));
    const dateish = nonEmpty.length > 0 && nonEmpty.slice(0, 10).every((value) => !Number.isNaN(Date.parse(value)) && /[-/]/.test(value));
    const type = booleanish ? "boolean" : dateish ? "date" : numeric ? "numeric" : unique < Math.max(20, body.length * 0.2) ? "categorical" : "text";
    const lower = name.toLowerCase();
    const role = lower.includes("target") || lower.includes("label") || lower.includes("churn") || lower.includes("survived") ? "target" : lower.endsWith("id") ? "id" : type === "date" ? "date" : "feature";
    return { name, type, missing: values.length - nonEmpty.length, unique, sample, role };
  });
  return { name: filename.replace(/\.[^.]+$/, ""), rows: body.length, columns };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      out.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  out.push(value.trim());
  return out;
}

export function updateEdgesForState(state: PipelineState): PipelineEdge[] {
  const rows = state.dataset?.rows ?? 891;
  const cols = state.dataset?.columns.length ?? 12;
  const target = state.dataset?.columns.find((column) => column.role === "target")?.name ?? "target";
  const testSize = Number(state.nodes.find((node) => node.id === "split")?.config.testSize ?? 0.2);
  const trainRows = Math.round(rows * (1 - testSize));
  const testRows = rows - trainRows;
  const featureCols = Math.max(1, cols - 1);
  const modelDtype = state.framework === "pytorch" ? "torch.utils.data.DataLoader" : state.framework === "recommender" ? "scipy.sparse.csr_matrix" : "numpy.ndarray";
  return initialEdges.map((edge) => {
    if (edge.id === "e-data-prep") return { ...edge, shape: `${rows} x ${cols}`, detail: `Target: ${target}. Missing values tracked per column.` };
    if (edge.id === "e-prep-split") return { ...edge, shape: `${rows} x ${featureCols}`, detail: `${state.transforms.length} transforms: ${state.transforms.join(", ")}.` };
    if (edge.id === "e-split-modelprep") return { ...edge, shape: `${trainRows}/${testRows}`, detail: `test_size=${testSize}; stratified split by ${target}.` };
    if (edge.id === "e-modelprep-model") return { ...edge, dtype: modelDtype, shape: state.framework === "pytorch" ? `batches of ${featureCols}` : `${trainRows} x ${featureCols}`, detail: prepDetail(state.framework) };
    if (edge.id === "e-model-eval") return { ...edge, dtype: state.framework === "pytorch" ? "torch.nn.Module" : "sklearn estimator", detail: `Metric target: ${state.nodes.find((node) => node.id === "model")?.config.metric ?? "f1"}.` };
    return edge;
  });
}

function prepDetail(framework: PipelineState["framework"]): string {
  if (framework === "pytorch") return "TensorDataset, DataLoader, device, input dimension, loss, optimizer.";
  if (framework === "recommender") return "User/item encodings, sparse interactions, optional negative sampling.";
  return "Encoded feature matrix and target vector ready for sklearn fit/predict.";
}

export function generatePipelineYaml(state: PipelineState): string {
  const target = state.dataset?.columns.find((column) => column.role === "target")?.name ?? "churned";
  const model = state.nodes.find((node) => node.id === "model")!;
  const split = state.nodes.find((node) => node.id === "split")!;
  const modelPrep = state.nodes.find((node) => node.id === "modelPrep")!;
  const pytorchPrep = state.framework === "pytorch"
    ? `\n    tensor_conversion: ${modelPrep.config.tensorConversion ?? true}\n    tensor_dtype: ${modelPrep.config.tensorDtype ?? "float32"}\n    batch_size: ${modelPrep.config.batchSize ?? 32}\n    shuffle: ${modelPrep.config.shuffle ?? true}\n    num_workers: ${modelPrep.config.numWorkers ?? 0}`
    : "";
  return `pipeline:
  data:
    component: DatasetLoader
    source: ${state.dataset ? `${state.dataset.name}.csv` : "upload://customers.csv"}
    alias: ${state.dataset?.name ?? "customers"}
    target: ${target}
  preprocess:
    component: PrepareData
    transforms:
${state.transforms.map((item) => `      - ${item}`).join("\n")}
  split:
    component: TrainTestSplit
    input: PreparedData
    test_size: ${split.config.testSize}
    random_state: ${split.config.seed}
    stratify: ${split.config.stratify}
  model_prep:
    component: ${state.framework === "pytorch" ? "TorchDataLoaderPrep" : state.framework === "recommender" ? "FactorizationMachinePrep" : "SklearnMatrixPrep"}
    framework: ${state.framework}${pytorchPrep}
  train:
    component: ${model.component}
    input: ModelReadyData
    optimize_for: ${model.config.metric ?? "f1"}
    max_depth: ${model.config.maxDepth ?? 8}
  evaluate:
    component: MetricReport
    input: ModelArtifact
    primary_metric: ${model.config.metric ?? "f1"}`;
}

export function generatePython(state: PipelineState): string {
  const target = state.dataset?.columns.find((column) => column.role === "target")?.name ?? "churned";
  const transformText = state.transforms.join(" ").toLowerCase();
  const droppedSet = new Set(state.dataset?.columns.filter((column) => column.role === "drop").map((column) => column.name) ?? []);
  if (transformText.includes("drop")) {
    for (const name of ["Name", "PassengerId", "Ticket", "Cabin"]) {
      if (state.dataset?.columns.some((column) => column.name === name)) droppedSet.add(name);
    }
  }
  const dropped = Array.from(droppedSet).map((name) => `"${name}"`);
  const categorical = state.dataset?.columns.filter((column) => column.type === "categorical" && column.role === "feature" && !droppedSet.has(column.name)).map((column) => column.name) ?? ["plan", "region"];
  const numeric = state.dataset?.columns.filter((column) => column.type === "numeric" && column.role === "feature" && !droppedSet.has(column.name)).map((column) => column.name) ?? ["tenure", "monthly_spend"];
  const model = state.nodes.find((node) => node.id === "model")?.component ?? "LogisticRegression";
  const split = state.nodes.find((node) => node.id === "split")!;
  const modelPrep = state.nodes.find((node) => node.id === "modelPrep");
  const tensorDtype = String(modelPrep?.config.tensorDtype ?? "float32");
  const torchDtype = tensorDtype === "float64" ? "torch.float64" : "torch.float32";
  const batchSize = Number(modelPrep?.config.batchSize ?? 32);
  const shuffle = Boolean(modelPrep?.config.shuffle ?? true);
  const numWorkers = Number(modelPrep?.config.numWorkers ?? 0);
  if (state.framework === "pytorch") {
    return `import pandas as pd
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer

df = pd.read_csv("${state.dataset?.name ?? "customers"}.csv")
target = "${target}"
X = df.drop(columns=[target${dropped.length ? `, ${dropped.join(", ")}` : ""}])
y = df[target].astype("float32")

numeric_transformer = Pipeline([
    ("imputer", SimpleImputer(strategy="median")),
    ("scaler", StandardScaler())
])
categorical_transformer = Pipeline([
    ("imputer", SimpleImputer(strategy="most_frequent")),
    ("onehot", OneHotEncoder(handle_unknown="ignore"))
])
preprocess = ColumnTransformer([
    ("num", numeric_transformer, ${JSON.stringify(numeric)}),
    ("cat", categorical_transformer, ${JSON.stringify(categorical)})
])

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=${split.config.testSize}, random_state=${split.config.seed}, stratify=y
)
X_train = torch.tensor(preprocess.fit_transform(X_train).toarray(), dtype=${torchDtype})
y_train = torch.tensor(y_train.to_numpy(), dtype=${torchDtype}).view(-1, 1)
train_loader = DataLoader(
    TensorDataset(X_train, y_train),
    batch_size=${batchSize},
    shuffle=${shuffle ? "True" : "False"},
    num_workers=${numWorkers}
)

model = nn.Sequential(
    nn.Linear(X_train.shape[1], 64),
    nn.ReLU(),
    nn.Dropout(0.15),
    nn.Linear(64, 1),
    nn.Sigmoid(),
)
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
loss_fn = nn.BCELoss()

for epoch in range(12):
    for xb, yb in train_loader:
        optimizer.zero_grad()
        loss = loss_fn(model(xb), yb)
        loss.backward()
        optimizer.step()`;
  }
  if (state.framework === "recommender") {
    return `import pandas as pd
from sklearn.preprocessing import LabelEncoder
from scipy import sparse

interactions = pd.read_csv("${state.dataset?.name ?? "interactions"}.csv")
user_col, item_col, label_col = "user_id", "item_id", "${target}"

users = LabelEncoder()
items = LabelEncoder()
row = users.fit_transform(interactions[user_col])
col = items.fit_transform(interactions[item_col])
rating = interactions[label_col].astype(float)

X = sparse.csr_matrix((rating, (row, col)), shape=(row.max() + 1, col.max() + 1))

# Factorization machine / matrix factorization checkpoint:
# encode user/item IDs, create sparse interactions, add negative sampling, then train ranking model.`;
  }
  const modelImport = model.includes("XGBoost") ? "from xgboost import XGBClassifier" : model.includes("RandomForest") ? "from sklearn.ensemble import RandomForestClassifier" : "from sklearn.linear_model import LogisticRegression";
  const modelExpr = model.includes("XGBoost") ? "XGBClassifier(max_depth=8, learning_rate=0.05, n_estimators=250)" : model.includes("RandomForest") ? "RandomForestClassifier(n_estimators=250, max_depth=10, random_state=42)" : "LogisticRegression(max_iter=500)";
  return `import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
${modelImport}

df = pd.read_csv("${state.dataset?.name ?? "customers"}.csv")
target = "${target}"
X = df.drop(columns=[target${dropped.length ? `, ${dropped.join(", ")}` : ""}])
y = df[target]

numeric_transformer = Pipeline([
    ("imputer", SimpleImputer(strategy="median")),
    ("scaler", StandardScaler())
])
categorical_transformer = Pipeline([
    ("imputer", SimpleImputer(strategy="most_frequent")),
    ("onehot", OneHotEncoder(handle_unknown="ignore"))
])
preprocess = ColumnTransformer([
    ("num", numeric_transformer, ${JSON.stringify(numeric)}),
    ("cat", categorical_transformer, ${JSON.stringify(categorical)})
])

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=${split.config.testSize}, random_state=${split.config.seed}, stratify=y
)

pipeline = Pipeline([
    ("preprocess", preprocess),
    ("model", ${modelExpr})
])

pipeline.fit(X_train, y_train)
predictions = pipeline.predict(X_test)
print(classification_report(y_test, predictions))`;
}

export function selectedNodeYaml(state: PipelineState): string {
  const node = state.nodes.find((item) => item.id === state.selectedNodeId) ?? state.nodes[0];
  return `selected_node:
  id: ${node.id}
  component: ${node.component}
  kind: ${node.kind}
  status: ${node.status}
  summary: ${node.summary}
  config:
${Object.entries(node.config).map(([key, value]) => `    ${key}: ${Array.isArray(value) ? value.join(", ") : value}`).join("\n")}`;
}

export function runsJson(state: PipelineState): string {
  return JSON.stringify({
    runs: [
      { id: "run_001", model: state.nodes.find((node) => node.id === "model")?.component, framework: state.framework, metric: "f1", score: 0.84, status: "simulated" },
      { id: "run_002", model: "XGBoostClassifier", framework: "sklearn", metric: "f1", score: 0.88, status: "candidate" },
    ],
    warnings: warningsForState(state),
  }, null, 2);
}

export function warningsForState(state: PipelineState): string[] {
  const warnings: string[] = [];
  const target = state.dataset?.columns.find((column) => column.role === "target");
  const transformText = state.transforms.join(" ").toLowerCase();
  const hasMissingStrategy = /(fill|impute|median|mean|mode|drop missing)/i.test(transformText);
  const modelPrep = state.nodes.find((node) => node.id === "modelPrep");
  const hasTorchPrep =
    Boolean(modelPrep?.config.tensorConversion) &&
    Number(modelPrep?.config.batchSize ?? 0) > 0 &&
    typeof modelPrep?.config.shuffle === "boolean";
  if (!target) warnings.push("Choose a target column before training.");
  if (state.dataset?.columns.some((column) => column.missing > 0) && !hasMissingStrategy) warnings.push("Missing values detected. Add a fill strategy before model training.");
  if (state.framework === "pytorch" && !hasTorchPrep) warnings.push("PyTorch checkpoint requires tensor conversion and DataLoader configuration.");
  if (state.framework === "recommender") warnings.push("Factorization machines require user/item interaction columns.");
  return warnings;
}

export function parseCodePatch(code: string): AssistantAction[] {
  const actions: AssistantAction[] = [];
  const test = code.match(/test_size:\s*([0-9.]+)/) ?? code.match(/test_size=([0-9.]+)/);
  if (test) actions.push({ type: "set_split", testSize: Number(test[1]) });
  const component = code.match(/component:\s*([A-Za-z0-9_]+)/);
  if (component && /(Classifier|Regression|Forest|XGBoost|Transformer|Torch|FM)/i.test(component[1])) actions.push({ type: "switch_model", model: component[1] });
  const metric = code.match(/optimize_for:\s*([A-Za-z0-9_]+)/) ?? code.match(/primary_metric:\s*([A-Za-z0-9_]+)/);
  if (metric) actions.push({ type: "set_metric", metric: metric[1] });
  if (/fill missing|impute|simpleimputer|median|mode|mean/i.test(code)) actions.push({ type: "add_transform", transform: "Fill missing Age/Embarked with median/mode" });
  if (/one.?hot|get_dummies|onehotencoder/i.test(code)) actions.push({ type: "add_transform", transform: "One-hot encode Sex and Embarked" });
  if (/standardscaler|scale numeric|standard scale/i.test(code)) actions.push({ type: "add_transform", transform: "Standard scale numeric features" });
  if (/framework:\s*pytorch|DataLoader|torch\./i.test(code)) actions.push({ type: "set_framework", framework: "pytorch" });
  if (/framework:\s*recommender|Factorization|user_id|item_id/i.test(code)) actions.push({ type: "set_framework", framework: "recommender" });
  return actions;
}

export function actionFromPrompt(prompt: string): AssistantAction[] {
  const text = prompt.toLowerCase();
  const actions: AssistantAction[] = [];
  if (text.includes("80/20") || text.includes("0.2")) actions.push({ type: "set_split", testSize: 0.2 });
  if (text.includes("70/30") || text.includes("0.3")) actions.push({ type: "set_split", testSize: 0.3 });
  if (text.includes("xgboost")) actions.push({ type: "switch_model", model: "XGBoostClassifier" });
  if (text.includes("random forest")) actions.push({ type: "switch_model", model: "RandomForestClassifier" });
  if (text.includes("logistic")) actions.push({ type: "switch_model", model: "LogisticRegression" });
  if (text.includes("pytorch") || text.includes("neural net")) actions.push({ type: "set_framework", framework: "pytorch" });
  if (text.includes("factorization") || text.includes("recommender") || text.includes("matrix")) actions.push({ type: "set_framework", framework: "recommender" });
  if (text.includes("one hot") || text.includes("one-hot")) actions.push({ type: "add_transform", transform: "One-hot encode categoricals" });
  if (text.includes("fill") || text.includes("missing") || text.includes("impute") || text.includes("median")) actions.push({ type: "add_transform", transform: "Fill missing Age/Embarked with median/mode" });
  if (text.includes("standard") || text.includes("scale")) actions.push({ type: "add_transform", transform: "Standard scale numeric features" });
  if (text.includes("precision")) actions.push({ type: "set_metric", metric: "precision" });
  if (text.includes("recall")) actions.push({ type: "set_metric", metric: "recall" });
  return actions.length ? actions : [{ type: "add_transform", transform: "Validate schema and detect leakage" }];
}

export function applyActions(state: PipelineState, actions: AssistantAction[], source = "Applied change"): PipelineState {
  let next: PipelineState = { ...state, nodes: state.nodes.map((node) => ({ ...node, config: { ...node.config } })), transforms: [...state.transforms], assistantLog: [...state.assistantLog] };
  for (const action of actions) {
    if (action.type === "set_split") {
      next.nodes = next.nodes.map((node) => node.id === "split" ? { ...node, status: "Configured", config: { ...node.config, testSize: action.testSize } } : node);
    }
    if (action.type === "switch_model") {
      next.nodes = next.nodes.map((node) => node.id === "model" ? { ...node, component: action.model, status: "Needs rerun", summary: summaryForModel(action.model), config: { ...node.config, metric: node.config.metric ?? "f1" } } : node);
      if (/Transformer|Torch|Neural/i.test(action.model)) next.framework = "pytorch";
    }
    if (action.type === "set_framework") {
      next.framework = action.framework;
      const prep = action.framework === "pytorch" ? "TorchDataLoaderPrep" : action.framework === "recommender" ? "FactorizationMachinePrep" : "SklearnMatrixPrep";
      const model = action.framework === "pytorch" ? "TorchMLPClassifier" : action.framework === "recommender" ? "FactorizationMachine" : "LogisticRegression";
      next.nodes = next.nodes.map((node) => node.id === "modelPrep" ? {
        ...node,
        component: prep,
        status: action.framework === "pytorch" ? "Ready" : "Checkpoints required",
        summary: prepDetail(action.framework),
        config: action.framework === "pytorch"
          ? { checkpoints: prepDetail(action.framework), tensorConversion: true, tensorDtype: "float32", targetShape: "column", batchSize: 32, shuffle: true, numWorkers: 0, pinMemory: false, dropLast: false }
          : { checkpoints: prepDetail(action.framework) },
      } : node.id === "model" ? { ...node, component: model, status: "Needs rerun", summary: summaryForModel(model) } : node);
    }
    if (action.type === "add_transform" && !next.transforms.includes(action.transform)) next.transforms.push(action.transform);
    if (action.type === "set_metric") {
      next.nodes = next.nodes.map((node) => node.id === "model" || node.id === "eval" ? { ...node, config: { ...node.config, metric: action.metric, primary: action.metric } } : node);
    }
  }
  next.edges = updateEdgesForState(next);
  next.code = generatePipelineYaml(next);
  next.assistantLog.push(`${source}: ${actions.map((action) => action.type).join(", ")}`);
  next.lastMessage = source;
  return next;
}

function summaryForModel(model: string): string {
  if (model.includes("XGBoost")) return "Gradient boosted trees with tunable depth, learning rate, and estimators.";
  if (model.includes("RandomForest")) return "Robust tree ensemble for tabular classification with feature importance.";
  if (model.includes("Torch") || model.includes("MLP")) return "PyTorch neural network using tensors, DataLoader, optimizer, and loss.";
  if (model.includes("Factorization")) return "Recommender model for sparse user-item interaction features.";
  return "Baseline classifier optimized for fast iteration.";
}
