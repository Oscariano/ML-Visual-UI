# ML Visual UI Design

## Purpose

ML Visual UI is a visual ML pipeline builder for software engineers who understand code and system architecture, but do not necessarily know ML workflows deeply.

The current local prototype is a design reference for developers. The production implementation should preserve the same layout, component categories, and interaction model.

Prototype files:

- `index.html`
- `styles.css`
- `script.js`

Local preview:

```text
http://localhost:4173
```

## Product Thesis

The product should feel like:

```text
Langflow-style visual canvas + normal IDE editor + ML-aware pipeline blocks
```

The graph gives users a visual mental model of the pipeline. The right-side IDE gives engineers a familiar place to edit `pipeline.yml`. Changes in code should be able to update the visual graph, and visual changes should remain understandable from the code.

## Target User

Primary user:

- Software engineer building or modifying ML pipelines.
- Comfortable editing code/config.
- Unfamiliar with many ML-specific choices and consequences.

Their core needs:

- See the full pipeline structure.
- Add pipeline components without knowing every ML primitive.
- Move blocks around spatially.
- Understand which blocks connect to each other.
- Edit pipeline configuration directly in an IDE-like panel.
- See code changes reflected in the visual blocks.

## Required Layout

The layout must remain a three-zone app:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Left Components │ Canvas / Node Graph                 │ IDE Editor   │
│ Panel           │                                      │ pipeline.yml │
└──────────────────────────────────────────────────────────────────────┘
```

### Left Panel

The left panel is a fixed component library. It must stay on the left side of the app.

Header:

```text
ML Visual UI
```

Component groups must remain:

- Data
- Prepare
- Models
- Evaluation
- Deploy

Current component list:

```text
Data
  DatasetLoader
  FeatureTable

Prepare
  SchemaCheck
  TrainTestSplit
  CategoricalEncoder

Models
  LogisticRegression
  XGBoostClassifier
  TransformerModel

Evaluation
  MetricReport
  CompareRuns

Deploy
  FastAPIEndpoint
  BatchInference
```

Behavior:

- Components are draggable.
- Dragging a component from the left panel into the canvas creates a new block.
- Newly created blocks should be selectable and movable.

### Center Canvas

The center area is a dotted node canvas, visually similar to Langflow or ComfyUI.

Canvas requirements:

- Dotted grid background.
- Compact rectangular node blocks.
- Curved wires between connected blocks.
- Blocks are draggable.
- Wires remain attached when blocks move.
- Canvas controls appear at the lower left.
- The canvas remains the main spatial map of the ML pipeline.

Initial graph blocks:

```text
DatasetLoader -> PrepareData -> LogisticRegression -> PipelineAssistant
PrepareData -> PipelineAssistant
ChangeImpact -> PipelineAssistant
```

Initial visible blocks:

- DatasetLoader
- PrepareData
- LogisticRegression
- ChangeImpact
- PipelineAssistant

The canvas should not become a dashboard or form-heavy UI. Details belong in the right IDE or inside compact node summaries.

### Right IDE

The right side is a normal IDE-like editor, not a chat panel and not a small inspector.

It should take roughly one quarter of the screen.

Required visual structure:

```text
File tabs:
  pipeline.yml | selected-node.yml | runs.json

Breadcrumb:
  ml-visual-ui › flows › pipeline.yml

Editor:
  line numbers
  large writable text area

Status bar:
  feedback text
  Apply code button
```

The main open file is:

```text
pipeline.yml
```

Users should be able to write YAML-like pipeline config directly in this editor.

Example:

```yaml
pipeline:
  train:
    component: XGBoostClassifier
    input: PreparedData
    optimize_for: f1
    max_depth: 8
    learning_rate: 0.05
```

Applying the code should update the corresponding visual block.

## Core Interactions

### 1. Move Blocks

Users can drag existing blocks around the canvas.

Expected behavior:

- The block follows the pointer.
- The selected state follows the moved block.
- Connected wires update live.
- The IDE status bar confirms the move.

### 2. Connected Wires

Blocks are connected by dynamic SVG wires.

Expected behavior:

- Wires attach to node positions.
- Wires redraw on drag.
- Wires redraw on window resize.
- Side-by-side nodes use side ports.
- Vertically stacked nodes use top/bottom routing where needed.

### 3. Drag From Component Library

Users can drag items from the left panel into the canvas.

Expected behavior:

- A drag ghost appears.
- Canvas gives visual feedback while dragging over it.
- Dropping creates a new block at the drop position.
- The new block is selected.
- The new block can be moved after creation.

### 4. Edit Code To Update Graph

Users can edit `pipeline.yml` in the right IDE.

Expected behavior:

- Line numbers update as the user types.
- `Apply code` parses key YAML-like fields.
- The app infers which block should update from the code.
- The visual block title and summary update.
- Status bar confirms the applied change.

Supported fields in the current prototype:

```text
component
source
input
target
output
optimize_for
metric
max_depth
```

Example effect:

```yaml
pipeline:
  train:
    component: LightGBMClassifier
    input: PreparedData
    optimize_for: precision
    max_depth: 10
    n_estimators: 250
```

This should update the model block to:

```text
LightGBMClassifier
PRECISION score / max_depth 10
```

## Visual Style

The visual style should stay close to the prototype:

- White/light-gray app shell.
- Dotted canvas background.
- Thin borders.
- Small compact node cards.
- Muted professional colors.
- Category color rails/icons:
  - Data: teal/blue
  - Prepare: blue/teal
  - Models: purple
  - Evaluation: amber
  - Deploy: red
- IDE editor should look closer to VS Code than to a settings panel.

Avoid:

- Toy-like Scratch colors.
- Large marketing-page UI.
- Chat-first layout.
- Oversized cards.
- Replacing the IDE with a form-only inspector.

## Information Architecture

The system has three main representations of the same pipeline:

```text
Component library
  available building blocks

Canvas graph
  visual pipeline structure

pipeline.yml
  editable code/config source
```

These should stay synchronized where possible.

## Implementation Notes

The current prototype is plain HTML/CSS/JS. A production version can use a framework, but should preserve the same structure.

Important implementation concepts:

- Nodes should have stable IDs.
- Connections should be represented as data, not hardcoded SVG paths.
- Canvas wires should be rendered from source/target node positions.
- Drag/drop from the component library should create new node records.
- Code changes should update node records, then render the graph from state.

Suggested state shape:

```ts
type Node = {
  id: string;
  component: string;
  kind: "data" | "prep" | "model" | "eval" | "deploy" | "assistant" | "impact";
  x: number;
  y: number;
  config: Record<string, unknown>;
};

type Edge = {
  id: string;
  from: string;
  to: string;
};

type Pipeline = {
  nodes: Node[];
  edges: Edge[];
  code: string;
};
```

## Acceptance Criteria

A developer implementation matches this design when:

- The left component panel uses the same categories and components.
- The center canvas contains draggable node blocks.
- The node blocks are connected by wires.
- Wires stay attached when blocks move.
- Components can be dragged from the left panel into the canvas.
- The right side is a full-height IDE-like `pipeline.yml` editor.
- Editing and applying code updates the visual block.
- The layout remains left panel, center canvas, right IDE.

## Future Enhancements

Potential next steps after the prototype:

- Connect newly dropped blocks by dragging from output port to input port.
- Generate `pipeline.yml` from graph changes.
- Add validation diagnostics in the IDE gutter.
- Add autocomplete for available components and ML parameters.
- Add run history in `runs.json`.
- Add selected-node details in `selected-node.yml`.
- Persist node positions and edges.
- Add undo/redo for graph and code changes.

