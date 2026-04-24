import { useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import '@xyflow/react/dist/style.css'
import type { ServiceNode, ServiceEdge } from '../types'

const NODE_W = 160
const NODE_H = 64

const PROTOCOL_COLORS: Record<string, string> = {
  grpc:  '#3b82f6',
  http:  '#06b6d4',
  kafka: '#8b5cf6',
  amqp:  '#f59e0b',
}

const LANG_COLORS: Record<string, string> = {
  Python:     '#3b82f6',
  Go:         '#06b6d4',
  TypeScript: '#8b5cf6',
  JavaScript: '#f59e0b',
  Java:       '#ef4444',
  Kotlin:     '#a855f7',
  Rust:       '#f97316',
  Ruby:       '#e11d48',
  '.NET':     '#6366f1',
}

function layout(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 70, nodesep: 40, marginx: 30, marginy: 30 })
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return {
    nodes: nodes.map((n) => {
      const { x, y } = g.node(n.id)
      return { ...n, position: { x: x - NODE_W / 2, y: y - NODE_H / 2 } }
    }),
    edges,
  }
}

interface Props {
  services: ServiceNode[]
  edges: ServiceEdge[]
  title?: string
}

export default function ScanGraph({ services, edges, title }: Props) {
  const rawNodes: Node[] = useMemo(
    () =>
      services.map((svc) => {
        const isExternal = svc.node_type === 'external'
        const borderColor = isExternal
          ? '#f97316'
          : (LANG_COLORS[svc.language] ?? '#1e2d45')
        return {
          id: svc.id,
          type: 'default',
          position: { x: 0, y: 0 },
          data: {
            label: isExternal ? `${svc.name} ↗` : svc.name,
          },
          style: {
            background: isExternal ? '#1a0f06' : '#0d1526',
            border: `1px solid ${borderColor}${isExternal ? '' : '40'}`,
            borderRadius: '8px',
            color: isExternal ? '#fdba74' : '#e2e8f0',
            fontSize: '11px',
            padding: '6px 10px',
            width: NODE_W,
            minHeight: NODE_H,
            display: 'flex',
            flexDirection: 'column' as const,
            gap: '2px',
          },
        }
      }),
    [services],
  )

  const rawEdges: Edge[] = useMemo(
    () =>
      edges.map((e, i) => {
        const color = PROTOCOL_COLORS[e.protocol] ?? '#475569'
        const isCrossRepo = e.label === 'cross-repo'
        const isExternal = e.label === 'external'
        const edgeColor = isCrossRepo ? '#f59e0b' : isExternal ? '#f97316' : color
        return {
          id: `sg-${i}-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          animated: isCrossRepo || isExternal,
          style: {
            stroke: edgeColor,
            strokeWidth: isExternal ? 2 : isCrossRepo ? 2 : 1.5,
            strokeDasharray: isCrossRepo ? '6 3' : isExternal ? '4 2' : undefined,
            opacity: 0.8,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: edgeColor,
            width: 10,
            height: 10,
          },
          label: isCrossRepo
            ? '↔ cross-repo'
            : isExternal
              ? '↗ ext'
              : e.protocol !== 'http'
                ? e.protocol
                : undefined,
          labelStyle: { fill: isExternal ? '#f97316' : '#64748b', fontSize: 9 },
          labelBgStyle: { fill: '#0d1526', opacity: 0.8 },
        }
      }),
    [edges],
  )

  const { nodes: ln, edges: le } = useMemo(() => layout(rawNodes, rawEdges), [rawNodes, rawEdges])

  const [nodes, setNodes, onNodesChange] = useNodesState(ln)
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState(le)

  useEffect(() => { setNodes(ln); setEdges(le) }, [ln, le, setNodes, setEdges])

  if (services.length === 0) return null

  return (
    <div className="bg-[#080c14] border border-[#1e2d45] rounded-xl overflow-hidden">
      {title && (
        <div className="px-4 py-2.5 border-b border-[#1e2d45] flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400">{title}</span>
          <span className="text-[10px] text-slate-600">{services.length} services · {edges.length} edges</span>
        </div>
      )}
      <div style={{ height: Math.max(260, Math.min(services.length * 60, 480)) }}>
        <ReactFlow
          nodes={nodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={true}
          zoomOnScroll={true}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e2d45" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}
