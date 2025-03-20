import mermaid from 'mermaid'

import './styles.css'

export interface GraphData {
  nodes: Array<{ name: string, path: string }>;
  edges: Array<[number, number, null]>;
  [key: string]: any;
}

function graphDataToMermaidMarkdown(data: GraphData): string {
  const lines = ["graph LR"];
  for (const [index, node] of data.nodes.entries()) {
    // TODO: unescape
    lines.push(`${index}("${node.name}<br/>${node.path}")`)
  }
  for (const [from, to] of data.edges) {
    lines.push(`${from} --> ${to}`)
  }
  lines.push('', 'linkStyle default stroke-width:2px;');
  return lines.join('\n');
}

mermaid.initialize({
  securityLevel: 'loose',
  theme: 'base',
  fontFamily: 'inherit',
  flowchart: {
    padding: 8,
    wrappingWidth: 180,
  },
  themeVariables: {
    fontSize: "13px",
    lineColor: '#D0D9E0',
    primaryBorderColor: 'rgb(209, 217, 224)',
    primaryColor: '#FFFFFF'
  }
});

const mermaidCanvas = document.getElementById('mermaid-canvas')!;


function getTargetNodeId(e: MouseEvent): number | null {
  const target = e.target;
  if (!(target instanceof Element)) return null;
  const elementId = target.closest('.node')?.id;
  if (elementId === undefined) {
    return null
  }
  const [, idString] = elementId.split('-')
  const id = parseInt(idString);
  return isNaN(id) ? null : id;
}

interface Dependencies {
  ids: Array<number>,
  edges: Array<[number, number]>,
}

function getDependencies(graphData: GraphData, startingNodeId: number): Dependencies {
  let leafs = [startingNodeId];
  const ids = new Set<number>(leafs);
  const edges: Array<[number, number]> = [];
  while (leafs.length > 0) {
    const nextLeafs: Array<number> = [];
    for (const id of leafs) {
      const newEdges = graphData.edges.filter(([from,]) => from === id)
      for (const [from, to] of newEdges) {
        edges.push([from, to])
        if (!ids.has(to)) {
          ids.add(to);
          nextLeafs.push(to);
        }
      }
    }
    leafs = nextLeafs;
  }
  return { ids: Array.from(ids), edges }
}


(async () => {
  let graphData: GraphData;
  if (import.meta.env.PROD) {
    graphData = await (await fetch('graph.json')).json()
  } else {
    graphData = (await import('./test_graph_data')).graphData
  }

  const mermaidMarkdown = graphDataToMermaidMarkdown(graphData);
  const renderResult = await mermaid.render("mermaid-svg", mermaidMarkdown);

  mermaidCanvas.innerHTML = renderResult.svg
  renderResult.bindFunctions?.(mermaidCanvas)
  mermaidCanvas.addEventListener('mouseover', (e: MouseEvent) => {
    const id = getTargetNodeId(e);
    if (id === null) {
      for (const element of [...mermaidCanvas.getElementsByClassName('highlighted')]) {
        element.classList.remove('highlighted')
      }
    } else {
      const { ids, edges } = getDependencies(graphData, id);
      for (const id of ids) {
        document.getElementById(`flowchart-${id}-${id}`)!.classList.add('highlighted')
      }
      for (const [from, to] of edges) {
        document.getElementById(`L_${from}_${to}_0`)!.classList.add('highlighted')
      }
    }
  })
})().catch(err => {
  document.body.textContent = `${err}`
  console.error(err)
})
