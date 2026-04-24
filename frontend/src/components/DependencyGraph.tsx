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

const NODE_WIDTH = 220
const NODE_HEIGHT = 110

const PROTOCOL_COLORS: Record<string, string> = {
  grpc: '#6a95ff',
  http: '#5dd6ce',
  kafka: '#e7b255',
}

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 90, nodesep: 70, marginx: 48, marginy: 48 })

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
        const color = isImpactedEdge ? '#f27f74' : (PROTOCOL_COLORS[protocol] || '#6b7f98')

        return {
          id: `e-${i}-${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          animated: isImpactedEdge,
          style: { stroke: color, strokeWidth: isImpactedEdge ? 2.5 : 1.7, opacity: 0.82 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 12,
            height: 12,
          },
          label: edge.protocol !== 'http' ? edge.protocol : undefined,
          labelStyle: { fill: '#8ca0ba', fontSize: 10 },
          labelBgStyle: { fill: '#0b1728', opacity: 0.86 },
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
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.3}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={28} size={1.15} color="rgba(123, 156, 201, 0.16)" />
      <Controls showInteractive={false} />
      <MiniMap
        nodeColor={(node) => {
          const data = node.data as { impactLevel?: RiskLevel }
          const level = data.impactLevel || 'none'
          return level === 'critical' ? '#f27f74'
            : level === 'high' ? '#e7b255'
            : level === 'medium' ? '#d7c06f'
            : level === 'low' ? '#54c48f'
            : '#24364d'
        }}
        maskColor="rgba(6, 16, 29, 0.84)"
      />
    </ReactFlow>
  )
}
