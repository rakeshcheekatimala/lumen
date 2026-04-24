import React, { useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  BackgroundVariant,
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import '@xyflow/react/dist/style.css'
import ServiceNodeComponent from './ServiceNode'
import type { DependencyGraph as GraphData, BlastRadiusResult, ServiceNode, RiskLevel } from '../types'

const NODE_WIDTH = 200
const NODE_HEIGHT = 90

const PROTOCOL_COLORS: Record<string, string> = {
  grpc: '#3b82f6',
  http: '#06b6d4',
  kafka: '#8b5cf6',
}

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 60, marginx: 40, marginy: 40 })

  nodes.forEach((node) => g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT }))
  edges.forEach((edge) => g.setEdge(edge.source, edge.target))

  dagre.layout(g)

  return {
    nodes: nodes.map((node) => {
      const { x, y } = g.node(node.id)
      return { ...node, position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 } }
    }),
    edges,
  }
}

function impactLevelFor(
  serviceId: string,
  blastRadius: BlastRadiusResult | null,
  changedServiceId: string | null,
): RiskLevel {
  if (!blastRadius) return 'none'
  if (serviceId === changedServiceId) return 'none'
  const impacted = blastRadius.impacted_services.find((s) => s.service_id === serviceId)
  if (!impacted) return 'none'
  return impacted.risk_level as RiskLevel
}

interface Props {
  graph: GraphData
  blastRadius: BlastRadiusResult | null
  changedServiceId: string | null
  onNodeClick: (service: ServiceNode) => void
}

const nodeTypes = { serviceNode: ServiceNodeComponent }

export default function DependencyGraph({ graph, blastRadius, changedServiceId, onNodeClick }: Props) {
  const serviceMap = useMemo(
    () => Object.fromEntries(graph.services.map((s) => [s.id, s])),
    [graph.services],
  )

  const rawNodes: Node[] = useMemo(
    () =>
      graph.services.map((svc) => ({
        id: svc.id,
        type: 'serviceNode',
        position: { x: 0, y: 0 },
        data: {
          label: svc.name,
          language: svc.language,
          team: svc.team,
          riskScore: svc.risk_score,
          endpointCount: svc.endpoints.length,
          impactLevel: impactLevelFor(svc.id, blastRadius, changedServiceId),
          isChanged: svc.id === changedServiceId,
        },
      })),
    [graph.services, blastRadius, changedServiceId],
  )

  const rawEdges: Edge[] = useMemo(
    () =>
      graph.edges.map((edge, i) => {
        const isImpactedEdge =
          blastRadius !== null &&
          blastRadius.impacted_services.some((s) => s.service_id === edge.source) &&
          (edge.target === changedServiceId ||
            blastRadius.impacted_services.some((s) => s.service_id === edge.target))

        const protocol = edge.protocol || 'http'
        const color = isImpactedEdge ? '#ef4444' : (PROTOCOL_COLORS[protocol] || '#475569')

        return {
          id: `e-${i}-${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          animated: isImpactedEdge,
          style: { stroke: color, strokeWidth: isImpactedEdge ? 2.5 : 1.5, opacity: 0.85 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 12,
            height: 12,
          },
          label: edge.protocol !== 'http' ? edge.protocol : undefined,
          labelStyle: { fill: '#64748b', fontSize: 9 },
          labelBgStyle: { fill: '#0d1526', opacity: 0.8 },
        }
      }),
    [graph.edges, blastRadius, changedServiceId],
  )

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(rawNodes, rawEdges),
    [rawNodes, rawEdges],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges)

  useEffect(() => {
    setNodes(layoutedNodes)
    setEdges(layoutedEdges)
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges])

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const svc = serviceMap[node.id]
      if (svc) onNodeClick(svc)
    },
    [serviceMap, onNodeClick],
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.3}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e2d45" />
      <Controls showInteractive={false} />
      <MiniMap
        nodeColor={(node) => {
          const data = node.data as { impactLevel?: RiskLevel }
          const level = data.impactLevel || 'none'
          return level === 'critical' ? '#ef4444'
            : level === 'high' ? '#f97316'
            : level === 'medium' ? '#eab308'
            : level === 'low' ? '#22c55e'
            : '#1e2d45'
        }}
        maskColor="rgba(8, 12, 20, 0.85)"
      />
    </ReactFlow>
  )
}
