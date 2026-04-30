const nodeData = {
  data: {
    title: "DatasetLoader",
    status: "Ready",
    source: "s3://datasets/customers.csv",
    target: "churned",
  },
  prep: {
    title: "PrepareData",
    status: "Cached",
    source: "DatasetLoader.output",
    target: "PreparedData",
  },
  model: {
    title: "LogisticRegression",
    status: "Needs rerun",
    source: "PrepareData.output",
    target: "ModelArtifact",
  },
  search: {
    title: "ChangeImpact",
    status: "Preview",
    source: "Pipeline graph",
    target: "ImpactPlan",
  },
  agent: {
    title: "PipelineAssistant",
    status: "Guiding",
    source: "PreparedData + ModelArtifact + ImpactPlan",
    target: "GuidedPipeline",
  },
};

const shelfItems = document.querySelectorAll(".component-item[draggable='true']");
let nodes = document.querySelectorAll(".flow-node");
const canvas = document.querySelector(".canvas");
const wires = document.querySelector(".wires");
const wirePaths = document.querySelectorAll(".wire");
const ideStatus = document.querySelector("#ideStatus");
const codeEditor = document.querySelector("#codeEditor");
const codeFeedback = document.querySelector("#codeFeedback");
const applyCodeBtn = document.querySelector("#applyCodeBtn");
const lineNumbers = document.querySelector("#lineNumbers");

let selectedNodeId = "data";
let dragState = null;
let shelfDragState = null;
let createdNodeCount = 0;

function setCodeFeedback(message, state = "") {
  codeFeedback.textContent = message;
  codeFeedback.className = state;
}

function updateLineNumbers() {
  const count = Math.max(codeEditor.value.split("\n").length, 1);
  lineNumbers.innerHTML = Array.from({ length: count }, (_, index) => index + 1).join("<br />");
}

function selectNode(node) {
  selectedNodeId = node.dataset.node;
  nodes.forEach((item) => item.classList.toggle("selected", item === node));
  ideStatus.textContent = nodeData[selectedNodeId].status;
  setCodeFeedback(`Selected ${nodeData[selectedNodeId].title}. Edit pipeline.yml and apply to update the graph.`);
}

function nodeBox(nodeId) {
  const node = document.querySelector(`[data-node="${nodeId}"]`);
  const left = node.offsetLeft;
  const top = node.offsetTop;
  const width = node.offsetWidth;
  const height = node.offsetHeight;

  return {
    left,
    right: left + width,
    top,
    bottom: top + height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
}

function drawWires() {
  wires.setAttribute("viewBox", `0 0 ${canvas.clientWidth} ${canvas.clientHeight}`);

  wirePaths.forEach((path) => {
    if (!document.querySelector(`[data-node="${path.dataset.from}"]`)) return;
    if (!document.querySelector(`[data-node="${path.dataset.to}"]`)) return;

    const fromBox = nodeBox(path.dataset.from);
    const toBox = nodeBox(path.dataset.to);
    const dx = toBox.centerX - fromBox.centerX;
    const dy = toBox.centerY - fromBox.centerY;

    if (Math.abs(dx) < 120 && Math.abs(dy) > 80) {
      const from = {
        x: fromBox.centerX,
        y: dy > 0 ? fromBox.bottom : fromBox.top,
      };
      const to = {
        x: toBox.centerX,
        y: dy > 0 ? toBox.top : toBox.bottom,
      };
      const distance = Math.max(58, Math.abs(to.y - from.y) * 0.42);

      path.setAttribute(
        "d",
        `M ${from.x} ${from.y} C ${from.x} ${from.y + Math.sign(dy) * distance}, ${to.x} ${
          to.y - Math.sign(dy) * distance
        }, ${to.x} ${to.y}`,
      );
      return;
    }

    const from = {
      x: dx >= 0 ? fromBox.right : fromBox.left,
      y: fromBox.centerY,
    };
    const to = {
      x: dx >= 0 ? toBox.left : toBox.right,
      y: toBox.centerY,
    };
    const distance = Math.max(70, Math.abs(to.x - from.x) * 0.48);
    const direction = dx >= 0 ? 1 : -1;
    const c1x = from.x + direction * distance;
    const c2x = to.x - direction * distance;

    path.setAttribute(
      "d",
      `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`,
    );
  });
}

function readYamlValue(code, key) {
  const match = code.match(new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, "m"));
  return match ? match[1].replace(/^["']|["']$/g, "") : "";
}

function inferNodeIdFromCode(code, parsed) {
  const component = parsed.component.toLowerCase();

  if (code.includes("\n  data:") || component.includes("loader") || component.includes("dataset")) {
    return "data";
  }

  if (code.includes("\n  prepare:") || component.includes("prepare") || component.includes("encoder")) {
    return "prep";
  }

  if (
    code.includes("\n  train:") ||
    component.includes("classifier") ||
    component.includes("regression") ||
    component.includes("model")
  ) {
    return "model";
  }

  if (code.includes("change_impact") || component.includes("impact")) {
    return "search";
  }

  if (code.includes("assistant") || component.includes("assistant")) {
    return "agent";
  }

  return selectedNodeId;
}

function updateNodeBlock(nodeId, parsed) {
  const node = document.querySelector(`[data-node="${nodeId}"]`);
  const title = node.querySelector(".node-title strong");
  const desc = node.querySelector(".node-desc");
  const inputs = node.querySelectorAll(".node-input");
  const footer = node.querySelector("footer span");

  if (parsed.component) {
    title.textContent = parsed.component;
  }

  if (nodeId === "data") {
    if (parsed.source && inputs[0]) {
      inputs[0].innerHTML = `${parsed.source} <span>↗</span>`;
    }
    if (parsed.target && inputs[1]) {
      inputs[1].innerHTML = `${parsed.target} <span>↗</span>`;
    }
    footer.textContent = parsed.component || "DatasetLoader";
    desc.textContent = `Load ${parsed.target || "target"} data from the configured source.`;
  }

  if (nodeId === "model") {
    const metric = parsed.optimize_for || parsed.metric || "f1";
    const depth = parsed.max_depth ? ` / max_depth ${parsed.max_depth}` : "";
    if (inputs[0]) {
      inputs[0].textContent = `${metric.toUpperCase()} score${depth}`;
    }
    desc.textContent = parsed.component?.includes("XGBoost")
      ? "Tree-based classifier with tuned depth and learning rate."
      : "Classifier configured from pipeline.yml.";
    footer.textContent = parsed.output || "ModelArtifact";
  }

  if (nodeId === "prep" || nodeId === "search" || nodeId === "agent") {
    desc.textContent = parsed.component
      ? `${parsed.component} configured from pipeline.yml.`
      : desc.textContent;
  }
}

function applyCodeToGraph() {
  const code = codeEditor.value.trim();
  const parsed = {
    component: readYamlValue(code, "component"),
    source: readYamlValue(code, "source") || readYamlValue(code, "input"),
    target: readYamlValue(code, "target"),
    output: readYamlValue(code, "output"),
    optimize_for: readYamlValue(code, "optimize_for"),
    metric: readYamlValue(code, "metric"),
    max_depth: readYamlValue(code, "max_depth"),
  };

  if (!code.includes("pipeline:")) {
    setCodeFeedback("Missing top-level pipeline key. Nothing applied.", "error");
    return;
  }

  const targetNodeId = inferNodeIdFromCode(code, parsed);
  const titleFallback = targetNodeId === "data" ? "DatasetLoader" : nodeData[targetNodeId].title;

  nodeData[targetNodeId] = {
    ...nodeData[targetNodeId],
    title: parsed.component || titleFallback,
    source: parsed.source || nodeData[targetNodeId].source,
    target: parsed.target || parsed.output || nodeData[targetNodeId].target,
    status: targetNodeId === "data" ? "Ready" : "Needs rerun",
  };

  updateNodeBlock(targetNodeId, parsed);
  selectNode(document.querySelector(`[data-node="${targetNodeId}"]`));
  setCodeFeedback(`Applied pipeline.yml to ${nodeData[targetNodeId].title}.`, "ok");
}

nodes.forEach((node) => {
  registerNode(node);
});

function registerNode(node) {
  node.addEventListener("click", () => selectNode(node));
  node.addEventListener("pointerdown", startNodeDrag);
}

function nodeMarkup({ id, title, kind, x, y }) {
  const icon = {
    data: "▣",
    prep: "⛓",
    model: "◌",
    eval: "⌁",
    deploy: "⚒",
  }[kind] || "□";
  const iconClass = {
    data: "blue",
    prep: "teal",
    model: "purple",
    eval: "red",
    deploy: "red",
  }[kind] || "blue";
  const description = {
    data: "New data component dropped from the library.",
    prep: "New preparation step dropped from the library.",
    model: "New model component dropped from the library.",
    eval: "New evaluation component dropped from the library.",
    deploy: "New deployment component dropped from the library.",
  }[kind] || "New pipeline component.";

  return `
    <article class="flow-node" style="left: ${x}px; top: ${y}px" data-node="${id}">
      <div class="node-title">
        <span class="node-icon ${iconClass}">${icon}</span>
        <strong>${title}</strong>
        <button>⌫</button>
      </div>
      <p class="node-desc">${description}</p>
      <label>Input</label>
      <div class="node-input">Unconnected</div>
      <div class="io-title">Output:</div>
      <footer><span>${title}</span><i class="port out ${iconClass}"></i></footer>
    </article>
  `;
}

function createNodeFromShelf(component, kind, clientX, clientY) {
  const canvasRect = canvas.getBoundingClientRect();
  const id = `${kind}-${Date.now()}-${createdNodeCount++}`;
  const x = Math.max(8, Math.min(canvas.clientWidth - 176, clientX - canvasRect.left - 83));
  const y = Math.max(8, Math.min(canvas.clientHeight - 140, clientY - canvasRect.top - 18));

  canvas.insertAdjacentHTML("beforeend", nodeMarkup({ id, title: component, kind, x, y }));
  const node = canvas.querySelector(`[data-node="${id}"]`);
  nodeData[id] = {
    title: component,
    status: "New",
    source: "Unconnected",
    target: `${component}.output`,
  };

  nodes = document.querySelectorAll(".flow-node");
  registerNode(node);
  selectNode(node);
  drawWires();
  setCodeFeedback(`Added ${component}. Drag it to position or edit pipeline.yml.`, "ok");
}

shelfItems.forEach((item) => {
  item.addEventListener("pointerdown", startShelfDrag);
  item.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        component: item.dataset.component,
        kind: item.dataset.kind,
      }),
    );
    event.dataTransfer.effectAllowed = "copy";
  });
});

function startShelfDrag(event) {
  if (event.button !== 0) return;

  event.preventDefault();
  const item = event.currentTarget;
  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.textContent = item.dataset.component;
  document.body.appendChild(ghost);

  shelfDragState = {
    component: item.dataset.component,
    kind: item.dataset.kind,
    ghost,
  };

  moveShelfGhost(event);
  document.addEventListener("pointermove", moveShelfGhost);
  document.addEventListener("pointerup", stopShelfDrag);
}

function moveShelfGhost(event) {
  if (!shelfDragState) return;

  shelfDragState.ghost.style.left = `${event.clientX + 10}px`;
  shelfDragState.ghost.style.top = `${event.clientY + 10}px`;

  const canvasRect = canvas.getBoundingClientRect();
  const overCanvas =
    event.clientX >= canvasRect.left &&
    event.clientX <= canvasRect.right &&
    event.clientY >= canvasRect.top &&
    event.clientY <= canvasRect.bottom;
  canvas.classList.toggle("drag-over", overCanvas);
}

function stopShelfDrag(event) {
  if (!shelfDragState) return;

  const canvasRect = canvas.getBoundingClientRect();
  const overCanvas =
    event.clientX >= canvasRect.left &&
    event.clientX <= canvasRect.right &&
    event.clientY >= canvasRect.top &&
    event.clientY <= canvasRect.bottom;

  if (overCanvas) {
    createNodeFromShelf(shelfDragState.component, shelfDragState.kind, event.clientX, event.clientY);
  }

  shelfDragState.ghost.remove();
  shelfDragState = null;
  canvas.classList.remove("drag-over");
  document.removeEventListener("pointermove", moveShelfGhost);
  document.removeEventListener("pointerup", stopShelfDrag);
}

canvas.addEventListener("dragover", (event) => {
  event.preventDefault();
  canvas.classList.add("drag-over");
  event.dataTransfer.dropEffect = "copy";
});

canvas.addEventListener("dragleave", (event) => {
  if (!canvas.contains(event.relatedTarget)) {
    canvas.classList.remove("drag-over");
  }
});

canvas.addEventListener("drop", (event) => {
  event.preventDefault();
  canvas.classList.remove("drag-over");

  const raw = event.dataTransfer.getData("application/json");
  if (!raw) return;

  const dropped = JSON.parse(raw);
  createNodeFromShelf(dropped.component, dropped.kind, event.clientX, event.clientY);
});

function startNodeDrag(event) {
  if (event.button !== 0) return;
  if (event.target.closest("button")) return;

  const node = event.currentTarget;
  const canvasRect = canvas.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();

  selectNode(node);
  dragState = {
    node,
    offsetX: event.clientX - nodeRect.left,
    offsetY: event.clientY - nodeRect.top,
    canvasLeft: canvasRect.left,
    canvasTop: canvasRect.top,
  };

  node.classList.add("dragging");
  node.setPointerCapture(event.pointerId);
  node.addEventListener("pointermove", moveNode);
  node.addEventListener("pointerup", stopNodeDrag);
  node.addEventListener("pointercancel", stopNodeDrag);
}

function moveNode(event) {
  if (!dragState) return;

  const maxX = canvas.clientWidth - dragState.node.offsetWidth - 8;
  const maxY = canvas.clientHeight - dragState.node.offsetHeight - 8;
  const nextX = event.clientX - dragState.canvasLeft - dragState.offsetX;
  const nextY = event.clientY - dragState.canvasTop - dragState.offsetY;
  const clampedX = Math.max(8, Math.min(maxX, nextX));
  const clampedY = Math.max(8, Math.min(maxY, nextY));

  dragState.node.style.left = `${Math.round(clampedX)}px`;
  dragState.node.style.top = `${Math.round(clampedY)}px`;
  drawWires();
}

function stopNodeDrag(event) {
  if (!dragState) return;

  dragState.node.classList.remove("dragging");
  dragState.node.releasePointerCapture(event.pointerId);
  dragState.node.removeEventListener("pointermove", moveNode);
  dragState.node.removeEventListener("pointerup", stopNodeDrag);
  dragState.node.removeEventListener("pointercancel", stopNodeDrag);
  setCodeFeedback(`Moved ${nodeData[dragState.node.dataset.node].title} on the canvas.`, "ok");
  dragState = null;
}

codeEditor.addEventListener("input", updateLineNumbers);
codeEditor.addEventListener("scroll", () => {
  lineNumbers.scrollTop = codeEditor.scrollTop;
});

applyCodeBtn.addEventListener("click", applyCodeToGraph);
window.addEventListener("resize", drawWires);
updateLineNumbers();
drawWires();
