import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Lock,
  PlayCircle,
  Save,
  Trash2,
  Unlock,
} from 'lucide-react';
import { detectCycleOnAddEdge } from '../lib/graphEngine.ts';
import type { ConceptWithProgress, PrerequisiteEdge } from '../types/learnpath.ts';
import { Button } from './ui/button.tsx';
import { cn, formatMinutes } from '../lib/utils.ts';

interface ConceptNodeData extends Record<string, unknown> {
  concept: ConceptWithProgress;
  isSelected: boolean;
  isActiveConcept: boolean;
  highlightRole: 'selected' | 'prereq' | 'dependent' | 'dimmed' | 'normal';
  editable: boolean;
}

function ConceptGraphNode({ data }: NodeProps<Node<ConceptNodeData>>) {
  const { concept, isSelected, isActiveConcept, highlightRole, editable } = data;

  const isMastered = concept.lock_state === 'mastered';
  const isLocked = concept.lock_state === 'locked';
  const isRetired = concept.lock_state === 'retired';

  let borderClass = 'border-slate-200 bg-white';
  let statusColor = 'text-[#2563EB]';
  let statusText = isActiveConcept ? 'Active' : 'Unlocked';
  let StatusIcon = isActiveConcept ? PlayCircle : Unlock;

  if (isRetired) {
    borderClass = 'border-dashed border-violet-300 bg-violet-50/70';
    statusColor = 'text-[#7C3AED]';
    statusText = concept.status === 'split' ? 'Split (History Preserved)' : 'Retired';
    StatusIcon = GitBranch;
  } else if (isMastered) {
    borderClass = 'border-emerald-300 bg-emerald-50/50';
    statusColor = 'text-[#059669]';
    statusText = 'Mastered';
    StatusIcon = CheckCircle2;
  } else if (isLocked) {
    borderClass = 'border-slate-300 bg-slate-50';
    statusColor = 'text-amber-700';
    statusText = 'Locked';
    StatusIcon = Lock;
  } else if (isActiveConcept) {
    borderClass = 'border-[#2563EB] bg-[#EFF4FF]';
  }

  if (isSelected) {
    borderClass = 'border-[#2563EB] bg-white ring-2 ring-[#2563EB]/25';
  } else if (highlightRole === 'prereq') {
    borderClass = 'border-[#7C3AED] bg-violet-50/40 ring-2 ring-[#7C3AED]/20';
  } else if (highlightRole === 'dependent') {
    borderClass = 'border-[#2563EB] bg-[#EFF4FF]/60 ring-2 ring-[#2563EB]/20';
  }

  return (
    <div
      className={cn(
        'w-[228px] rounded-xl border p-3.5 shadow-xs transition-all cursor-pointer select-none',
        borderClass,
        highlightRole === 'dimmed' && 'opacity-45',
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={cn(
          '!h-3 !w-3 !border-2 !border-white',
          editable ? '!bg-[#7C3AED]' : '!bg-slate-400',
        )}
      />

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold', statusColor)}>
          <StatusIcon className="h-3.5 w-3.5 shrink-0" />
          <span>{statusText}</span>
        </span>
        <span className="text-[11px] font-mono tabular-nums text-slate-500">
          {formatMinutes(concept.estimated_minutes)}
        </span>
      </div>

      <div className="font-display text-sm font-semibold text-[#0F172A] leading-snug line-clamp-2">
        {concept.title}
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 tabular-nums">
        <span className="capitalize">{concept.difficulty}</span>
        <span aria-hidden="true">·</span>
        <span>Pass {concept.passing_score}%</span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className={cn(
          '!h-3 !w-3 !border-2 !border-white',
          editable ? '!bg-[#2563EB]' : '!bg-slate-400',
        )}
      />
    </div>
  );
}

const nodeTypes = {
  conceptNode: ConceptGraphNode,
};

interface KnowledgeGraphCanvasProps {
  concepts: ConceptWithProgress[];
  prerequisites: PrerequisiteEdge[];
  selectedConceptId: string | null;
  activeConceptId?: string | null;
  editable?: boolean;
  onSelectConcept: (conceptId: string) => void;
  onAddPrerequisite?: (prerequisiteId: string, dependentId: string) => Promise<void>;
  onRemovePrerequisite?: (edgeId: string) => Promise<void>;
  onSavePositions?: (positions: Array<{ id: string; pos_x: number; pos_y: number }>) => Promise<void>;
}

export function KnowledgeGraphCanvas({
  concepts,
  prerequisites,
  selectedConceptId,
  activeConceptId,
  editable = false,
  onSelectConcept,
  onAddPrerequisite,
  onRemovePrerequisite,
  onSavePositions,
}: KnowledgeGraphCanvasProps) {
  const [showRetired, setShowRetired] = useState(false);
  const [cycleError, setCycleError] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [dirtyPositions, setDirtyPositions] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  const visibleConcepts = useMemo(
    () => (showRetired ? concepts : concepts.filter((c) => c.status === 'active')),
    [concepts, showRetired],
  );

  const visibleConceptIds = useMemo(
    () => new Set(visibleConcepts.map((c) => c.id)),
    [visibleConcepts],
  );

  const relatedSet = useMemo(() => {
    if (!selectedConceptId) return { prereqs: new Set<string>(), deps: new Set<string>() };
    const prereqs = new Set<string>();
    const deps = new Set<string>();
    for (const e of prerequisites) {
      if (e.dependent_concept_id === selectedConceptId) {
        prereqs.add(e.prerequisite_concept_id);
      }
      if (e.prerequisite_concept_id === selectedConceptId) {
        deps.add(e.dependent_concept_id);
      }
    }
    return { prereqs, deps };
  }, [prerequisites, selectedConceptId]);

  const initialNodes: Array<Node<ConceptNodeData>> = useMemo(() => {
    return visibleConcepts.map((c) => {
      let highlightRole: ConceptNodeData['highlightRole'] = 'normal';
      if (selectedConceptId) {
        if (c.id === selectedConceptId) highlightRole = 'selected';
        else if (relatedSet.prereqs.has(c.id)) highlightRole = 'prereq';
        else if (relatedSet.deps.has(c.id)) highlightRole = 'dependent';
        else highlightRole = 'dimmed';
      }

      return {
        id: c.id,
        type: 'conceptNode',
        position: { x: c.pos_x, y: c.pos_y },
        data: {
          concept: c,
          isSelected: c.id === selectedConceptId,
          isActiveConcept: c.id === activeConceptId,
          highlightRole,
          editable,
        },
        draggable: editable,
      };
    });
  }, [visibleConcepts, selectedConceptId, activeConceptId, relatedSet, editable]);

  const initialEdges: Edge[] = useMemo(() => {
    return prerequisites
      .filter(
        (e) =>
          visibleConceptIds.has(e.prerequisite_concept_id) &&
          visibleConceptIds.has(e.dependent_concept_id),
      )
      .map((e) => {
        const isIncoming = e.dependent_concept_id === selectedConceptId;
        const isOutgoing = e.prerequisite_concept_id === selectedConceptId;
        const isEdgeSelected = e.id === selectedEdgeId;

        let stroke = '#94A3B8';
        let strokeWidth = 1.75;
        if (isEdgeSelected) {
          stroke = '#DC2626';
          strokeWidth = 2.6;
        } else if (isIncoming) {
          stroke = '#7C3AED';
          strokeWidth = 2.4;
        } else if (isOutgoing) {
          stroke = '#2563EB';
          strokeWidth = 2.4;
        }

        return {
          id: e.id,
          source: e.prerequisite_concept_id,
          target: e.dependent_concept_id,
          type: 'smoothstep',
          animated: isIncoming || isOutgoing,
          style: { stroke, strokeWidth },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: stroke,
            width: 18,
            height: 18,
          },
        };
      });
  }, [prerequisites, visibleConceptIds, selectedConceptId, selectedEdgeId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const handleConnect = useCallback(
    async (connection: Connection) => {
      if (!editable || !onAddPrerequisite) return;
      if (!connection.source || !connection.target) return;

      setCycleError(null);
      const check = detectCycleOnAddEdge(
        concepts,
        prerequisites,
        connection.source,
        connection.target,
      );

      if (check.hasCycle) {
        setCycleError(
          check.explanation ||
            'Cannot add this prerequisite because it creates a learning cycle.',
        );
        return;
      }

      try {
        await onAddPrerequisite(connection.source, connection.target);
      } catch (err) {
        setCycleError((err as Error).message);
      }
    },
    [editable, onAddPrerequisite, concepts, prerequisites],
  );

  const handleSaveLayout = async () => {
    if (!onSavePositions) return;
    setSavingLayout(true);
    try {
      await onSavePositions(
        nodes.map((n) => ({
          id: n.id,
          pos_x: Math.round(n.position.x),
          pos_y: Math.round(n.position.y),
        })),
      );
      setDirtyPositions(false);
    } finally {
      setSavingLayout(false);
    }
  };

  const selectedEdgeMeta = useMemo(() => {
    if (!selectedEdgeId) return null;
    const edge = prerequisites.find((e) => e.id === selectedEdgeId);
    if (!edge) return null;
    const from = concepts.find((c) => c.id === edge.prerequisite_concept_id);
    const to = concepts.find((c) => c.id === edge.dependent_concept_id);
    return { edge, fromTitle: from?.title ?? '', toTitle: to?.title ?? '' };
  }, [selectedEdgeId, prerequisites, concepts]);

  const retiredCount = concepts.filter((c) => c.status !== 'active').length;

  return (
    <div className="space-y-3">
      {/* Toolbar & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5 font-medium text-[#059669]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Mastered
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-[#2563EB]">
            <Unlock className="h-3.5 w-3.5" />
            Unlocked
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
            <Lock className="h-3.5 w-3.5" />
            Locked
          </span>
          {selectedConceptId && (
            <>
              <span className="text-slate-300">|</span>
              <span className="text-[#7C3AED] font-medium">Violet: Direct Prerequisites</span>
              <span className="text-[#2563EB] font-medium">Blue: Dependent Concepts</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {retiredCount > 0 && (
            <Button
              type="button"
              variant={showRetired ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowRetired((s) => !s)}
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>{showRetired ? 'Hide Split/Retired' : `Show Retired (${retiredCount})`}</span>
            </Button>
          )}
          {editable && dirtyPositions && onSavePositions && (
            <Button type="button" size="sm" onClick={handleSaveLayout} disabled={savingLayout}>
              <Save className="h-3.5 w-3.5" />
              <span>{savingLayout ? 'Saving...' : 'Save Layout'}</span>
            </Button>
          )}
        </div>
      </div>

      {cycleError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
            <div>
              <p className="font-semibold">Prerequisite Rejected — Cycle Detected</p>
              <p className="text-xs text-red-700 mt-0.5">{cycleError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCycleError(null)}
            className="text-xs font-medium text-red-700 hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {editable && selectedEdgeMeta && onRemovePrerequisite && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <span>
            Selected Prerequisite Link:{' '}
            <strong>
              {selectedEdgeMeta.fromTitle} → {selectedEdgeMeta.toTitle}
            </strong>
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={async () => {
                await onRemovePrerequisite(selectedEdgeMeta.edge.id);
                setSelectedEdgeId(null);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove Link</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedEdgeId(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="h-[520px] w-full rounded-xl border border-slate-200 bg-[#FAFBFD] overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={() => {
            if (editable) {
              setDirtyPositions(true);
            }
          }}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onNodeClick={(_e, node) => {
            setSelectedEdgeId(null);
            onSelectConcept(node.id);
          }}
          onEdgeClick={(_e, edge) => {
            if (editable) {
              setSelectedEdgeId(edge.id);
            }
          }}
          fitView
          fitViewOptions={{ padding: 0.22 }}
          minZoom={0.4}
          maxZoom={1.6}
          nodesConnectable={editable}
          nodesDraggable={editable}
        >
          <Background color="#CBD5E1" gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => {
              const st = (n.data as ConceptNodeData)?.concept?.lock_state;
              if (st === 'mastered') return '#059669';
              if (st === 'locked') return '#94A3B8';
              if (st === 'retired') return '#7C3AED';
              return '#2563EB';
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
